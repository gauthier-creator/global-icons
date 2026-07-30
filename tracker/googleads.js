// Accès Google Ads API en LECTURE SEULE (search/searchStream uniquement, jamais :mutate).
// Les credentials viennent EXCLUSIVEMENT des variables d'environnement (jamais du repo) :
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || '1913432498';
// La version de l'API Google Ads est dépréciée ~annuellement. On la résout dynamiquement :
// on essaie de la plus récente à la plus ancienne et on garde la première qui ne renvoie pas 404.
const VERSION_CANDIDATES = (process.env.GOOGLE_ADS_API_VERSION
  ? [process.env.GOOGLE_ADS_API_VERSION]
  : ['v22', 'v21', 'v20', 'v19', 'v18', 'v17']);
let cachedVersion = null;

function requireEnv() {
  const need = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'];
  const missing = need.filter(k => !process.env[k]);
  if (missing.length) throw new Error('Variables Google Ads manquantes : ' + missing.join(', '));
}

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth échoué : ' + JSON.stringify(data).slice(0, 200));
  return data.access_token;
}

function adsHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    'Content-Type': 'application/json'
  };
}

async function rawSearch(query, accessToken, version) {
  const url = `https://googleads.googleapis.com/${version}/customers/${CUSTOMER_ID}/googleAds:searchStream`;
  return fetch(url, { method: 'POST', headers: adsHeaders(accessToken), body: JSON.stringify({ query }) });
}

// Trouve la version d'API valide : première qui ne renvoie pas 404 (endpoint inexistant).
async function resolveVersion(accessToken) {
  if (cachedVersion) return cachedVersion;
  for (const v of VERSION_CANDIDATES) {
    const res = await rawSearch(Q.campaigns, accessToken, v);
    if (res.status !== 404) { cachedVersion = v; return v; }
  }
  throw new Error('Aucune version Google Ads API valide (toutes en 404) : ' + VERSION_CANDIDATES.join(','));
}

// Exécute une requête GAQL en lecture (searchStream). Renvoie un tableau plat de résultats.
async function gaql(query, accessToken) {
  const version = cachedVersion || (await resolveVersion(accessToken));
  const res = await rawSearch(query, accessToken, version);
  if (!res.ok) throw new Error(`Google Ads ${res.status} (${version}) : ${(await res.text()).slice(0, 300)}`);
  const data = await res.json(); // searchStream REST -> tableau de batches {results:[...]}
  const batches = Array.isArray(data) ? data : [data];
  return batches.flatMap(b => b.results || []);
}

const eur = micros => (micros ? Number(micros) / 1e6 : 0);
const pct = rate => (rate ? Number(rate) * 100 : 0);
const num = v => (v == null ? 0 : Number(v));

const Q = {
  campaigns: 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign',
  campaignMetrics: 'SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, metrics.conversions_from_interactions_rate, metrics.search_impression_share, metrics.search_budget_lost_impression_share FROM campaign WHERE segments.date DURING LAST_30_DAYS',
  keywords: 'SELECT campaign.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, ad_group_criterion.status FROM ad_group_criterion WHERE ad_group_criterion.type = KEYWORD AND ad_group_criterion.negative = FALSE',
  keywordMetrics: 'SELECT campaign.id, ad_group_criterion.criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS',
  searchTerms: 'SELECT campaign.name, ad_group.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.clicks DESC',
  daily: 'SELECT campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY segments.date',
  convActions: 'SELECT segments.conversion_action_name, metrics.all_conversions, metrics.all_conversions_value FROM customer WHERE segments.date DURING LAST_30_DAYS'
};

