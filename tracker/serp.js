// Source de données LIVE : positions Google réelles via l'API Serper.dev
// (compte gratuit sur serper.dev, 2500 requêtes offertes puis ~0,30 $/1000).
// Pour chaque mot-clé suivi, on récupère le top 100 organique et on trouve la
// position de globalicons.io. Un seul appel par mot-clé (pas de pagination).
const fs = require('fs');
const path = require('path');

const TARGET = 'globalicons.io';
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const SERPER_URL = 'https://google.serper.dev/search';
const NOT_FOUND = 101; // sentinelle : hors top 100

function loadKeywords() {
  const raw = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.keywords || [];
  // accepte soit ["mot cle", ...] soit [{query:"..."}]
  return arr.map(k => (typeof k === 'string' ? k : k.query)).filter(Boolean);
}

async function serperSearch(q, apiKey) {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: 'fr', hl: 'fr', location: 'France', num: 100 })
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Serper HTTP ${res.status} : ${body}`);
  }
  return res.json();
}

function findPosition(organic) {
  for (let i = 0; i < organic.length; i++) {
    let host;
    try {
      host = new URL(organic[i].link).hostname.replace(/^www\./, '');
    } catch (e) {
      continue;
    }
    if (host === TARGET || host.endsWith('.' + TARGET)) {
      return { position: organic[i].position || i + 1, url: organic[i].link };
    }
  }
  return { position: NOT_FOUND, url: null };
}

// Lance un scan complet : renvoie le même format qu'attendu par store.js / le front.
async function runScan() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error('SERPER_API_KEY manquante (compte gratuit sur serper.dev, puis variable Railway)');
  const keywords = loadKeywords();
  const results = [];
  for (const q of keywords) {
    try {
      const data = await serperSearch(q, apiKey);
      const { position, url } = findPosition(data.organic || []);
      results.push({ query: q, position, url });
    } catch (e) {
      // en cas d'erreur ponctuelle sur un mot-clé, on le marque hors top 100 sans casser le scan
      results.push({ query: q, position: NOT_FOUND, url: null, error: e.message });
    }
    await new Promise(r => setTimeout(r, 350)); // pacing doux
  }
  return {
    fetchedAt: new Date().toISOString(),
    source: 'serper',
    startDate: null,
    endDate: null,
    rangeDays: null,
    keywords: results
  };
}

module.exports = { runScan, loadKeywords, NOT_FOUND };
