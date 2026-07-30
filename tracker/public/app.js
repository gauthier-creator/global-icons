const state = { activeVertical: null, data: null };

const $ = (id) => document.getElementById(id);

function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' toast--' + kind : '');
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3500);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function posBadge(pos) {
  if (pos > 30) return '<span class="pos-badge pos-badge--out">&gt; 30</span>';
  const label = Number.isInteger(pos) ? String(pos) : pos.toFixed(1);
  let cls = 'pos-badge--out';
  if (pos <= 3) cls = 'pos-badge--top3';
  else if (pos <= 10) cls = 'pos-badge--top10';
  else if (pos <= 20) cls = 'pos-badge--top20';
  return `<span class="pos-badge ${cls}">${label}</span>`;
}

function deltaCell(delta) {
  if (delta === null) return '<span class="delta delta--new">nouveau</span>';
  if (Math.abs(delta) < 0.5) return '<span class="delta delta--flat">=</span>';
  if (delta > 0) return `<span class="delta delta--up">▲ ${delta.toFixed(1)}</span>`;
  return `<span class="delta delta--down">▼ ${Math.abs(delta).toFixed(1)}</span>`;
}

function renderTabs(groups) {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  const entries = Object.values(groups).filter(g => g.total > 0);
  entries.sort((a, b) => b.total - a.total);
  for (const g of entries) {
    const btn = document.createElement('button');
    btn.className = 'tab' + (g.id === state.activeVertical ? ' is-active' : '');
    btn.innerHTML = `${g.label}<span class="tab__count">${g.total}</span>`;
    btn.onclick = () => {
      state.activeVertical = g.id;
      renderTabs(groups);
      renderVertical(groups[g.id]);
    };
    tabs.appendChild(btn);
  }
}

function renderVertical(group) {
  const container = $('verticalView');
  if (!group) {
    container.innerHTML = '';
    return;
  }
  const kws = group.keywords;
  const total = group.total;

  const html = `
    <div class="section-title">
      <div>
        <h2>${group.label}</h2>
        <p>${group.description || ''}</p>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat__label">Mots-clés</div><div class="stat__value">${total}</div></div>
      <div class="stat stat--top3"><div class="stat__label">Top 3</div><div class="stat__value">${group.top3}<span class="stat__unit">/ ${total}</span></div></div>
      <div class="stat stat--top10"><div class="stat__label">Top 10</div><div class="stat__value">${group.top10}<span class="stat__unit">/ ${total}</span></div></div>
      <div class="stat"><div class="stat__label">Top 20</div><div class="stat__value">${group.top20}<span class="stat__unit">/ ${total}</span></div></div>
    </div>
    <table class="kw">
      <thead>
        <tr>
          <th>Mot-clé</th>
          <th class="num">Position</th>
          <th class="num">Δ vs scan préc.</th>
          <th>Page qui ranke</th>
        </tr>
      </thead>
      <tbody>
        ${kws.map(k => `
          <tr>
            <td class="query-cell" title="${k.query}">${k.query}</td>
            <td class="num">${posBadge(k.position)}</td>
            <td class="num">${deltaCell(k.delta)}</td>
            <td class="url-cell">${k.url ? `<a href="${k.url}" target="_blank" rel="noopener">${k.url.replace(/^https?:\/\/(www\.)?globalicons\.io/, '') || '/'}</a>` : '<span class="muted">—</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

async function loadData() {
  $('loadingState').hidden = false;
  $('verticalView').innerHTML = '';
  $('emptyState').hidden = true;
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    if (data.empty) {
      $('emptyState').hidden = false;
      $('metaLastScan').textContent = 'Aucun scan';
      $('metaTotal').textContent = '';
      return;
    }
    state.data = data;
    $('metaLastScan').textContent = `Dernier scan : ${fmtDate(data.scan.fetchedAt)}`;
    $('metaTotal').textContent = `${data.scan.totalKeywords} mots-clés suivis`;

    if (!state.activeVertical || !data.groups[state.activeVertical] || data.groups[state.activeVertical].total === 0) {
      const first = Object.values(data.groups).filter(g => g.total > 0).sort((a, b) => b.total - a.total)[0];
      state.activeVertical = first ? first.id : null;
    }
    renderTabs(data.groups);
    if (state.activeVertical) renderVertical(data.groups[state.activeVertical]);
  } catch (e) {
    toast('Erreur chargement : ' + e.message, 'error');
  } finally {
    $('loadingState').hidden = true;
  }
}

async function triggerScan() {
  const btn = $('scanBtn');
  btn.disabled = true;
  btn.textContent = 'Scan…';
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Scan échoué');
    toast(`Scan OK · ${data.scan.totalKeywords} mots-clés`, 'success');
    await loadData();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Re-scan';
  }
}

$('scanBtn').addEventListener('click', triggerScan);
loadData();

// ============ SEA (Google Ads) ============
const seaState = { loaded: false, data: null };
const eur = n => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const nb = n => (n || 0).toLocaleString('fr-FR');
const pc = n => (n || 0).toFixed(1) + '%';

function seaTable(title, cols, rows, rowFn) {
  if (!rows || !rows.length) {
    return `<div class="section-title"><h2>${title}</h2></div><p class="muted">Aucune donnée (campagnes en pause ou pas d'activité sur la période).</p>`;
  }
  return `<div class="section-title"><h2>${title}</h2></div>
    <table class="kw"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(rowFn).join('')}</tbody></table>`;
}

