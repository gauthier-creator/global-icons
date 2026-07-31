// Coeur NEUTRE de mesure de conversion (agnostique regie).
// UNE brique, plusieurs consommateurs : on normalise un evenement interne unique, puis on le
// dispatche vers des adaptateurs par regie (Meta aujourd'hui ; Google / LinkedIn = adaptateurs a venir).
// Regle unique et centrale : SANS consentement publicitaire, aucun identifiant personnel ne part
// vers une regie (on peut toujours logguer en interne). L'email/tel ne partent JAMAIS en clair.
const crypto = require('crypto');

const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Normalisations communes a toutes les regies (Meta, Google, LinkedIn hashent pareil : SHA-256).
const norm = {
  email: v => (v ? sha256(String(v).trim().toLowerCase()) : undefined),
  phone: v => {
    if (!v) return undefined;
    let p = String(v).replace(/[^\d+]/g, '');
    if (!p.startsWith('+')) p = '+33' + p.replace(/^0/, '');
    return sha256(p);
  },
  name: v => (v ? sha256(stripAccents(String(v).trim().toLowerCase())) : undefined),
  country: v => (v ? sha256(String(v).trim().toLowerCase().slice(0, 2)) : undefined),
  id: v => (v ? sha256(String(v).trim()) : undefined)
};

// Construit l'EVENEMENT INTERNE neutre a partir d'une entree brute (client relay ou webhook Calendly).
// Rien n'est hashe ici : on garde les valeurs brutes en interne, le hash se fait dans chaque adaptateur
// au moment de l'envoi (pour pouvoir aussi logguer/auditer en interne sans exposer les regies).
function buildInternalEvent(input) {
  const ci = input.click_ids || {};
  return {
    event_type: input.event_type,                 // 'Lead' | 'ClicRDV' | 'RDV pris'
    event_id: input.event_id,                       // deterministe (URI invite Calendly) pour dedup Pixel/CAPI
    event_time: input.event_time || Math.floor(Date.now() / 1000),
    event_source_url: input.event_source_url,
    consent: input.consent === true,                // consentement publicitaire au moment de l'action
    user: {
      email: input.email || undefined,
      phone: input.phone || undefined,
      first_name: input.first_name || undefined,
      last_name: input.last_name || undefined,
      external_id: input.external_id || input.email || undefined,
      country: input.country || 'fr',
      city: input.city || undefined,
      zip: input.zip || undefined,
      client_ip_address: input.client_ip_address || undefined,
      client_user_agent: input.client_user_agent || undefined
    },
    click_ids: {                                    // chaque regie consomme le sien
      gclid: ci.gclid || undefined,                 // Google Ads
      fbc: ci.fbc || undefined,                     // Meta (deja au format fb.1.ts.fbclid)
      fbp: ci.fbp || undefined,                     // Meta (cookie Pixel)
      li_fat_id: ci.li_fat_id || undefined          // LinkedIn
    },
    value: input.value,
    currency: input.currency || 'EUR'
  };
}

// Registre des adaptateurs par regie. On en ajoutera (google, linkedin) sans toucher au coeur.
const adapters = [require('./adapters/meta')];

// Dispatche l'evenement interne vers chaque adaptateur configure. Consentement = pre-requis strict.
async function dispatch(internalEvent) {
  const results = {};
  for (const a of adapters) {
    if (!a.isConfigured()) { results[a.name] = { skipped: 'non configure' }; continue; }
    if (!internalEvent.consent) { results[a.name] = { skipped: 'sans consentement (aucun identifiant envoye)' }; continue; }
    try { results[a.name] = { ok: true, res: await a.send(internalEvent, { norm, sha256 }) }; }
    catch (e) { results[a.name] = { ok: false, error: e.message }; }
  }
  return results;
}

// Verifie la signature d'un webhook Calendly (HMAC-SHA256 sur "{t}.{rawBody}").
function verifyCalendlySignature(rawBody, signatureHeader, signingKey) {
  if (!signingKey) return false;
  try {
    const parts = Object.fromEntries(String(signatureHeader || '').split(',').map(kv => kv.split('=')));
    const expected = crypto.createHmac('sha256', signingKey).update(parts.t + '.' + rawBody).digest('hex');
    return !!parts.v1 && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  } catch (e) { return false; }
}

module.exports = { buildInternalEvent, dispatch, verifyCalendlySignature, norm, sha256, adapters };
