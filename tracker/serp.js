// Source de données LIVE : positions Google réelles via l'API Serper.dev
// (compte gratuit sur serper.dev, 2500 requêtes offertes puis ~0,30 $/1000).
// Serper renvoie ~10 résultats par page et un champ `position` RELATIF à la page :
// on pagine donc jusqu'à MAX_PAGES et on calcule la position absolue, avec arrêt
// anticipé dès que globalicons.io est trouvé (économise les crédits).
const fs = require('fs');
const path = require('path');

const TARGET = 'globalicons.io';
const KEYWORDS_FILE = path.join(__dirname, 'keywords.json');
const SERPER_URL = 'https://google.serper.dev/search';
const MAX_PAGES = 3;                 // profondeur suivie : top ~30
const OUT = MAX_PAGES * 10 + 1;      // sentinelle : hors top 30 (= 31)

function loadKeywords() {
  const raw = JSON.parse(fs.readFileSync(KEYWORDS_FILE, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.keywords || [];
  return arr.map(k => (typeof k === 'string' ? k : k.query)).filter(Boolean);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function serperSearch(q, apiKey, page) {
  const body = { q, gl: 'fr', hl: 'fr', location: 'France' };
  if (page > 1) body.page = page;
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// Cherche globalicons.io à travers les pages 1..MAX_PAGES, position absolue, arrêt anticipé.
// Serper renvoie parfois des doublons entre pages : on déduplique par lien pour que le rang
// absolu reflète des résultats organiques UNIQUES.
async function rankFor(q, apiKey) {
  let rank = 0;
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await serperSearch(q, apiKey, page);
    const organic = data.organic || [];
    if (!organic.length) break;
    for (const item of organic) {
      if (!item.link || seen.has(item.link)) continue; // ignore les doublons inter-pages
      seen.add(item.link);
      rank++;
      let host = null;
      try { host = new URL(item.link).hostname.replace(/^www\./, ''); } catch (e) { /* skip */ }
      if (host && (host === TARGET || host.endsWith('.' + TARGET))) {
        return { position: rank, url: item.link };
      }
    }
    await sleep(300); // pacing doux entre pages
  }
  return { position: OUT, url: null };
}

// Lance un scan complet : renvoie le format attendu par store.js / le front.
async function runScan() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error('SERPER_API_KEY manquante (compte gratuit sur serper.dev, puis variable Railway)');
  const keywords = loadKeywords();
  const results = [];
  for (const q of keywords) {
    try {
      const { position, url } = await rankFor(q, apiKey);
      results.push({ query: q, position, url });
    } catch (e) {
      results.push({ query: q, position: OUT, url: null, error: e.message });
    }
    await sleep(300);
  }
  return {
    fetchedAt: new Date().toISOString(),
    source: 'serper',
    maxTracked: MAX_PAGES * 10,
    startDate: null,
    endDate: null,
    rangeDays: null,
    keywords: results
  };
}

module.exports = { runScan, loadKeywords, OUT, MAX_PAGES };
