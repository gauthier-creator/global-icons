#!/usr/bin/env node
// Publication automatique quotidienne (execute par GitHub Actions cron a 8h UTC / 10h CET).
// Kill switch : creer un fichier .publication-paused a la racine du repo.
// Idempotent : si la page est deja publiee (pas de meta noindex), skip.

import { readFile, writeFile, access, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const BASE_URL = 'https://www.globalicons.io';
const GSC_PROPERTY = 'https://www.globalicons.io/';
const INDEXNOW_KEY = 'e2f3a9b1c4d5e6f7a8b9c0d1e2f3a4b5';
const PAUSE_FLAG = '.publication-paused';
const SCHEDULE_PATH = 'scripts/publication-schedule.json';
const LOG_PATH = 'scripts/publication-log.json';
// Deploiement Railway (l'auto-deploy GitHub est casse : on deploie explicitement).
const RAILWAY_SERVICE = '8d5bdf9e-23f4-4e62-9d72-f3b2136c383f';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function todayParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

function fileToUrl(filePath) {
  const abs = `${BASE_URL}/${filePath}`;
  return abs.replace(/\/index\.html$/, '/');
}

async function updateSitemap(url, today) {
  const sitemap = await readFile('sitemap.xml', 'utf8');
  if (sitemap.includes(`<loc>${url}</loc>`)) {
    log('Sitemap: URL deja presente, skip');
    return sitemap;
  }
  const entry = `  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
  const updated = sitemap.replace('</urlset>', `${entry}</urlset>`);
  await writeFile('sitemap.xml', updated, 'utf8');
  log(`Sitemap: URL ajoutee (${url})`);
  return updated;
}

function b64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(scopes) {
  const raw = process.env.GSC_SA_KEY;
  if (!raw) return null;
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const toSign = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(toSign);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${toSign}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function callGoogleApis(url) {
  if (!process.env.GSC_SA_KEY) {
    log('GSC_SA_KEY absent, skip GSC/Indexing API');
    return;
  }
  try {
    const token = await getGoogleAccessToken([
      'https://www.googleapis.com/auth/indexing',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ]);
    // Indexing API : ATTENTION, Google n'honore officiellement cet endpoint que
    // pour JobPosting et BroadcastEvent. Pour du contenu editorial (nos guides),
    // un statut 200 ne declenche PAS l'indexation : elle depend du crawl naturel,
    // ou d'un "Demander une indexation" manuel dans la Search Console.
    const idxRes = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    });
    log(`Indexing API: ${idxRes.status} (non honore par Google pour du contenu, indexation reelle via crawl naturel ou demande manuelle GSC)${idxRes.status >= 400 ? ' ' + (await idxRes.text()).slice(0, 200) : ''}`);
    // URL Inspection API : verdict actuel
    const inspRes = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: GSC_PROPERTY, languageCode: 'fr-FR' }),
    });
    if (inspRes.status === 200) {
      const data = await inspRes.json();
      const verdict = data.inspectionResult?.indexStatusResult?.verdict || 'unknown';
      const coverage = data.inspectionResult?.indexStatusResult?.coverageState || 'unknown';
      log(`URL Inspection: verdict=${verdict}, coverage=${coverage}`);
      if (verdict !== 'PASS') {
        log(`ATTENTION: ${url} pas encore indexee (verdict=${verdict}). Action requise: "Demander une indexation" manuellement dans la Search Console (galexandrian@globalicons.io).`);
      }
    } else {
      log(`URL Inspection: ${inspRes.status} ${(await inspRes.text()).slice(0, 200)}`);
    }
  } catch (e) {
    log(`Google APIs error: ${e.message}`);
  }
}

async function pingIndexNow(url) {
  const endpoints = [
    `https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}`,
    `https://www.bing.com/indexnow?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { method: 'GET' });
      log(`IndexNow ${new URL(ep).host}: ${res.status}`);
    } catch (e) {
      log(`IndexNow ${new URL(ep).host} error: ${e.message}`);
    }
  }
}

