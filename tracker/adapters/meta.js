// Adaptateur Meta (Conversions API). Consomme l'evenement INTERNE neutre et produit le format Meta.
// Secrets en env uniquement. Inerte (isConfigured=false) tant que Pixel/Dataset + token absents.
const GRAPH_VERSION = process.env.META_API_VERSION || 'v21.0';

// event_type interne -> event_name Meta
const EVENT_MAP = { 'RDV pris': 'Schedule', 'Lead': 'Lead', 'ClicRDV': 'InitiateCheckout' };

function isConfigured() {
  return !!(process.env.META_DATASET_ID && process.env.META_CAPI_TOKEN);
}

function buildUserData(ev, norm) {
  const u = ev.user || {};
  const ud = {};
  // PII hashee (le coeur a deja verifie le consentement avant d'appeler send)
  const em = norm.email(u.email); if (em) ud.em = [em];
  const ph = norm.phone(u.phone); if (ph) ud.ph = [ph];
  const fn = norm.name(u.first_name); if (fn) ud.fn = [fn];
  const ln = norm.name(u.last_name); if (ln) ud.ln = [ln];
  const ext = norm.id(u.external_id); if (ext) ud.external_id = [ext];
  const co = norm.country(u.country); if (co) ud.country = [co];
  // Signaux navigateur (non hashes) + identifiant de clic Meta
  if (ev.click_ids && ev.click_ids.fbc) ud.fbc = ev.click_ids.fbc;
  if (ev.click_ids && ev.click_ids.fbp) ud.fbp = ev.click_ids.fbp;
  if (u.client_ip_address) ud.client_ip_address = u.client_ip_address;
  if (u.client_user_agent) ud.client_user_agent = u.client_user_agent;
  return ud;
}

async function send(ev, { norm }) {
  const DATASET = process.env.META_DATASET_ID;
  const TOKEN = process.env.META_CAPI_TOKEN;
  const event = {
    event_name: EVENT_MAP[ev.event_type] || ev.event_type,
    event_time: ev.event_time,
    event_id: ev.event_id,                 // meme id que le Pixel client -> dedup
    action_source: 'website',              // la conversion a eu lieu sur le site (embed), l'envoi seul est serveur
    event_source_url: ev.event_source_url,
    user_data: buildUserData(ev, norm),
    ...(ev.value != null ? { custom_data: { currency: ev.currency || 'EUR', value: ev.value } } : {})
  };
  const body = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET}/events?access_token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta CAPI ${res.status} : ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

module.exports = { name: 'meta', isConfigured, send };
