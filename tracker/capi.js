// Meta Conversions API (CAPI) - envoi server-to-server, LECTURE des secrets en env uniquement.
// STAGING : tant que META_DATASET_ID / META_CAPI_TOKEN ne sont pas definis, sendEvents() leve une
// erreur claire (rien ne part). Consentement OBLIGATOIRE : sans consentement publicitaire, on
// n'envoie pas d'identifiants (et on ne pousse pas l'evenement). L'email ne part JAMAIS en clair.
const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_API_VERSION || 'v21.0';

const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Normalisations Meta puis hash SHA-256. Renvoie undefined si vide (pour ne pas envoyer de champ vide).
function hEmail(v) { if (!v) return undefined; return [sha256(String(v).trim().toLowerCase())]; }
function hPhone(v) { // format E.164 attendu ; on garde chiffres + eventuel +, sinon on prefixe FR
  if (!v) return undefined;
  let p = String(v).replace(/[^\d+]/g, '');
  if (!p.startsWith('+')) { p = p.replace(/^0/, ''); p = '+33' + p; }
  return [sha256(p)];
}
function hName(v) { if (!v) return undefined; return [sha256(stripAccents(String(v).trim().toLowerCase()))]; }
function hCountry(v) { if (!v) return undefined; return [sha256(String(v).trim().toLowerCase().slice(0, 2))]; }
function hId(v) { if (!v) return undefined; return [sha256(String(v).trim())]; }

// Construit le bloc user_data (PII hashee + signaux en clair). Ne met les PII QUE si consentement.
function buildUserData(u, consent) {
  const ud = {};
  if (consent) {
    Object.assign(ud, {
      em: hEmail(u.email),
      ph: hPhone(u.phone),
      fn: hName(u.first_name),
      ln: hName(u.last_name),
      external_id: hId(u.external_id),
      country: hCountry(u.country || 'fr'),
      ct: u.city ? [sha256(stripAccents(String(u.city).trim().toLowerCase()))] : undefined,
      zp: u.zip ? [sha256(String(u.zip).trim().toLowerCase())] : undefined
    });
  }
  // Signaux navigateur (non hashes) - utiles au matching, transmis meme structure
  if (u.fbc) ud.fbc = u.fbc;
  if (u.fbp) ud.fbp = u.fbp;
  if (u.client_ip_address) ud.client_ip_address = u.client_ip_address;
  if (u.client_user_agent) ud.client_user_agent = u.client_user_agent;
  // nettoie les undefined
  Object.keys(ud).forEach(k => ud[k] === undefined && delete ud[k]);
  return ud;
}

// Construit un evenement CAPI complet.
function buildEvent(ev) {
  return {
    event_name: ev.event_name,
    event_time: ev.event_time || Math.floor(Date.now() / 1000),
    event_id: ev.event_id, // deterministe (dedup Pixel+CAPI)
    action_source: ev.action_source || 'website',
    event_source_url: ev.event_source_url,
    user_data: buildUserData(ev.user_data || {}, ev.consent === true),
    ...(ev.custom_data ? { custom_data: ev.custom_data } : {})
  };
}

// Envoie 1..n evenements. Leve une erreur claire si non configure (staging).
async function sendEvents(events) {
  const DATASET = process.env.META_DATASET_ID; // = Pixel/Dataset ID
  const TOKEN = process.env.META_CAPI_TOKEN;
  if (!DATASET || !TOKEN) {
    throw new Error('Meta CAPI non configure (META_DATASET_ID / META_CAPI_TOKEN absents) - staging, rien envoye.');
  }
  const body = { data: events.map(buildEvent) };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET}/events?access_token=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta CAPI ${res.status} : ${JSON.stringify(data).slice(0, 300)}`);
  return data; // { events_received, fbtrace_id, ... }
}

// Verifie la signature d'un webhook Calendly (HMAC-SHA256 de {t},{body} avec la signing key).
function verifyCalendlySignature(rawBody, signatureHeader, signingKey) {
  if (!signingKey) return false;
  try {
    const parts = Object.fromEntries(String(signatureHeader || '').split(',').map(kv => kv.split('=')));
    const expected = crypto.createHmac('sha256', signingKey).update(parts.t + '.' + rawBody).digest('hex');
    return !!parts.v1 && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  } catch (e) { return false; }
}

module.exports = { sendEvents, buildEvent, buildUserData, verifyCalendlySignature, sha256, GRAPH_VERSION };
