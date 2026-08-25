/*
 * Cookie consent + Microsoft Clarity loader
 * - Umami (analytics quantitatif, cookie-less) : chargé toujours
 * - Clarity (session recording, cookies) : chargé UNIQUEMENT après acceptation
 * - Stocke le choix dans localStorage 12 mois
 *
 * Mode interne (25/08) : nos propres visites de test faussaient la mesure de ce
 * qu'on testait. Sur 20 sessions en 3 jours, 55 % de visiteurs récurrents, donc
 * une part importante était nous. Visiter n'importe quelle page avec ?interne=1
 * marque le navigateur comme interne : Clarity ne se charge plus et Umami est
 * désactivé via son opt-out officiel. ?interne=0 annule.
 *
 * Limite à connaître : le marquage vit dans le localStorage du navigateur. Il ne
 * suit ni le téléphone, ni la navigation privée, ni un autre profil. Chaque
 * appareil doit être marqué une fois.
 */
(function () {
  var STORAGE_KEY = 'gi_clarity_consent';
  var STORAGE_TS = 'gi_clarity_consent_ts';
  var INTERNE_KEY = 'gi_interne';
  var UMAMI_OFF_KEY = 'umami.disabled'; // clé d'opt-out lue par le traceur Umami à chaque envoi
  var TTL_MS = 365 * 24 * 60 * 60 * 1000; // 12 mois
  var CLARITY_ID = 'xlr1bp6yfz';
  // Memes hotes que le data-domains d'Umami : un hote qui ne merite pas d'etre
  // mesure par l'un ne merite pas de l'etre par l'autre.
  var HOTES_MESURES = ['globalicons.io', 'www.globalicons.io'];

  // Lit ?interne=1 / ?interne=0 dans l'URL et met à jour le marquage.
  // Retourne true si ce navigateur est marqué interne.
  function visiteInterne() {
    try {
      var v = null;
      var m = window.location.search.match(/[?&]interne=([01])(?:&|$)/);
      if (m) { v = m[1]; }

      if (v === '1') {
        localStorage.setItem(INTERNE_KEY, '1');
        localStorage.setItem(UMAMI_OFF_KEY, '1');
      } else if (v === '0') {
        localStorage.removeItem(INTERNE_KEY);
        localStorage.removeItem(UMAMI_OFF_KEY);
        return false;
      }

      if (localStorage.getItem(INTERNE_KEY) !== '1') return false;

      // Re-pose l'opt-out Umami à chaque page : si la clé a été effacée d'un côté
      // sans l'autre, les deux marquages se resynchronisent au lieu de diverger.
      localStorage.setItem(UMAMI_OFF_KEY, '1');
      return true;
    } catch (e) { return false; }
  }

  function readConsent() {
    try {
      var ts = parseInt(localStorage.getItem(STORAGE_TS) || '0', 10);
      if (ts && Date.now() - ts > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TS);
        return null;
      }
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) { return null; }
  }

  function writeConsent(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v);
      localStorage.setItem(STORAGE_TS, String(Date.now()));
    } catch (e) {}
  }

  function loadClarity() {
    if (!CLARITY_ID || CLARITY_ID === 'CLARITY_PROJECT_ID') return;
    // Sans ce garde, chaque test en local creait une vraie session dans Clarity,
    // avec son visiteur recurrent et sa profondeur de defilement. Umami y
    // echappait deja grace a son data-domains ; Clarity n'avait aucune
    // restriction, donc lui seul comptait nos allers-retours de developpement.
    if (HOTES_MESURES.indexOf(window.location.hostname) === -1) return;
    if (window.__clarityLoaded) return;
    window.__clarityLoaded = true;
    (function(c,l,a,r,i,t,y){
      c[a] = c[a] || function(){(c[a].q = c[a].q || []).push(arguments)};
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  function showBanner() {
    if (document.getElementById('cookie-banner')) return;
    var wrap = document.createElement('aside');
    wrap.id = 'cookie-banner';
    wrap.className = 'cookie-banner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Préférences cookies');
    wrap.innerHTML =
      '<div class="cookie-banner__text">' +
        'Nous utilisons des outils d\'analyse d\'audience pour améliorer votre expérience. ' +
        'La mesure d\'audience globale est anonymisée. ' +
        '<a href="/confidentialite.html">En savoir plus</a>.' +
      '</div>' +
      '<div class="cookie-banner__actions">' +
        '<button type="button" class="cookie-banner__btn cookie-banner__btn--refuse" id="cb-refuse">Refuser</button>' +
        '<button type="button" class="cookie-banner__btn cookie-banner__btn--accept" id="cb-accept">Accepter</button>' +
      '</div>';
    document.body.appendChild(wrap);

    requestAnimationFrame(function () {
      wrap.classList.add('is-visible');
    });

    document.getElementById('cb-accept').addEventListener('click', function () {
      writeConsent('accepted');
      loadClarity();
      hideBanner();
    });
    document.getElementById('cb-refuse').addEventListener('click', function () {
      writeConsent('refused');
      hideBanner();
    });
  }

  function hideBanner() {
    var el = document.getElementById('cookie-banner');
    if (!el) return;
    el.classList.remove('is-visible');
    setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 500);
  }

  function init() {
    // Visite interne : ni Clarity, ni Umami, ni banniere. Rien a demander a
    // quelqu'un qu'on ne mesure pas.
    if (visiteInterne()) return;

    var consent = readConsent();
    if (consent === 'accepted') { loadClarity(); return; }
    if (consent === 'refused') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

  init();
})();