async function appendLog(entry) {
  let log_ = [];
  try {
    log_ = JSON.parse(await readFile(LOG_PATH, 'utf8'));
  } catch {}
  log_.push(entry);
  await writeFile(LOG_PATH, JSON.stringify(log_, null, 2), 'utf8');
}

// Deploie la version courante sur Railway (upload du repo, .railwayignore respecte).
// Sans RAILWAY_TOKEN (ex : run local), on skip proprement.
function deployRailway() {
  if (!process.env.RAILWAY_TOKEN) {
    log('RAILWAY_TOKEN absent -> deploiement Railway SKIP (la page restera noindex en prod tant que non deployee !)');
    return false;
  }
  try {
    execSync(`railway up --service ${RAILWAY_SERVICE} --detach`, { stdio: 'inherit' });
    log('Railway: deploiement declenche');
    return true;
  } catch (e) {
    log(`Railway deploy ERREUR: ${e.message}`);
    return false;
  }
}

// Attend que la prod serve la page en version INDEXABLE (plus de meta noindex).
// Evite de pinger Google/Bing avant que le deploiement soit reellement live. Timeout ~4 min.
async function waitUntilLive(url) {
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 200) {
        const html = await res.text();
        if (!/name="robots"[^>]*noindex/i.test(html)) {
          log(`Page live et indexable apres ~${(i + 1) * 10}s`);
          return true;
        }
      }
    } catch { /* retry */ }
  }
  log('ATTENTION: timeout, la page n\'a pas ete confirmee indexable en prod (deploiement lent ou echoue).');
  return false;
}

async function main() {
  // Kill switch
  if (await fileExists(PAUSE_FLAG)) {
    log('Publication en pause (fichier .publication-paused trouve). Exit.');
    return;
  }

  const today = todayParis();
  log(`Date Paris: ${today}`);

  const { schedule } = JSON.parse(await readFile(SCHEDULE_PATH, 'utf8'));
  // Publication en FILE D'ATTENTE (1 page/jour, 7j/7) : on prend la PROCHAINE page encore
  // non publiee (meta noindex presente), dans l'ordre du planning, quel que soit le jour.
  // Le champ "date" du planning n'est plus utilise pour la selection (juste indicatif).
  let picked = null;
  for (const entry of schedule) {
    const fp = path.join(REPO_ROOT, entry.file);
    if (!(await fileExists(fp))) continue;
    const html = await readFile(fp, 'utf8');
    if (html.includes('name="robots"') && html.includes('noindex')) { picked = entry; break; }
  }
  // Repli : le planning a ete genere une fois pour 27 pages et s'epuise. Une page creee
  // apres coup n'y figure pas, donc elle serait invisible pour le pipeline et resterait en
  // brouillon indefiniment. On balaie donc le repo a la recherche de tout brouillon restant.
  if (!picked) {
    log('Planning epuise. Recherche de brouillons hors planning...');
    const orphelins = await trouverBrouillonsHorsPlanning(schedule);
    if (orphelins.length) {
      log(`${orphelins.length} brouillon(s) hors planning : ${orphelins.join(', ')}`);
      picked = { file: orphelins[0], cluster: 'hors-planning', tier: 'T2' };
    }
  }

  if (!picked) {
    log('File d\'attente vide : plus aucune page non publiee. Exit.');
    return;
  }
  await publishOne(picked, today);
}

// Pages legitimement en noindex, a ne JAMAIS publier.
const JAMAIS_PUBLIER = [
  'mentions-legales.html',
  'confidentialite.html',
  'risques.html',
];