function renderSea(d) {
  const c = d.campagnes || [], k = d.mots_cles || [], t = d.termes_de_recherche || [], cv = d.conversions_par_action || [];
  const totCost = c.reduce((s, x) => s + x.cost_eur, 0), totClic = c.reduce((s, x) => s + x.clics, 0), totConv = c.reduce((s, x) => s + x.conversions, 0);
  $('seaView').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="stat__label">Campagnes</div><div class="stat__value">${c.length}</div></div>
      <div class="stat"><div class="stat__label">Dépensé (30j)</div><div class="stat__value">${eur(totCost)}</div></div>
      <div class="stat"><div class="stat__label">Clics</div><div class="stat__value">${nb(totClic)}</div></div>
      <div class="stat stat--top3"><div class="stat__label">Conversions (RDV)</div><div class="stat__value">${nb(totConv)}</div></div>
    </div>
    ${seaTable('Campagnes', [{label:'Campagne'},{label:'Statut'},{label:'Budget/j',num:1},{label:'Dépensé',num:1},{label:'Impr.',num:1},{label:'Clics',num:1},{label:'CTR',num:1},{label:'CPC moy.',num:1},{label:'Conv.',num:1},{label:'Coût/conv.',num:1},{label:'Tx conv.',num:1},{label:'IS',num:1},{label:'Budget perdu',num:1}], c, x => `
      <tr><td class="query-cell">${x.name||''}</td><td>${x.status||''}</td><td class="num">${eur(x.budget_jour_eur)}</td><td class="num">${eur(x.cost_eur)}</td><td class="num">${nb(x.impressions)}</td><td class="num">${nb(x.clics)}</td><td class="num">${pc(x.ctr)}</td><td class="num">${eur(x.cpc_moyen_eur)}</td><td class="num">${nb(x.conversions)}</td><td class="num">${eur(x.cost_par_conv_eur)}</td><td class="num">${pc(x.taux_conv)}</td><td class="num">${pc(x.taux_impression)}</td><td class="num">${pc(x.budget_perdu_impr)}</td></tr>`)}
    ${seaTable('Mots-clés (Quality Score)', [{label:'Mot-clé'},{label:'Corresp.'},{label:'QS',num:1},{label:'Impr.',num:1},{label:'Clics',num:1},{label:'Coût',num:1},{label:'CTR',num:1},{label:'CPC',num:1},{label:'Conv.',num:1}], k, x => `
      <tr><td class="query-cell">${x.mot_cle||''}</td><td>${x.correspondance||''}</td><td class="num">${x.quality_score==null?'—':x.quality_score}</td><td class="num">${nb(x.impressions)}</td><td class="num">${nb(x.clics)}</td><td class="num">${eur(x.cost_eur)}</td><td class="num">${pc(x.ctr)}</td><td class="num">${eur(x.cpc_moyen_eur)}</td><td class="num">${nb(x.conversions)}</td></tr>`)}
    ${seaTable('Termes de recherche réels', [{label:'Terme'},{label:'Campagne'},{label:'Impr.',num:1},{label:'Clics',num:1},{label:'Coût',num:1},{label:'Conv.',num:1}], t.slice(0, 50), x => `
      <tr><td class="query-cell">${x.terme||''}</td><td>${x.campagne||''}</td><td class="num">${nb(x.impressions)}</td><td class="num">${nb(x.clics)}</td><td class="num">${eur(x.cost_eur)}</td><td class="num">${nb(x.conversions)}</td></tr>`)}
    ${seaTable('Conversions par action (RDV pris vs Clic RDV)', [{label:'Action'},{label:'Conversions',num:1},{label:'Valeur',num:1}], cv, x => `
      <tr><td class="query-cell">${x.action||''}</td><td class="num">${nb(x.conversions)}</td><td class="num">${eur(x.valeur_eur)}</td></tr>`)}
  `;
}

async function loadSea(force) {
  $('seaLoading').hidden = false;
  try {
    const res = await fetch('/api/sea' + (force ? '?refresh=1' : ''));
    const data = await res.json();
    if (data.ok === false) { $('seaMetaInfo').textContent = 'Erreur de connexion Google Ads'; toast(data.error || 'Erreur SEA', 'error'); return; }
    seaState.data = data; seaState.loaded = true;
    const when = data.cachedAt ? fmtDate(data.cachedAt) : '—';
    $('seaMetaInfo').textContent = `Compte ${data.compte || ''} · période ${data.periode || ''} · maj ${when}${data.stale ? ' (cache, échec du refresh)' : ''}`;
    renderSea(data);
  } catch (e) {
    toast('Erreur SEA : ' + e.message, 'error');
  } finally {
    $('seaLoading').hidden = true;
  }
}

document.querySelectorAll('#modes .mode').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    document.querySelectorAll('#modes .mode').forEach(b => b.classList.toggle('is-active', b === btn));
    $('seoMode').hidden = mode !== 'seo';
    $('seaMode').hidden = mode !== 'sea';
    $('scanBtn').hidden = mode !== 'seo';
    $('seaRefreshBtn').hidden = mode !== 'sea';
    if (mode === 'sea' && !seaState.loaded) loadSea(false);
  });
});
$('seaRefreshBtn').addEventListener('click', () => loadSea(true));
