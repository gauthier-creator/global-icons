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
  function showNav() { nav && nav.classList.add("is-visible"); }
  function onScrollNav() {
    const y = getScroll();
    nav.classList.toggle("is-solid", y > 40);
    if (y > 5) showNav();
  }
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

  /* Lien actif selon la section visible (IntersectionObserver) */
  const navLinks = $$('.nav__links a[href^="#"]');
  if (navLinks.length && "IntersectionObserver" in window) {
    const sectionMap = new Map();
    navLinks.forEach((a) => {
      const id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      const target = document.querySelector(id);
      if (target) sectionMap.set(target, a);
    });
    if (sectionMap.size) {
      const setCurrent = (link) => {
        navLinks.forEach((a) => a.classList.toggle("is-current", a === link));
      };
      const obs = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) {
            const link = sectionMap.get(visible.target);
            if (link) setCurrent(link);
          }
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      sectionMap.forEach((_, section) => obs.observe(section));
    }
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
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals, 10) : 0;
    const dur = 1500; const start = performance.now();
    function stepFn(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      const formatted = decimals > 0 ? v.toFixed(decimals).replace(".", ",") : String(Math.round(v));
      el.textContent = formatted + suffix;
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
     HERO — 3 états :
       0 (arrivée)    : BG + tagline + CTA visibles, pas de carte
       1 (.is-revealed, 1er scroll) : la carte centrale apparaît
       2 (.is-active, 2e scroll) : l'animation se déclenche (deck + voile)
     Les 2 premiers scrolls sont hijack (preventDefault) pour rester en place.
     Au 3e scroll, on libère et Lenis prend la main pour scroller vers la suite.
     ============================================================ */
  const heroEl = $("[data-hero]");
  const isDesktop = window.matchMedia("(min-width: 821px)").matches;
  if (heroEl && !reduce && isDesktop) {
    let gestureCount = 0;
    let gestureLock = false;
    let scrollLocked = false;

    const lockScroll = () => {
      if (scrollLocked) return;
      scrollLocked = true;
      if (lenis) lenis.stop();
      document.documentElement.style.overflow = "hidden";
    };
    const unlockScroll = () => {
      scrollLocked = false;
      if (lenis) lenis.start();
      document.documentElement.style.overflow = "";
    };

    // Verrouille le scroll dès que possible (après que finishLoad ait fait lenis.start)
    setTimeout(() => {
      const y = lenis ? lenis.scroll : window.scrollY;
      if (y < 50 && gestureCount < 2) lockScroll();
    }, 250);

    const advance = () => {
      if (gestureLock || gestureCount >= 2) return false;
      gestureLock = true;
      gestureCount++;
      showNav(); // fait apparaître le nav dès la 1ère interaction hero
      if (gestureCount === 1) heroEl.classList.add("is-revealed");
      else if (gestureCount === 2) {
        heroEl.classList.add("is-active");
        // Libère le scroll après que l'animation principale soit jouée
        setTimeout(unlockScroll, 900);
      }
      setTimeout(() => { gestureLock = false; }, gestureCount === 1 ? 600 : 800);
      return true;
    };

    const tryAdvance = (deltaPositive) => {
      if (gestureCount >= 2) return;
      if (!deltaPositive) return;
      // Garantit que le scroll reste verrouillé même si finishLoad a redémarré Lenis
      lockScroll();
      advance();
    };

    // Wheel (capture + passive:false pour bloquer aussi les browsers qui n'écouteraient pas lenis.stop)
    window.addEventListener("wheel", (e) => {
      if (gestureCount >= 2) return;
      if (e.deltaY > 0) {
        e.preventDefault();
        tryAdvance(true);
      }
    }, { capture: true, passive: false });

    // Touch (mobile : la condition isDesktop ne devrait pas y arriver, mais on couvre)
    let touchYStart = null;
    window.addEventListener("touchstart", (e) => { touchYStart = e.touches[0].clientY; }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (gestureCount >= 2 || touchYStart === null) return;
      const dy = touchYStart - e.touches[0].clientY;
      if (dy < 30) return;
      e.preventDefault();
      tryAdvance(true);
      touchYStart = null;
    }, { capture: true, passive: false });
    window.addEventListener("touchend", () => { touchYStart = null; }, { passive: true });

    // Clavier
    window.addEventListener("keydown", (e) => {
      if (gestureCount >= 2) return;
      if (["ArrowDown", "PageDown", "Space"].includes(e.code)) {
        e.preventDefault();
        tryAdvance(true);
      }
    });

    // Reset si retour en haut (par exemple via anchor #top)
    const sync = () => {
      const y = lenis ? lenis.scroll : window.scrollY;
      if (y < 5 && gestureCount > 0) {
        gestureCount = 0;
        heroEl.classList.remove("is-revealed", "is-active");
        lockScroll();
      }
    };
    if (lenis) lenis.on("scroll", sync);
    else window.addEventListener("scroll", sync, { passive: true });
  }

  /* ============================================================
     HERO TROPHY CARDS — tilt 3D au curseur (mouvement subtil suivant la souris)
     ============================================================ */
  if (heroEl && fine && !reduce) {
    $$(".hero .trophy").forEach((card) => {
      let rect = null;
      const reset = () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      };
      card.addEventListener("pointerenter", () => { rect = card.getBoundingClientRect(); });
      card.addEventListener("pointermove", (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty("--tilt-y", (x * 12).toFixed(2) + "deg");
        card.style.setProperty("--tilt-x", (-y * 12).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", () => { rect = null; reset(); });
    });
  }

  /* ============================================================
     SECTION SNAP — soft, après scroll-end. Lenis gère le wheel naturellement.
     EXCEPTION : on ne snape pas dans le hero pour laisser son animation se jouer.
     ============================================================ */
  if (!reduce && heroEl) {
    const snapSections = $$("main > section, footer").filter((s) =>
      !s.classList.contains("brandmark") &&
      !s.classList.contains("marquee")
    );
    let scrollEndTimer = null;
    let isSnapping = false;
    let lastDir = 1;
    let lastSeenY = lenis ? lenis.scroll : window.scrollY;

    const snapNearest = () => {
      if (isSnapping) return;
      const y = lenis ? lenis.scroll : window.scrollY;
      // ne pas snaper si on est encore dans la zone d'animation du hero
      const heroBottom = heroEl.offsetTop + heroEl.offsetHeight;
      if (y < heroBottom - window.innerHeight * 0.5) return;
      // cherche la section la plus proche, biaisée dans la direction du dernier scroll
      let target = null;
      let minDist = Infinity;
      for (const s of snapSections) {
        const dist = Math.abs(s.offsetTop - y);
        // léger biais : si scroll vers le bas, favorise les sections plus bas (et inversement)
        const adj = dist + (lastDir > 0 && s.offsetTop < y ? 40 : 0) + (lastDir < 0 && s.offsetTop > y ? 40 : 0);
        if (adj < minDist) { minDist = adj; target = s; }
      }
      if (!target) return;
      const realDist = Math.abs(target.offsetTop - y);
      // ne snape que si proche d'une frontière (entre 12px et ~45% du viewport)
      if (realDist < 12 || realDist > window.innerHeight * 0.45) return;
      isSnapping = true;
      if (lenis) {
        lenis.scrollTo(target.offsetTop, { duration: 0.7, onComplete: () => { isSnapping = false; } });
      } else {
        window.scrollTo({ top: target.offsetTop, behavior: "smooth" });
        setTimeout(() => { isSnapping = false; }, 750);
      }
    };

    const onScroll = () => {
      const y = lenis ? lenis.scroll : window.scrollY;
      if (Math.abs(y - lastSeenY) > 2) lastDir = y > lastSeenY ? 1 : -1;
      lastSeenY = y;
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(snapNearest, 180);
    };

    if (lenis) lenis.on("scroll", onScroll);
    else window.addEventListener("scroll", onScroll, { passive: true });
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
