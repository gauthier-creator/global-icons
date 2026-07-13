const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SCANS_FILE)) fs.writeFileSync(SCANS_FILE, JSON.stringify({ scans: [] }, null, 2));
}

function loadAll() {
  ensureStore();
  return JSON.parse(fs.readFileSync(SCANS_FILE, 'utf8'));
}

function saveScan(scan) {
  const store = loadAll();
  store.scans.push(scan);
  if (store.scans.length > 60) store.scans = store.scans.slice(-60);
  fs.writeFileSync(SCANS_FILE, JSON.stringify(store, null, 2));
  return scan;
}

function getLatest() {
  const { scans } = loadAll();
  return scans[scans.length - 1] || null;
}

function getPrevious() {
  const { scans } = loadAll();
  return scans[scans.length - 2] || null;
}

function attachDeltas(latest, previous) {
  if (!previous) {
    return latest.keywords.map(k => ({ ...k, delta: null, previousPosition: null }));
  }
  const prevMap = new Map(previous.keywords.map(k => [k.query, k.position]));
  return latest.keywords.map(k => {
    const prev = prevMap.get(k.query);
    if (prev == null) return { ...k, delta: null, previousPosition: null };
    return { ...k, previousPosition: prev, delta: +(prev - k.position).toFixed(2) };
  });
}

module.exports = { loadAll, saveScan, getLatest, getPrevious, attachDeltas };
