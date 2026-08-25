/*
 * Signup modal + tracking de conversion
 * - Bouton "S'inscrire" -> choix CGP vs Investisseur (CGP -> pro.app, Investisseur -> app)
 * - Memoire du choix en localStorage : au prochain clic, redirection directe
 * - TRACKING (via umami, deja charge sur toutes les pages). La POSITION est encodee dans
 *   le NOM de l'evenement (visible directement dans la liste Umami), ex : rdv_click_hero,
 *   cta_view_nav, signup_open_banner. pos et page_type restent aussi en proprietes.
 *   Evenements envoyes :
 *     rdv_click_<pos>     : clic sur un lien Calendly
 *     cta_view_<pos>      : un CTA est devenu visible >=50%  -> denominateur du CTR
 *     signup_open_<pos>   : ouverture de la modale S'inscrire
 *     signup_direct_<pos> : re-clic avec profil memorise      (+ prop profile)
 *     signup_choice       : choix CGP vs investisseur         (prop profile ; pas de position)
 *   <pos> = nav / hero / banner / mid-content / hub-final / content-final / partner-section /
 *   method-section / home-final / mobile-sticky / inline / other.
 *   CTR d'un emplacement = rdv_click_<pos> / cta_view_<pos>. page_type = type de contenu.
 */
