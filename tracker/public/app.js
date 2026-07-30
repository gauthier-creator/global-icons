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
