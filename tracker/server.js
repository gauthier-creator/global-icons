require('dotenv').config();
const express = require('express');
const basicAuth = require('basic-auth');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runScan, loadKeywords } = require('./serp');
const { fetchSea } = require('./googleads');
const { buildInternalEvent, dispatch, verifyCalendlySignature } = require('./conversions');
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

// --- Mesure conversion NEUTRE (endpoints PUBLICS, avant l'auth : appeles par le client et par Calendly) ---
// Un seul coeur, plusieurs regies (adaptateurs). Consentement obligatoire pour tout envoi d'identifiant.
// STAGING : sans adaptateur configure (Pixel/token absents), dispatch() ne fait que skip -> rien ne part.
function clientMeta(req) {
  return {
    client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
    client_user_agent: req.headers['user-agent']
  };
}

// Relais client (evenements navigateur type Lead formulaire). ClicRDV reste Pixel-only, ne passe pas ici.
app.post('/api/conversion', async (req, res) => {
  try {
    const b = req.body || {};
    const cm = clientMeta(req);
    const ev = buildInternalEvent({
      event_type: b.event_type, event_id: b.event_id, event_source_url: b.event_source_url,
      consent: b.consent === true,
      email: b.email, phone: b.phone, first_name: b.first_name, last_name: b.last_name, external_id: b.external_id,
      country: b.country, click_ids: b.click_ids, value: b.value, currency: b.currency,
      client_ip_address: cm.client_ip_address, client_user_agent: cm.client_user_agent
    });
    res.json({ ok: true, dispatched: await dispatch(ev) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Webhook Calendly (invitee.created) : la source serveur a fort EMQ pour "RDV pris".
// Les identifiants de clic + le consentement sont passes en champs caches (Q&A / UTM) et rejoues ici.
function calendlyFields(p) {
  const map = {};
  (p.questions_and_answers || []).forEach(qa => { if (qa && qa.question) map[String(qa.question).toLowerCase().trim()] = qa.answer; });
  const t = p.tracking || {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'salesforce_uuid'].forEach(k => { if (t[k]) map[k] = t[k]; });
  const pick = (...keys) => { for (const k of keys) { const v = map[k.toLowerCase()]; if (v) return v; } return undefined; };
  return {
    gclid: pick('gi_gclid', 'gclid'),
    fbc: pick('gi_fbc', 'fbc'),
    fbp: pick('gi_fbp', 'fbp'),
    li_fat_id: pick('gi_li_fat_id', 'li_fat_id'),
    consent: String(pick('gi_consent', 'consent') || '').toLowerCase() === 'granted'
  };
}

app.post('/api/calendly-webhook', async (req, res) => {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  const sigOk = verifyCalendlySignature(req.rawBody ? req.rawBody.toString() : '', req.headers['calendly-webhook-signature'], key);
  if (key && !sigOk) return res.status(401).json({ ok: false, error: 'signature Calendly invalide' });
  const kind = (req.body && req.body.event) || '';
  const p = (req.body && req.body.payload) || {};
  // Annulations : on logue en interne, on ne renvoie RIEN aux regies (Meta ne sait pas annuler une conv).
  if (kind === 'invitee.canceled') { console.log('[calendly] invitee.canceled (log interne, non transmis)'); return res.json({ ok: true, logged: 'canceled' }); }
  try {
    const f = calendlyFields(p);
    const name = String(p.name || '').trim();
    const inviteeUri = p.uri || ''; // URI de l'INVITE (unique par personne) -> event_id partage avec le Pixel
    const cm = clientMeta(req);
    const ev = buildInternalEvent({
      event_type: 'RDV pris',
      event_id: inviteeUri ? 'cal_' + require('crypto').createHash('sha1').update(inviteeUri).digest('hex').slice(0, 24) : undefined,
      event_time: Math.floor(Date.now() / 1000), // horodatage de la PRISE de RDV (invitee.created), pas la date du RDV
      consent: f.consent,
      email: p.email, first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' '), external_id: p.email,
      country: 'fr', click_ids: { gclid: f.gclid, fbc: f.fbc, fbp: f.fbp, li_fat_id: f.li_fat_id },
      value: 1000, currency: 'EUR',
      client_ip_address: cm.client_ip_address, client_user_agent: cm.client_user_agent
    });
    res.json({ ok: true, consent: f.consent, dispatched: await dispatch(ev) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
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
