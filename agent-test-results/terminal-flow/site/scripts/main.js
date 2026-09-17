const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = document.querySelectorAll('[data-reveal]');
if (reduce || !('IntersectionObserver' in window)) targets.forEach((el) => el.classList.add('is-in'));
else { const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.15 }); targets.forEach((el) => io.observe(el)); }
const layers = document.querySelectorAll('.layer');
if (!reduce && layers.length) window.addEventListener('scroll', () => { const y = window.scrollY; layers.forEach((l, i) => { l.style.transform = 'translate3d(0,' + (y * (0.05 + i * 0.03)) + 'px,0)'; }); }, { passive: true });
