#!/usr/bin/env node
// Publication automatique quotidienne (execute par GitHub Actions cron a 8h UTC / 10h CET).
// Kill switch : creer un fichier .publication-paused a la racine du repo.
// Idempotent : si la page est deja publiee (pas de meta noindex), skip.

import { readFile, writeFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const BASE_URL = 'https://www.globalicons.io';
const INDEXNOW_KEY = 'e2f3a9b1c4d5e6f7a8b9c0d1e2f3a4b5';
const PAUSE_FLAG = '.publication-paused';
const SCHEDULE_PATH = 'scripts/publication-schedule.json';
const LOG_PATH = 'scripts/publication-log.json';

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

async function main() {
  // Kill switch
  if (await fileExists(PAUSE_FLAG)) {
    log('Publication en pause (fichier .publication-paused trouve). Exit.');
    return;
  }

  const today = todayParis();
  log(`Date Paris: ${today}`);

  const { schedule } = JSON.parse(await readFile(SCHEDULE_PATH, 'utf8'));
  const entry = schedule.find(e => e.date === today);
  if (!entry) {
    log('Aucune page prevue pour aujourd\'hui. Exit.');
    return;
  }

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

  // Attente propagation Railway (30s), puis IndexNow
  await new Promise(r => setTimeout(r, 30000));
  await pingIndexNow(url);

  log(`Termine : ${url}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