// Une page exclue du serveur web par .railwayignore N'EST PAS un brouillon en
// attente : c'est une page volontairement non servie. La publier revient a lui
// retirer son noindex et a l'inscrire au sitemap, donc a declarer a Google une
// URL qui repond 404.
//
// C'est arrive les 14 et 15/08/2026 : le repli ci-dessus a publie deux pages de
// comparaison concurrent, dont une connue pour contenir un fait faux. Elles ont
// ete retirees du sitemap et remises en noindex.
//
// Regle : ne jamais publier ce que le serveur ne sert pas.
async function cheminsExclusDuServeur() {
  try {
    const brut = await readFile(path.join(REPO_ROOT, '.railwayignore'), 'utf8');
    return brut
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function estExcluDuServeur(rel, motifs) {
  return motifs.some((m) => {
    if (m.endsWith('/')) return rel.startsWith(m);
    if (m.startsWith('*.')) return rel.endsWith(m.slice(1));
    return rel === m || rel.startsWith(m + '/');
  });
}

async function trouverBrouillonsHorsPlanning(schedule) {
  const dejaPrevues = new Set(schedule.map((e) => e.file));
  const trouves = [];

  const motifsExclus = await cheminsExclusDuServeur();

  async function parcourir(rel) {
    const abs = path.join(REPO_ROOT, rel);
    let entrees;
    try { entrees = await readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const relEnfant = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (['.git', 'node_modules', 'tracker', 'scripts', 'docs'].includes(e.name)) continue;
        await parcourir(relEnfant);
      } else if (e.name.endsWith('.html')) {
        if (dejaPrevues.has(relEnfant)) continue;
        if (JAMAIS_PUBLIER.includes(relEnfant)) continue;
        if (estExcluDuServeur(relEnfant, motifsExclus)) continue;
        const html = await readFile(path.join(REPO_ROOT, relEnfant), 'utf8');
        if (html.includes('name="robots"') && html.includes('noindex')) trouves.push(relEnfant);
      }
    }
  }

  await parcourir('');
  return trouves.sort();
}

async function publishOne(entry, today) {
  log(`Page programmee: ${entry.file} (cluster ${entry.cluster}, tier ${entry.tier})`);

  const filePath = path.join(REPO_ROOT, entry.file);
  if (!(await fileExists(filePath))) {
    log(`ERREUR: fichier introuvable (${filePath})`);
    await appendLog({ date: today, file: entry.file, status: 'error', reason: 'file_not_found' });
    process.exit(1);
  }

  let html = await readFile(filePath, 'utf8');

  if (!html.includes('name="robots"') || !html.includes('noindex')) {
    log('Page deja publiee (pas de meta noindex). Skip.');
    await appendLog({ date: today, file: entry.file, status: 'skipped', reason: 'already_published' });
    return;
  }

  // Retrait meta noindex
  html = html.replace(/[ \t]*<meta name="robots" content="noindex[^"]*"\s*\/?>\s*\n?/g, '');
  await writeFile(filePath, html, 'utf8');
  log('Meta noindex retiree');

  // Update sitemap
  const url = fileToUrl(entry.file);
  await updateSitemap(url, today);

  // Ecrire log entry AVANT git add (sinon le fichier n'existe pas au 1er run)
  await appendLog({ date: today, file: entry.file, url, cluster: entry.cluster, tier: entry.tier, status: 'published' });

  // Git commit + push
  try {
    execSync('git config user.name "publish-bot"', { stdio: 'inherit' });
    execSync('git config user.email "publish-bot@globalicons.io"', { stdio: 'inherit' });
    execSync(`git add "${entry.file}" sitemap.xml scripts/publication-log.json`, { stdio: 'inherit' });
    execSync(`git commit -m "Publication auto ${today} : ${entry.file}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    log('Push main effectue');
  } catch (e) {
    log(`Erreur git: ${e.message}`);
    await appendLog({ date: today, file: entry.file, status: 'error', reason: 'git_failure' });
    process.exit(1);
  }

  // Deploiement Railway explicite (l'auto-deploy GitHub est casse), PUIS attente que la
  // page soit reellement live et indexable AVANT de pinger. Ordre : publie -> deploie ->
  // verifie live -> pinge. Evite de dire a Google "indexe" alors que la prod sert noindex.
  deployRailway();
  await waitUntilLive(url);
  await pingIndexNow(url);
  await callGoogleApis(url);

  log(`Termine : ${url}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
