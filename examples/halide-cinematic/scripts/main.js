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
  // ---- cinematic hero scene ----
  (() => {
  const ACCENT_HEX = "#d7f75b";
  const SUBSTRATE_HEX = "#0b0d12";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const prefersLow = false;
    // ---- hero scene: a scroll-driven instrument, not floating orbs -------------
    // Three spheres drifting on a gradient is the canvas form of three identical
    // cards. The subject here is one structure the camera studies: an instanced
    // shell that opens with scroll, a polished core, and a depth field. The
    // palette comes from the art direction; nothing is hardcoded purple.
    const canvas = document.querySelector("[data-ad-canvas]") || document.querySelector("[data-hero-canvas]");
    if (canvas && !reduceMotion && !isCoarse && !prefersLow) {
      import("three").then((THREE) => {
        const host = canvas.parentElement || canvas;
        const w = () => host.clientWidth || window.innerWidth;
        const h = () => host.clientHeight || window.innerHeight;
        const ACCENT = new THREE.Color(ACCENT_HEX);
        const SUBSTRATE = new THREE.Color(SUBSTRATE_HEX);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(SUBSTRATE.getHex(), 0.055);
        const camera = new THREE.PerspectiveCamera(34, w() / h(), 0.1, 120);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w(), h(), false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;

        // Two sources of different colour temperature. One white light from the
        // front is why a render reads flat.
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        const glow = (color, intensity, x, y, z, scale) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
          m.material.color.multiplyScalar(intensity);
          m.position.set(x, y, z); m.scale.setScalar(scale); m.lookAt(0, 0, 0);
          envScene.add(m);
        };
        glow(ACCENT.getHex(), 2.6, 4, 3, 2, 6);
        glow(0xffe9cf, 1.2, -5, 1, -3, 5);
        glow(0xffffff, 0.5, 0, -4, 0, 8);
        scene.environment = pmrem.fromScene(envScene, 0.04).texture;
        pmrem.dispose();

        const group = new THREE.Group();
        scene.add(group);

        const core = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.15, 3),
          new THREE.MeshStandardMaterial({ color: SUBSTRATE.getHex(), metalness: 1.0, roughness: 0.22, envMapIntensity: 1.5 })
        );
        group.add(core);

        // One instanced mesh, not ninety-six draw calls.
        const COUNT = 96;
        const shellColor = SUBSTRATE.clone().lerp(ACCENT, 0.18).getHex();
        const shell = new THREE.InstancedMesh(
          new THREE.TetrahedronGeometry(0.19, 0),
          new THREE.MeshStandardMaterial({ color: shellColor, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.2 }),
          COUNT
        );
        const seeds = [];
        for (let i = 0; i < COUNT; i++) {
          const phi = Math.acos(1 - 2 * (i + 0.5) / COUNT);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          seeds.push({
            dir: new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)),
            rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
            s: 0.55 + Math.random() * 0.8
          });
        }
        group.add(shell);

        const N = 900;
        const pts = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const r = 4 + Math.random() * 22;
          const a = Math.random() * 6.28;
          const b = Math.acos(2 * Math.random() - 1);
          pts[i * 3] = r * Math.sin(b) * Math.cos(a);
          pts[i * 3 + 1] = r * Math.cos(b) * 0.55;
          pts[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
        }
        const fieldGeo = new THREE.BufferGeometry();
        fieldGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        const field = new THREE.Points(fieldGeo, new THREE.PointsMaterial({
          size: 0.05, color: ACCENT.getHex(), transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        }));
        scene.add(field);

        window.addEventListener("resize", () => {
          camera.aspect = w() / h(); camera.updateProjectionMatrix();
          renderer.setSize(w(), h(), false);
        }, { passive: true });

        let mx = 0, my = 0, target = 0, p = 0;
        window.addEventListener("mousemove", (e) => {
          mx = (e.clientX / window.innerWidth - 0.5);
          my = (e.clientY / window.innerHeight - 0.5);
        }, { passive: true });
        const readScroll = () => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        };
        window.addEventListener("scroll", readScroll, { passive: true });
        readScroll();

        // Every moment is a span of p: 0 before a, 1 after b, eased between.
        const span = (v, a, b) => { const t = Math.min(1, Math.max(0, (v - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
        const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();

        let raf = 0, last = performance.now(), acc = 0, frames = 0, level = 0;
        const tick = (now) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          p += (target - p) * (1 - Math.exp(-6 * dt));

          const open = span(p, 0, 0.55);
          for (let i = 0; i < COUNT; i++) {
            const sd = seeds[i];
            P.copy(sd.dir).multiplyScalar(1.35 + open * (1.1 + sd.s * 2.4));
            E.set(sd.rx + now * 0.00012 * sd.s, sd.ry + now * 0.00016 * sd.s, sd.rz);
            S.setScalar(sd.s * (1 - open * 0.35));
            M.compose(P, Q.setFromEuler(E), S);
            shell.setMatrixAt(i, M);
          }
          shell.instanceMatrix.needsUpdate = true;

          group.rotation.y = now * 0.00008 + p * 0.9;
          core.scale.setScalar(1 - open * 0.25);
          field.rotation.y = -now * 0.00004 - p * 0.35;
          field.material.opacity = 0.2 + 0.45 * (1 - open);

          camera.position.set(mx * 0.9, 0.25 - my * 0.5 + p * 0.4, 6.2 + open * 3.4);
          camera.lookAt(window.innerWidth > 1024 ? -1.5 : 0, 0.05, 0);
          renderer.toneMappingExposure = 1.1 - 0.25 * span(p, 0.4, 1);
          renderer.render(scene, camera);

          // Adaptive quality in ordered steps; it never climbs back, because
          // oscillating quality reads worse than low quality.
          acc += dt; frames++;
          if (acc >= 1) {
            const fps = frames / acc; acc = 0; frames = 0;
            if (fps < 45 && level < 2) {
              level++;
              if (level === 1) renderer.setPixelRatio(1);
              if (level === 2) field.visible = false;
            }
          }
        };
        raf = requestAnimationFrame(tick);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) cancelAnimationFrame(raf);
          else { last = performance.now(); raf = requestAnimationFrame(tick); }
        });
      }).catch(() => { canvas.style.display = "none"; });
    } else if (canvas) {
      canvas.style.display = "none";
    }
  })();

