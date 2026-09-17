/* Aurora Depth — external build | premium 3D + scroll */
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

  // ---- premium scroll + 3D ----
  try {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const prefersLow = window.matchMedia("(max-width: 768px)").matches;
    // Parallax (data-parallax)
    if (!reduceMotion) {
      const els = document.querySelectorAll("[data-parallax]");
      const onParallax = () => {
        const sy = window.scrollY;
        els.forEach((el) => {
          const speed = parseFloat(el.dataset.speed || "0.08");
          el.style.transform = "translate3d(0," + (sy * speed * -0.35) + "px,0)";
        });
      };
      window.addEventListener("scroll", onParallax, { passive: true });
      onParallax();
    }
    // Mouse parallax for orbs / hero object
    if (!reduceMotion && !isCoarse) {
      const hero = document.querySelector("[data-hero-premium]");
      const orbs = document.querySelectorAll(".hero__orb");
      window.addEventListener("mousemove", (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        orbs.forEach((orb, i) => {
          const f = (i + 1) * 6;
          orb.style.transform = "translate3d(" + (x * f) + "px," + (y * f * 0.6) + "px,0)";
        });
        if (hero) hero.style.setProperty("--mouse-x", String(x));
      }, { passive: true });
    }
    // GSAP ScrollTrigger if available (CDN), otherwise fallback to IntersectionObserver already done
    const hasGSAP = typeof window.gsap !== "undefined";
    if (!reduceMotion && hasGSAP && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      // Pin + scrub narrative: every [data-scroll-pin] becomes a 120% scrub story
      document.querySelectorAll("[data-scroll-pin]").forEach((pin) => {
        const tl = window.gsap.timeline({
          scrollTrigger: {
            trigger: pin,
            pin: pin.querySelector("[data-pin]") || pin,
            scrub: 1,
            start: "top top",
            end: "+=120%",
            anticipatePin: 1
          }
        });
        const steps = pin.querySelectorAll("[data-step]");
        steps.forEach((step, i) => {
          tl.fromTo(step, { opacity: 0.35, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, i * 0.25);
          tl.to(step, { opacity: 0.35, duration: 0.2 }, i * 0.25 + 0.35);
        });
      });
      // Horizontal scroll
      document.querySelectorAll("[data-horizontal]").forEach((wrap) => {
        const track = wrap.querySelector("[data-horizontal-track]");
        if (!track) return;
        const len = track.children.length;
        window.gsap.to(track, {
          xPercent: -100 * (len - 1),
          ease: "none",
          scrollTrigger: {
            trigger: wrap,
            pin: true,
            scrub: 1,
            end: "+=" + (len * 100) + "%"
          }
        });
      });
      // Text reveal
      window.gsap.utils.toArray("[data-reveal]").forEach((el) => {
        window.gsap.from(el, {
          y: 18, opacity: 0,
          duration: 0.6, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true }
        });
      });
    }
    // Three.js hero WebGL — single low-poly scene, mouse + scroll linked
    const canvas = document.querySelector("[data-hero-canvas]");
    if (canvas && !reduceMotion && !isCoarse && !prefersLow) {
      const loadThree = () => new Promise((resolve, reject) => {
        if (window.THREE) return resolve(window.THREE);
        const s = document.createElement("script");
        s.type = "importmap";
        s.textContent = JSON.stringify({ imports: { "three": "https://unpkg.com/three@0.160.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/" } });
        document.head.appendChild(s);
        import("three").then(resolve).catch(reject);
      });
      loadThree().then((THREE) => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(44, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
        camera.position.set(0, 0.2, 6);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        // lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(2, 3, 4);
        scene.add(dir);
        // orbs: 3 low-poly icosahedra
        const geo = new THREE.IcosahedronGeometry(0.9, 1);
        const mat1 = new THREE.MeshStandardMaterial({ color: 0x7c5cff, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.95 });
        const mat2 = new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.75 });
        const mat3 = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.65 });
        const m1 = new THREE.Mesh(geo, mat1); m1.position.set(-1.6, 0.4, 0);
        const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), mat2); m2.position.set(1.4, -0.2, -0.5);
        const m3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), mat3); m3.position.set(0.6, 0.9, -0.8);
        scene.add(m1, m2, m3);
        const onResize = () => {
          const w = canvas.clientWidth, h = canvas.clientHeight;
          camera.aspect = w / h; camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        };
        window.addEventListener("resize", onResize, { passive: true });
        let mx = 0, my = 0, sx = 0;
        window.addEventListener("mousemove", (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 0.6; my = (e.clientY / window.innerHeight - 0.5) * 0.4; }, { passive: true });
        window.addEventListener("scroll", () => { sx = window.scrollY / 1200; }, { passive: true });
        let raf = 0;
        const tick = () => {
          raf = requestAnimationFrame(tick);
          m1.rotation.y += 0.003 + mx * 0.002; m1.rotation.x += 0.0015 + my * 0.001;
          m2.rotation.y -= 0.004 + mx * 0.0015; m2.rotation.z += 0.002;
          m3.rotation.y += 0.005; m3.rotation.x -= 0.002 + my * 0.001;
          camera.position.x += (mx * 0.9 - camera.position.x) * 0.04;
          camera.position.y += (-my * 0.5 - camera.position.y + 0.2) * 0.04;
          camera.lookAt(0, 0, 0);
          m1.position.y = 0.4 + Math.sin(Date.now() * 0.0004) * 0.12;
          // scroll linkage
          scene.rotation.y = sx * 0.18;
          renderer.render(scene, camera);
        };
        tick();
        // dispose on page hide
        document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else tick(); });
      }).catch(() => {});
    } else if (canvas) {
      canvas.style.display = "none";
    }
  } catch (e) { /* premium enhancement best effort */ }
  
})();