(function () {
  var STORAGE_KEY = 'gi_signup_profile';
  var STORAGE_TS = 'gi_signup_profile_ts';
  var TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours
  var URL_CGP = 'https://pro.app.globalicons.io';
  var URL_INV = 'https://app.globalicons.io';

  // Deduit le TYPE de page a partir de l'URL, pour savoir quels contenus generent les RDV
  // (question SEO -> RDV). Ajoute automatiquement a chaque evenement.
  function pageType() {
    try {
      var p = location.pathname.toLowerCase();
      if (p === '/' || p === '/index.html') return 'home';
      if (p.indexOf('/guides/') === 0) return 'guide';
      if (p.indexOf('/glossaire/') === 0) return 'glossaire';
      if (p.indexOf('/villes/') === 0) return 'ville';
      if (p.indexOf('/analyses/') === 0) return 'analyse';
      if (p.indexOf('/comparatifs/') === 0) return 'comparatif';
      if (p.indexOf('/outils/') === 0) return 'outil';
      if (p.indexOf('/track-record/') === 0) return 'track-record';
      if (p.indexOf('/ressources/') === 0) return 'ressource';
      if (p.indexOf('/presse') === 0) return 'presse';
      if (p.indexOf('/equipe') === 0) return 'equipe';
      // Hubs persona (repertoires de 1er niveau dedies a un profil)
      if (/^\/(cgp|family-office|apport-cession|investir-immobilier-prime-des-1000-euros|assurance-vie-luxembourgeoise|club-deal-immobilier|vente-entreprise)\b/.test(p)) return 'hub';
      return 'autre';
    } catch (e) { return 'autre'; }
  }

  // --- Tracking helper (umami, best-effort, ne casse jamais si umami absent) ---
  // page_type est injecte sur CHAQUE evenement (rdv_click, cta_view, signup_*),
  // pour pouvoir croiser "type de contenu" x "emplacement" x "action" dans Umami.
  function track(name, data) {
    try {
      if (window.umami && typeof window.umami.track === 'function') {
        var payload = { page_type: pageType() };
        if (data) { for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k]; } }
        window.umami.track(name, payload);
      }
    } catch (e) {}
  }

  // Comme track(), mais encode la position DANS le nom de l'evenement (ex: rdv_click_hero,
  // cta_view_nav) pour distinguer les emplacements directement dans la liste Umami, sans
  // avoir a ouvrir les proprietes. pos (et page_type) restent aussi en proprietes.
  function trackAt(base, pos, extra) {
    var data = { pos: pos };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) data[k] = extra[k]; } }
    track(base + '_' + pos, data);
  }

  // Deduit la position d'un CTA a partir de ses classes (element + parent + section),
  // pour savoir OU sur la page l'internaute convertit. Beaucoup de CTA ne portent la
  // classe positionnelle que sur leur conteneur, d'ou la lecture du parent et de la section.
  function ctaPosition(el) {
    var own = el.className || '';
    var parent = (el.parentElement && el.parentElement.className) || '';
    var section = '';
    try { var s = el.closest && el.closest('section'); if (s) section = s.className || ''; } catch (e) {}
    var c = own + ' ' + parent + ' ' + section;
    if (/legal__nav-cta|nav__cta/.test(c)) return 'nav';
    if (/mobile-cta/.test(c)) return 'mobile-sticky';
    if (/hero__cta/.test(c)) return 'hero';
    if (/banner-cta/.test(c)) return 'banner';
    if (/mid-cta/.test(c)) return 'mid-content';
    if (/hub__final-cta/.test(c)) return 'hub-final';
    if (/content__cta/.test(c)) return 'content-final';
    if (/distrib__cta/.test(c)) return 'partner-section';
    if (/methode__cta/.test(c)) return 'method-section';
    if (/cta__inner/.test(c)) return 'home-final';
    if (/stats__cta|sol__link/.test(c)) return 'inline';
    return 'other';
  }

  function readProfile() {
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

  function writeProfile(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v);
      localStorage.setItem(STORAGE_TS, String(Date.now()));
    } catch (e) {}
  }

  function clearProfile() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_TS);
    } catch (e) {}
  }

  function redirect(profile) {
    var url = profile === 'cgp' ? URL_CGP : URL_INV;
    window.open(url, '_blank', 'noopener');
  }

  function closeModal() {
    var el = document.getElementById('signup-modal');
    if (!el) return;
    el.classList.remove('is-visible');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 200);
  }

  function showModal() {
    if (document.getElementById('signup-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'signup-modal';
    wrap.className = 'signup-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'S\'inscrire');
    wrap.innerHTML =
      '<div class="signup-modal__backdrop"></div>' +
      '<div class="signup-modal__box">' +
        '<button type="button" class="signup-modal__close" aria-label="Fermer">×</button>' +
        '<h2 class="signup-modal__title">S\'inscrire sur Global Icons</h2>' +
        '<p class="signup-modal__lead">Choisissez votre profil pour accéder à l\'espace adapté.</p>' +
        '<div class="signup-modal__choices">' +
          '<button type="button" class="signup-modal__choice" data-profile="investor">' +
            '<span class="signup-modal__choice-title">Je suis investisseur</span>' +
            '<span class="signup-modal__choice-sub">Family office, HNWI, particulier</span>' +
            '<span class="signup-modal__choice-arrow">→</span>' +
          '</button>' +
          '<button type="button" class="signup-modal__choice" data-profile="cgp">' +
            '<span class="signup-modal__choice-title">Je suis CGP</span>' +
            '<span class="signup-modal__choice-sub">Conseiller en gestion de patrimoine</span>' +
            '<span class="signup-modal__choice-arrow">→</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    requestAnimationFrame(function () { wrap.classList.add('is-visible'); });

    wrap.querySelector('.signup-modal__backdrop').addEventListener('click', closeModal);
    wrap.querySelector('.signup-modal__close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    var choices = wrap.querySelectorAll('.signup-modal__choice');
    for (var i = 0; i < choices.length; i++) {
      choices[i].addEventListener('click', function () {
        var profile = this.getAttribute('data-profile');
        track('signup_choice', { profile: profile });
        writeProfile(profile);
        redirect(profile);
        closeModal();
      });
    }
  }

  // --- Impressions CTA (denominateur du CTR) ---
  // cta_view(pos) = nb de pageviews ou un CTA de cette position est devenu visible (>= 50%).
  // Dedupe par position : le CTR d'un emplacement = rdv_click(pos) / cta_view(pos).
  // Sert aussi de signal "le visiteur a scrolle jusqu'au CTA".
  var _seenPos = {};
  var _io = null;
  function fireView(pos) {
    if (_seenPos[pos]) return;
    _seenPos[pos] = true;
    trackAt('cta_view', pos);
  }
  function ctaObserver() {
    if (_io) return _io;
    if (typeof IntersectionObserver === 'undefined') return null;
    _io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        fireView(ctaPosition(entries[i].target));
        _io.unobserve(entries[i].target);
      }
    }, { threshold: 0.5 });
    return _io;
  }
  function observeCta(el) {
    if (el.__ctaObserved) return;
    el.__ctaObserved = true;
    var io = ctaObserver();
    if (io) io.observe(el);
    else fireView(ctaPosition(el)); // fallback navigateurs sans IntersectionObserver
  }

  function handleSignupClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var profile = readProfile();
    if (profile) {
      trackAt('signup_direct', ctaPosition(e.currentTarget), { profile: profile });
      redirect(profile);
    } else {
      trackAt('signup_open', ctaPosition(e.currentTarget));
      showModal();
    }
  }


  /* ------------------------------------------------------------------
     Prise de RDV en POPUP Calendly, et non en nouvel onglet.

     Un lien vers calendly.com ouvre un onglet : la reservation se produit
     alors sur une AUTRE ORIGINE, et l'evenement calendly.event_scheduled
     ne revient jamais vers nous. La conversion "RDV pris" etait donc
     inatteignable pour quiconque passait par un CTA, sur 141 pages sur 142.

     La popup s'affiche par-dessus notre page : l'evenement remonte et la
     conversion se declenche. C'est la seule facon de mesurer une
     reservation issue d'un bouton.

     Le script Calendly est charge a la demande, au premier clic, pour ne
     pas alourdir les 130 pages qui ne le portaient pas.
     ------------------------------------------------------------------ */
  var CAL_CSS = 'https://assets.calendly.com/assets/external/widget.css';
  var CAL_JS = 'https://assets.calendly.com/assets/external/widget.js';
  var calChargement = null;

  function chargerCalendly() {
    if (window.Calendly) return Promise.resolve();
    if (calChargement) return calChargement;
    calChargement = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[href="' + CAL_CSS + '"]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = CAL_CSS;
        document.head.appendChild(l);
      }
      var sc = document.createElement('script');
      sc.src = CAL_JS;
      sc.async = true;
      sc.onload = function () { resolve(); };
      sc.onerror = function () { reject(new Error('calendly')); };
      document.head.appendChild(sc);
    });
    return calChargement;
  }

  function ouvrirPopupRdv(url) {
    return chargerCalendly().then(function () {
      if (window.Calendly && typeof window.Calendly.initPopupWidget === 'function') {
        window.Calendly.initPopupWidget({ url: url });
        return true;
      }
      return false;
    });
  }

  /* Conversion "RDV pris". L'evenement remonte de la popup comme de l'embed.
     Les pages qui portent deja un embed inline ont leur propre ecouteur : on
     ne branche pas le notre, sinon la conversion partirait en double. */
  function brancherConversionRdv() {
    if (window.__giRdvConversionBound) return;
    if (document.querySelector('.calendly-inline-widget')) return;
    window.__giRdvConversionBound = true;
    window.addEventListener('message', function (e) {
      if (!e.data || typeof e.data.event !== 'string') return;
      if (e.data.event !== 'calendly.event_scheduled') return;
      track('rdv_pris', { source: 'popup' });
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to: 'AW-18329831877/Eol3CO-wuNgcEMWTrKRE', value: 1000.0, currency: 'EUR'
        });
      }
    });
  }

  // Attache le tracking a tous les liens Calendly (prise de RDV), sans changer leur comportement
  function attachRdvTracking() {
    var links = document.querySelectorAll('a[href*="calendly.com"]');
    for (var i = 0; i < links.length; i++) {
      observeCta(links[i]); // impression (denominateur du CTR), meme si deja bound
      if (links[i].__rdvBound) continue;
      links[i].__rdvBound = true;
      links[i].addEventListener('click', function (e) {
        trackAt('rdv_click', ctaPosition(e.currentTarget));
        // Micro-conversion Google Ads "Clic RDV". No-op si gtag absent ; le respect du
        // consentement est gere en amont par Consent Mode (ad_storage denied par defaut).
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'conversion', { send_to: 'AW-18329831877/RPFKCNz_x9gcEMWTrKRE' });
        }
        // Clic milieu ou avec modificateur : on laisse le navigateur ouvrir un onglet.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        var url = e.currentTarget.getAttribute('href');
        if (!url) return;
        e.preventDefault();
        ouvrirPopupRdv(url).then(function (ok) {
          if (!ok) window.open(url, '_blank', 'noopener');
        }).catch(function () {
          window.open(url, '_blank', 'noopener');
        });
      });
    }
  }

  function attach() {
    var triggers = document.querySelectorAll('[data-signup]');
    for (var i = 0; i < triggers.length; i++) {
      observeCta(triggers[i]); // impression (denominateur du CTR)
      if (triggers[i].__signupBound) continue;
      triggers[i].__signupBound = true;
      triggers[i].addEventListener('click', handleSignupClick);
    }
    attachRdvTracking();
  }

  // Expose reset pour dev / support
  window.giSignupReset = function () { clearProfile(); };

  // ---- Banniere de consentement cookies (Google Ads / Consent Mode v2) ----
  // Ne s'affiche que sur les pages porteuses du tag (window.__giAds pose par le <head>).
  function consentUpdate(granted) {
    if (typeof window.gtag !== 'function') return;
    var v = granted ? 'granted' : 'denied';
    window.gtag('consent', 'update', {
      ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v
    });
  }
  function consentGet() { try { return localStorage.getItem('gi_consent'); } catch (e) { return null; } }
  function consentStore(v) { try { localStorage.setItem('gi_consent', v); } catch (e) {} }
  function showConsentBanner() {
    if (document.getElementById('gi-consent')) return;
    if (!document.getElementById('gi-consent-style')) {
      var st = document.createElement('style');
      st.id = 'gi-consent-style';
      st.textContent = '.gi-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;background:#fff;color:#151514;border:1px solid rgba(21,21,20,.14);border-radius:16px;box-shadow:0 18px 48px -18px rgba(15,15,14,.4);padding:20px 22px;font-family:"Hanken Grotesk",-apple-system,Arial,sans-serif;}.gi-consent__t{font-size:.9rem;line-height:1.55;margin:0 0 14px;}.gi-consent__t a{color:#151514;text-decoration:underline;text-underline-offset:2px;}.gi-consent__row{display:flex;gap:10px;flex-wrap:wrap;}.gi-consent__btn{flex:1 1 auto;min-width:130px;padding:11px 18px;border-radius:999px;font-size:.9rem;font-family:inherit;cursor:pointer;border:1px solid #151514;transition:opacity .2s,background .2s;}.gi-consent__btn--refuse{background:transparent;color:#151514;}.gi-consent__btn--refuse:hover{background:rgba(21,21,20,.05);}.gi-consent__btn--accept{background:#0f0f0e;color:#fff;}.gi-consent__btn--accept:hover{opacity:.88;}@media(max-width:480px){.gi-consent{left:10px;right:10px;bottom:10px;padding:18px;}}';
      document.head.appendChild(st);
    }
    var w = document.createElement('div');
    w.className = 'gi-consent';
    w.id = 'gi-consent';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-label', 'Consentement aux cookies');
    w.innerHTML = '<p class="gi-consent__t">Nous utilisons des cookies de mesure publicitaire (Google Ads) pour évaluer et améliorer nos campagnes. Vous pouvez les accepter ou les refuser. Voir notre <a href="/confidentialite.html">politique de confidentialité</a>.</p><div class="gi-consent__row"><button type="button" class="gi-consent__btn gi-consent__btn--refuse">Refuser</button><button type="button" class="gi-consent__btn gi-consent__btn--accept">Accepter</button></div>';
    document.body.appendChild(w);
    w.querySelector('.gi-consent__btn--accept').addEventListener('click', function () {
      consentUpdate(true); consentStore('granted'); w.remove();
    });
    w.querySelector('.gi-consent__btn--refuse').addEventListener('click', function () {
      consentUpdate(false); consentStore('denied'); w.remove();
    });
  }
  function initConsent() {
    if (!window.__giAds) return;            // pas de tag Ads sur cette page -> pas de banniere
    var c = consentGet();
    if (c === 'granted') { consentUpdate(true); return; }  // deja accepte -> reapplique
    if (c === 'denied') { return; }                        // deja refuse -> reste denied
    showConsentBanner();                                   // pas encore de choix -> demande
  }

  function boot() { attach(); brancherConversionRdv(); initConsent(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
