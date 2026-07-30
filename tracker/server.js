require('dotenv').config();
const express = require('express');
const basicAuth = require('basic-auth');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runScan, loadKeywords } = require('./serp');
const { fetchSea } = require('./googleads');
const { sendEvents, verifyCalendlySignature } = require('./capi');
const { groupKeywords, CONFIG } = require('./verticalize');
const { saveScan, getLatest, getPrevious, attachDeltas } = require('./store');

// Cache SEA (Google Ads) : evite de taper l'API a chaque page. Persiste dans DATA_DIR.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SEA_CACHE = path.join(DATA_DIR, 'sea_cache.json');
const SEA_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function readSeaCache() {
  try { return JSON.parse(fs.readFileSync(SEA_CACHE, 'utf8')); } catch (e) { return null; }
}
function writeSeaCache(obj) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SEA_CACHE, JSON.stringify(obj)); } catch (e) {}
}
async function refreshSea() {
  const data = await fetchSea();
  const wrapped = { cachedAt: new Date().toISOString(), data };
  writeSeaCache(wrapped);
  return wrapped;
}

const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS;

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// --- Meta CAPI (endpoints PUBLICS, avant l'auth basique : appeles par le client et par Calendly) ---
// STAGING : sans META_DATASET_ID / META_CAPI_TOKEN, sendEvents() renvoie une erreur "non configure"
// et rien ne part vers Meta. Le consentement publicitaire est obligatoire pour pousser des identifiants.
app.post('/api/meta/capi', async (req, res) => {
  try {
    const b = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    const event = {
      event_name: b.event_name,
      event_id: b.event_id,
      event_source_url: b.event_source_url,
      consent: b.consent === true,
      action_source: 'website',
      user_data: Object.assign({}, b.user_data, { client_ip_address: ip, client_user_agent: req.headers['user-agent'] }),
      custom_data: b.custom_data
    };
    const out = await sendEvents([event]);
    res.json({ ok: true, meta: out });
  } catch (e) {
    const staged = /non configure/.test(e.message || '');
    res.status(staged ? 200 : 500).json({ ok: false, staged, error: e.message });
  }
});

app.post('/api/meta/calendly-webhook', async (req, res) => {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  const sigOk = verifyCalendlySignature(req.rawBody ? req.rawBody.toString() : '', req.headers['calendly-webhook-signature'], key);
  if (key && !sigOk) return res.status(401).json({ ok: false, error: 'signature Calendly invalide' });
  try {
    const p = (req.body && req.body.payload) || {};
    const name = String(p.name || '').trim();
    const eventUri = p.event || p.uri || '';
    const event = {
      event_name: 'Schedule',
      event_id: eventUri ? 'cal_' + require('crypto').createHash('sha1').update(eventUri).digest('hex').slice(0, 24) : undefined,
      action_source: 'website',
      // Consentement cote serveur : a cabler (capture au booking). Par defaut on NE pousse PAS les PII.
      consent: p.ad_consent === true,
      user_data: { email: p.email, first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), country: 'fr', external_id: p.email },
      custom_data: { currency: 'EUR', value: 1000 }
    };
    const out = await sendEvents([event]);
    res.json({ ok: true, meta: out });
  } catch (e) {
    const staged = /non configure/.test(e.message || '');
    res.status(staged ? 200 : 500).json({ ok: false, staged, error: e.message });
  }
});

app.use((req, res, next) => {
  if (!AUTH_PASS) return next();
  const creds = basicAuth(req);
  if (!creds || creds.name !== AUTH_USER || creds.pass !== AUTH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Global Icons Tracker"');
    return res.status(401).send('Auth requise');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ verticals: CONFIG.verticals.map(v => ({ id: v.id, label: v.label, description: v.description })) });
});

app.get('/api/data', (req, res) => {
  const latest = getLatest();
  if (!latest) return res.json({ empty: true, message: 'Aucun scan encore. Cliquez sur Re-scan.' });
  const previous = getPrevious();
  const withDeltas = attachDeltas(latest, previous);
  const groups = groupKeywords(withDeltas);
  res.json({
    empty: false,
    scan: { fetchedAt: latest.fetchedAt, startDate: latest.startDate, endDate: latest.endDate, rangeDays: latest.rangeDays, totalKeywords: latest.keywords.length },
    previousScanAt: previous ? previous.fetchedAt : null,
    groups
  });
});

app.post('/api/scan', async (req, res) => {
  try {
    const scan = await runScan();
    saveScan(scan);
    res.json({ ok: true, scan: { fetchedAt: scan.fetchedAt, totalKeywords: scan.keywords.length } });
  } catch (err) {
    console.error('Scan failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Scan automatique quotidien à 07:00 UTC (09:00 Paris été)
cron.schedule('0 7 * * *', async () => {
  try {
    const scan = await runScan();
    saveScan(scan);
    console.log(`[cron] scan quotidien OK : ${scan.keywords.length} mots-cles a ${scan.fetchedAt}`);
  } catch (e) {
    console.error('[cron] scan quotidien ECHEC :', e.message);
  }
});

// --- SEA (Google Ads) : lecture seule, cache 6h ---
app.get('/api/sea', async (req, res) => {
  const force = req.query.refresh === '1';
  const cache = readSeaCache();
  const fresh = cache && (Date.now() - new Date(cache.cachedAt).getTime() < SEA_TTL_MS);
  if (fresh && !force) return res.json({ cachedAt: cache.cachedAt, cached: true, ...cache.data });
  try {
    const wrapped = await refreshSea();
    res.json({ cachedAt: wrapped.cachedAt, cached: false, ...wrapped.data });
  } catch (err) {
    console.error('SEA fetch failed:', err.message);
    if (cache) return res.json({ cachedAt: cache.cachedAt, cached: true, stale: true, error: err.message, ...cache.data });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Rafraichissement SEA automatique toutes les 6h
cron.schedule('0 */6 * * *', async () => {
  try { await refreshSea(); console.log('[cron] SEA refresh OK'); }
  catch (e) { console.error('[cron] SEA refresh ECHEC :', e.message); }
});

app.listen(PORT, () => {
  console.log(`Tracker listening on :${PORT} — ${loadKeywords().length} mots-cles suivis (source Serper.dev)`);
});
