/*
 * Disclaimer legal universel : injecte un bloc "avertissement risques + non-conseil"
 * juste avant le footer sur toutes les pages contenu financier.
 * - S'auto-injecte au chargement
 * - Ne s'affiche pas sur les pages purement legales (/mentions-legales, /confidentialite, /risques)
 * - Style discret cohere avec la DA (variables paper/ink/line)
 */
(function () {
  var EXCLUDED = ['/mentions-legales', '/confidentialite', '/risques'];

  function isExcluded() {
    var p = window.location.pathname;
    for (var i = 0; i < EXCLUDED.length; i++) {
      if (p.indexOf(EXCLUDED[i]) === 0) return true;
    }
    return false;
  }

  function alreadyInjected() {
    return !!document.getElementById('legal-footer');
  }

  function inject() {
    if (isExcluded() || alreadyInjected()) return;
    var footer = document.querySelector('footer.footer');
    if (!footer) return;

    var wrap = document.createElement('aside');
    wrap.id = 'legal-footer';
    wrap.className = 'legal-footer';
    wrap.setAttribute('role', 'complementary');
    wrap.setAttribute('aria-label', 'Avertissement legal');
    wrap.innerHTML =
      '<div class="legal-footer__inner">' +
        '<p class="legal-footer__lead"><strong>Avertissement.</strong> Ce contenu est publie a des fins d\'information generale. Il ne constitue ni un conseil en investissement financier personnalise (art. L. 541-1 CMF), ni un conseil fiscal, ni une recommandation de souscription a un produit d\'investissement.</p>' +
        '<ul class="legal-footer__points">' +
          '<li>L\'investissement dans les instruments presentes comporte un <strong>risque de perte partielle ou totale du capital</strong>. Les performances passees ne prejugent pas des performances futures.</li>' +
          '<li>Les produits presentes sont generalement <strong>illiquides</strong> sur un horizon de 3 a 7 ans, non garantis en capital, et reserves aux investisseurs eligibles apres due diligence individuelle.</li>' +
          '<li>Toute decision d\'investissement doit etre precedee d\'une analyse patrimoniale personnalisee avec votre CGP, expert-comptable ou avocat fiscaliste. Les elements chiffres (rendements cibles, TRI, fiscalite) sont indicatifs et dependent de votre situation individuelle.</li>' +
          '<li><strong>Global Icons n\'est ni assureur ni courtier en assurance et ne distribue aucun contrat d\'assurance-vie ou de capitalisation.</strong> Lorsque ces enveloppes sont evoquees, c\'est au titre des actifs susceptibles d\'y etre loges. La souscription et la gestion d\'un contrat relevent de votre assureur ou de votre intermediaire en assurance immatricule.</li>' +
          '<li>Global Icons distribue les operations de Foncière Renaissance dans un cadre reglemente. Voir les <a href="/risques.html">avertissements complets sur les risques</a> et les <a href="/mentions-legales.html">mentions legales</a>.</li>' +
        '</ul>' +
      '</div>';

    footer.parentNode.insertBefore(wrap, footer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
