/* Aurora Depth — external build | premium 3D + scroll */

  // ---- behaviour: nav, disclosure, form validation ----
  (() => {
    const nav = document.querySelector("[data-nav]");
    const toggle = document.querySelector("[data-nav-toggle]");
    const links = document.querySelector(".nav__links");
    if (toggle && links) toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      links.style.display = open ? "" : "flex";
    });
    const onScroll = () => { if (nav) nav.setAttribute("data-scrolled", String(window.scrollY > 8)); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    document.querySelectorAll("[data-faq-q]").forEach((q) => q.addEventListener("click", () => {
      const open = q.getAttribute("aria-expanded") === "true";
      q.setAttribute("aria-expanded", String(!open));
      const panel = q.parentElement && q.parentElement.querySelector("[data-faq-a]");
      if (panel) panel.hidden = open;
    }));
    const form = document.querySelector("[data-auth-form]");
    if (form) form.addEventListener("submit", (e) => {
      let firstBad;
      form.querySelectorAll(".field").forEach((field) => {
        const input = field.querySelector("input");
        if (!input) return;
        const bad = !input.checkValidity();
        field.dataset.invalid = bad ? "true" : "false";
        input.setAttribute("aria-invalid", String(bad));
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) { e.preventDefault(); firstBad.focus(); }
    });
  })();
  // ---- reveal: staggered page load, fail-safe (content is visible if this never runs) ----
  (() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!nodes.length) return;
    const show = (el) => el.classList.add("is-in");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) { nodes.forEach(show); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    nodes.forEach((el) => io.observe(el));
    // Safety net: anything still hidden 1.2s after load is revealed anyway.
    window.addEventListener("load", () => setTimeout(() => nodes.forEach((el) => { if (!el.classList.contains("is-in")) show(el); }), 1200));
  })();
