/* ============================================================
   GLOBAL ICONS — interactions (DA Osmose)
   Lenis smooth scroll · split-text · parallaxe · magnétique · curseur
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- année footer ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ============================================================
     SPLIT TEXT — découpe en mots masqués (lancé avant le loader)
     ============================================================ */
  function splitNode(node, ctx) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const toks = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        toks.forEach((tok) => {
          if (tok === "") return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span"); w.className = "word";
          const inner = document.createElement("span"); inner.className = "word__in";
          inner.textContent = tok;
          inner.style.setProperty("--wd", (ctx.i++ * 0.045) + "s");
          w.appendChild(inner); frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) {
        splitNode(child, ctx);
      }
    });
  }
  const splitEls = $$("[data-split-text]");
  if (!reduce) splitEls.forEach((el) => splitNode(el, { i: 0 }));

  /* ============================================================
     LENIS — smooth scroll
     ============================================================ */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    lenis.stop();

    /* ancres internes via Lenis */
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (id === "#" || id === "#top") { e.preventDefault(); lenis.scrollTo(0); return; }
        const target = document.querySelector(id);
        if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: 0 }); }
      });
    });
  }
  const getScroll = () => (lenis ? lenis.scroll : window.scrollY);

  /* ============================================================
     LOADER
     ============================================================ */
  const loader = $("#loader");
  const logoFill = $("#loaderLogoFill");
  const count = $("#loaderCount");
  const setFill = (p) => { if (logoFill) logoFill.style.clipPath = "inset(0 " + (100 - p) + "% 0 0)"; };
  document.body.classList.add("is-loading");

  function finishLoad() {
    document.body.classList.remove("is-loading");
    if (lenis) lenis.start();
    loader.classList.add("is-done");
    initReveals();
    setTimeout(() => loader && loader.remove(), 1150);
  }

  if (reduce) {
    setFill(100);
    if (count) count.textContent = "100";
    splitEls.forEach((el) => el.classList.add("is-in"));
    setTimeout(finishLoad, 250);
  } else {
    let p = 0;
    const tick = setInterval(() => {
      p += Math.random() * 8 + 3;
      if (p >= 100) { p = 100; clearInterval(tick); }
      setFill(p);
      if (count) count.textContent = Math.floor(p);
      if (p === 100) setTimeout(finishLoad, 520);
    }, 130);
  }

  /* ============================================================
     NAV au scroll + menu mobile
     ============================================================ */
  const nav = $("#nav");
  function onScrollNav() { nav.classList.toggle("is-solid", getScroll() > 40); }
  onScrollNav();
  if (lenis) lenis.on("scroll", onScrollNav);
  else window.addEventListener("scroll", onScrollNav, { passive: true });

  const burger = $("#burger");
  const links = $(".nav__links");
  if (burger && links) {
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open);
      if (lenis) open ? lenis.stop() : lenis.start();
    });
    $$(".nav__links a").forEach((a) =>
      a.addEventListener("click", () => {
        links.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
        if (lenis) lenis.start();
      })
    );
  }

  /* ============================================================
     REVEAL + split-in au scroll
     ============================================================ */
  function initReveals() {
    const items = [...$$(".reveal"), ...splitEls];
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((el) => { el.classList.add("is-visible"); el.classList.add("is-in"); });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-visible");
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }

  /* ============================================================
     COMPTEURS animés
     ============================================================ */
  const counters = $$("[data-count]");
  if ("IntersectionObserver" in window && !reduce) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        animateCount(e.target);
        cio.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  } else {
    counters.forEach((c) => { c.textContent = c.dataset.count + (c.dataset.suffix || ""); });
  }
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const dur = 1500; const start = performance.now();
    function stepFn(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(stepFn);
    }
    requestAnimationFrame(stepFn);
  }

  /* ============================================================
     PARALLAXE (piloté par le scroll Lenis)
     ============================================================ */
  const parallaxEls = $$("[data-parallax]");
  function updateParallax() {
    if (reduce) return;
    const vh = window.innerHeight;
    parallaxEls.forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.15;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - vh / 2;
      el.style.transform = `translate3d(0, ${(-center * speed).toFixed(1)}px, 0)`;
    });
  }
  if (!reduce && parallaxEls.length) {
    if (lenis) lenis.on("scroll", updateParallax);
    else window.addEventListener("scroll", updateParallax, { passive: true });
    window.addEventListener("resize", updateParallax);
    updateParallax();
  }

  /* ============================================================
     Boutons / éléments magnétiques
     ============================================================ */
  if (fine && !reduce) {
    $$("[data-magnetic]").forEach((el) => {
      const strength = 0.32;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ============================================================
     CARROUSELS (générique — tous les [data-carousel])
     ============================================================ */
  function initCarousel(root) {
    const viewport = $("[data-carousel-viewport]", root);
    const rail = $("[data-carousel-rail]", root);
    if (!viewport || !rail) return;
    const prev = $("[data-carousel-prev]", root);
    const next = $("[data-carousel-next]", root);
    const progress = $("[data-carousel-progress]", root);
    const curEl = $("[data-carousel-cur]", root);
    const totEl = $("[data-carousel-tot]", root);
    let index = 0;
    if (totEl) totEl.textContent = String(rail.children.length).padStart(2, "0");

    const stepW = () => {
      const item = rail.children[0];
      if (!item) return 0;
      const gap = parseFloat(getComputedStyle(rail).gap) || 0;
      return item.getBoundingClientRect().width + gap;
    };
    const maxOffset = () => Math.max(0, rail.scrollWidth - viewport.clientWidth);
    const perView = () => Math.max(1, Math.round(viewport.clientWidth / stepW()));
    const maxIndex = () => Math.max(0, rail.children.length - perView());

    function apply() {
      index = Math.max(0, Math.min(index, maxIndex()));
      const offset = Math.min(index * stepW(), maxOffset());
      rail.style.transform = `translateX(${-offset}px)`;
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= maxIndex();
      if (progress) {
        const ratio = maxIndex() === 0 ? 0 : index / maxIndex();
        const w = 100 / (maxIndex() + 1);
        progress.style.width = w + "%";
        progress.style.left = ratio * (100 - w) + "%";
      }
      if (curEl) curEl.textContent = String(index + 1).padStart(2, "0");
    }
    /* défilement automatique (opt-in via data-carousel-autoplay) */
    const autoplay = root.hasAttribute("data-carousel-autoplay") && !reduce;
    const apDelay = parseInt(root.dataset.carouselAutoplay, 10) || 4500;
    let timer = null;
    const tickNext = () => { index = index >= maxIndex() ? 0 : index + 1; apply(); };
    const stopAuto = () => { if (timer) { clearInterval(timer); timer = null; } };
    const startAuto = () => { if (!autoplay) return; stopAuto(); timer = setInterval(tickNext, apDelay); };

    next && next.addEventListener("click", () => { index++; apply(); startAuto(); });
    prev && prev.addEventListener("click", () => { index--; apply(); startAuto(); });

    let dragging = false, startX = 0, startIndex = 0;
    viewport.addEventListener("pointerdown", (e) => { dragging = true; startX = e.clientX; startIndex = index; viewport.classList.add("is-drag"); });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > stepW() * 0.32) {
        index = startIndex - Math.sign(dx);
        apply(); dragging = false; viewport.classList.remove("is-drag"); startAuto();
      }
    });
    window.addEventListener("pointerup", () => { dragging = false; viewport.classList.remove("is-drag"); });
    window.addEventListener("resize", apply);

    if (autoplay) {
      root.addEventListener("pointerenter", stopAuto);
      root.addEventListener("pointerleave", startAuto);
      document.addEventListener("visibilitychange", () => { document.hidden ? stopAuto() : startAuto(); });
      startAuto();
    }
    apply();
  }
  $$("[data-carousel]").forEach(initCarousel);

  /* ============================================================
     CARROUSEL À FLUX CONTINU ([data-flow]) — défilement fluide
     ============================================================ */
  function initFlow(root) {
    const viewport = $("[data-carousel-viewport]", root);
    const rail = $("[data-carousel-rail]", root);
    if (!viewport || !rail) return;
    $$("[data-carousel-prev], [data-carousel-next]", root).forEach((b) => { b.style.display = "none"; });
    if (reduce) return;

    /* duplication des cartes pour une boucle sans couture */
    [...rail.children].forEach((li) => rail.appendChild(li.cloneNode(true)));
    rail.style.transition = "none";
    rail.style.willChange = "transform";

    const speed = parseFloat(root.dataset.flowSpeed) || 80; // px / seconde
    let x = 0, last = performance.now(), paused = false;

    const period = () => {
      const gap = parseFloat(getComputedStyle(rail).gap) || 0;
      return (rail.scrollWidth + gap) / 2;
    };

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!paused) {
        x -= speed * dt;
        const p = period();
        if (-x >= p) x += p;
        rail.style.transform = `translateX(${x}px)`;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    root.addEventListener("pointerenter", () => { paused = true; });
    root.addEventListener("pointerleave", () => { paused = false; });
    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      last = performance.now();
    });
  }
  $$("[data-flow]").forEach(initFlow);

  /* ============================================================
     MODULES VIDÉO — lecture
     ============================================================ */
  $$("[data-video]").forEach((frame) => {
    const btn = $(".vplay", frame);
    const video = $("video", frame);
    if (!btn && !video) return;
    const toggle = () => {
      if (!video) { frame.classList.toggle("is-playing"); return; }
      if (video.paused) { video.play(); frame.classList.add("is-playing"); }
      else { video.pause(); frame.classList.remove("is-playing"); }
    };
    if (btn) btn.addEventListener("click", toggle);
    if (video) {
      video.addEventListener("click", toggle);
      video.addEventListener("ended", () => frame.classList.remove("is-playing"));
    }
  });

  /* ============================================================
     FAQ — fermeture exclusive
     ============================================================ */
  const faq = $("#faqList");
  if (faq) {
    $$("details", faq).forEach((d) => {
      d.addEventListener("toggle", () => {
        if (d.open) $$("details", faq).forEach((o) => { if (o !== d) o.open = false; });
      });
    });
  }
})();
