/* Humanist Airy — external build | premium 3D + scroll */
/* nav, FAQ, auth validation, reveal. */
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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("enter"); io.unobserve(en.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  } else { document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("enter")); }
})();
