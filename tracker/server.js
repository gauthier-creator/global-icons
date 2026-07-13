require('dotenv').config();
const express = require('express');
const basicAuth = require('basic-auth');
const path = require('path');
const { fetchQueries } = require('./gsc');
const { groupKeywords, CONFIG } = require('./verticalize');
const { saveScan, getLatest, getPrevious, attachDeltas } = require('./store');

const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS;

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

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
  const rangeDays = Math.min(90, Math.max(1, parseInt(req.body?.rangeDays || '30', 10)));
  try {
    const scan = await fetchQueries({ rangeDays, rowLimit: 1500 });
    saveScan(scan);
    res.json({ ok: true, scan: { fetchedAt: scan.fetchedAt, startDate: scan.startDate, endDate: scan.endDate, totalKeywords: scan.keywords.length } });
  } catch (err) {
    console.error('Scan failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tracker listening on :${PORT}`);
});
