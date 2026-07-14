/*
 * Signup modal : bouton "S'inscrire" -> choix CGP vs Investisseur
 * - CGP -> pro.app.globalicons.io
 * - Investisseur (family office, HNWI, particulier) -> app.globalicons.io
 * - Memoire du choix en localStorage : au prochain clic, redirection directe
 * - Reset choix : cliquer sur le petit lien "changer de profil" dans la modal
 */
(function () {
  var STORAGE_KEY = 'gi_signup_profile';
  var STORAGE_TS = 'gi_signup_profile_ts';
  var TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours
  var URL_CGP = 'https://pro.app.globalicons.io';
  var URL_INV = 'https://app.globalicons.io';

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
        writeProfile(profile);
        redirect(profile);
        closeModal();
      });
    }
  }

  function handleSignupClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var profile = readProfile();
    if (profile) {
      redirect(profile);
    } else {
      showModal();
    }
  }

  function attach() {
    var triggers = document.querySelectorAll('[data-signup]');
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].__signupBound) continue;
      triggers[i].__signupBound = true;
      triggers[i].addEventListener('click', handleSignupClick);
    }
  }

  // Expose reset pour dev / support
  window.giSignupReset = function () { clearProfile(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
