/*
 * Cookie consent + Microsoft Clarity loader
 * - Umami (analytics quantitatif, cookie-less) : chargé toujours
 * - Clarity (session recording, cookies) : chargé UNIQUEMENT après acceptation
 * - Stocke le choix dans localStorage 12 mois
 */
(function () {
  var STORAGE_KEY = 'gi_clarity_consent';
  var STORAGE_TS = 'gi_clarity_consent_ts';
  var TTL_MS = 365 * 24 * 60 * 60 * 1000; // 12 mois
  var CLARITY_ID = 'CLARITY_PROJECT_ID';

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