async function fetchSea() {
  requireEnv();
  const token = await getAccessToken();
  await resolveVersion(token); // résout la version UNE fois avant les requêtes parallèles
  const run = q => gaql(q, token);

  const [camps, campMx, kws, kwMx, terms, daily, conv] = await Promise.all([
    run(Q.campaigns), run(Q.campaignMetrics), run(Q.keywords), run(Q.keywordMetrics),
    run(Q.searchTerms), run(Q.daily), run(Q.convActions)
  ]);

  // index métriques campagne par id
  const mxById = new Map();
  for (const r of campMx) mxById.set(String(r.campaign.id), r.metrics || {});
  const campagnes = camps.map(r => {
    const m = mxById.get(String(r.campaign.id)) || {};
    return {
      id: String(r.campaign.id),
      name: r.campaign.name,
      status: r.campaign.status,
      channel: r.campaign.advertisingChannelType,
      budget_jour_eur: eur(r.campaignBudget && r.campaignBudget.amountMicros),
      cost_eur: eur(m.costMicros),
      impressions: num(m.impressions),
      clics: num(m.clicks),
      ctr: pct(m.ctr),
      cpc_moyen_eur: eur(m.averageCpc),
      conversions: num(m.conversions),
      cost_par_conv_eur: eur(m.costPerConversion),
      taux_conv: pct(m.conversionsFromInteractionsRate),
      taux_impression: pct(m.searchImpressionShare),
      budget_perdu_impr: pct(m.searchBudgetLostImpressionShare)
    };
  });

  // mots-clés : structure + métriques (join campaign.id + criterion_id)
  const kwMxByKey = new Map();
  for (const r of kwMx) kwMxByKey.set(String(r.campaign.id) + '/' + String(r.adGroupCriterion.criterionId), r.metrics || {});
  const mots_cles = kws.map(r => {
    const c = r.adGroupCriterion || {};
    const m = kwMxByKey.get(String(r.campaign.id) + '/' + String(c.criterionId)) || {};
    return {
      campagne: String(r.campaign.id),
      groupe: r.adGroup && r.adGroup.name,
      mot_cle: c.keyword && c.keyword.text,
      correspondance: c.keyword && c.keyword.matchType,
      quality_score: c.qualityInfo && c.qualityInfo.qualityScore != null ? Number(c.qualityInfo.qualityScore) : null,
      statut: c.status,
      impressions: num(m.impressions),
      clics: num(m.clicks),
      cost_eur: eur(m.costMicros),
      ctr: pct(m.ctr),
      cpc_moyen_eur: eur(m.averageCpc),
      conversions: num(m.conversions)
    };
  });

  const termes_de_recherche = terms.map(r => ({
    campagne: r.campaign && r.campaign.name,
    groupe: r.adGroup && r.adGroup.name,
    terme: r.searchTermView && r.searchTermView.searchTerm,
    impressions: num(r.metrics && r.metrics.impressions),
    clics: num(r.metrics && r.metrics.clicks),
    cost_eur: eur(r.metrics && r.metrics.costMicros),
    conversions: num(r.metrics && r.metrics.conversions)
  }));

  const serie_journaliere = daily.map(r => ({
    date: r.segments && r.segments.date,
    campagne: r.campaign && r.campaign.name,
    cost_eur: eur(r.metrics && r.metrics.costMicros),
    impressions: num(r.metrics && r.metrics.impressions),
    clics: num(r.metrics && r.metrics.clicks),
    conversions: num(r.metrics && r.metrics.conversions)
  }));

  const conversions_par_action = conv.map(r => ({
    action: r.segments && r.segments.conversionActionName,
    conversions: num(r.metrics && r.metrics.allConversions),
    valeur_eur: num(r.metrics && r.metrics.allConversionsValue)
  }));

  return {
    genere_le: new Date().toISOString(),
    periode: 'LAST_30_DAYS',
    compte: CUSTOMER_ID,
    note: 'Lecture seule via Google Ads API. Metriques a 0 tant que les campagnes sont en pause.',
    campagnes, mots_cles, termes_de_recherche, serie_journaliere, conversions_par_action
  };
}

module.exports = { fetchSea };
