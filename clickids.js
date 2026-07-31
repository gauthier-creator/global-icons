/*
 * Capture des identifiants de clic publicitaire (multi-régie) + injection Calendly.
 * STAGING — NON CÂBLÉ sur les pages, NON DÉPLOYÉ. En attente : Pixel/comptes régie, config
 * Calendly (champs cachés / questions), et go de Gauthier + revue RGPD.
 *
 * Rôle :
 *  1) À l'arrivée sur une landing, capter gclid (Google), fbclid->fbc (Meta), _fbp (cookie Pixel Meta),
 *     li_fat_id (LinkedIn), et les persister (localStorage first-party) pour survivre landing -> Calendly.
 *  2) Au moment d'ouvrir Calendly, injecter ces identifiants + l'état de consentement en CHAMPS CACHÉS,
 *     que le webhook serveur rejoue ensuite vers la bonne régie (consentement-gated côté serveur).
 *
 * Convention de noms (alignée avec le backend /api/calendly-webhook) :
 *   gi_gclid, gi_fbc, gi_fbp, gi_li_fat_id, gi_consent (granted|denied)
 * Consentement : on n'INJECTE les identifiants personnels vers Calendly que si consentement publicitaire.
 * gi_consent est toujours transmis (auditable). Le serveur revérifie de toute façon.
 */
(function () {
  'use strict';
  var KEY = 'gi_clickids';

  function getParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  // Consentement publicitaire (écrit par la bannière, cf. signup-modal.js : localStorage 'gi_consent')
  function consentGranted() { try { return localStorage.getItem('gi_consent') === 'granted'; } catch (e) { return false; } }

  // Capture à l'arrivée : merge sans écraser un identifiant déjà connu par une valeur vide.
  function capture() {
    var cur = load();
    var gclid = getParam('gclid');
    var fbclid = getParam('fbclid');
    var li = getParam('li_fat_id');
    var fbp = getCookie('_fbp');
    if (gclid) cur.gi_gclid = gclid;
    if (fbclid) cur.gi_fbc = 'fb.1.' + Date.now() + '.' + fbclid; // format fbc attendu par Meta
    if (li) cur.gi_li_fat_id = li;
    if (fbp) cur.gi_fbp = fbp; // le cookie _fbp n'existe que si le Pixel est chargé (donc après consentement)
    save(cur);
    return cur;
  }

  // Renvoie les champs cachés à passer à Calendly (identifiants perso seulement si consentement).
  function calendlyFields() {
    var ids = load();
    var granted = consentGranted();
    var out = { gi_consent: granted ? 'granted' : 'denied' };
    if (granted) {
      ['gi_gclid', 'gi_fbc', 'gi_fbp', 'gi_li_fat_id'].forEach(function (k) { if (ids[k]) out[k] = ids[k]; });
    }
    return out;
  }

  capture();
  // Exposé pour l'intégration Calendly (embed prefill.customAnswers ou params de lien),
  // à brancher au moment du déploiement une fois les questions cachées créées côté Calendly.
  window.giClickIds = { capture: capture, calendlyFields: calendlyFields, consentGranted: consentGranted };
})();
