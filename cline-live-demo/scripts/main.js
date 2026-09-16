/**
 * Ember & Oak — behaviour layer.
 * Header scroll state, scroll reveals, newsletter validation. No dependencies.
 */

document.documentElement.classList.remove('no-js');

/* ---------------------------------------------------------------- header */
const header = document.querySelector('[data-header]');
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---------------------------------------------------------------- reveals */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealables = document.querySelectorAll('.reveal');

if (reducedMotion || !('IntersectionObserver' in window)) {
  revealables.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // Stagger siblings inside the same parent for a controlled cascade.
      const siblings = [...entry.target.parentElement.querySelectorAll(':scope > .reveal')];
      const index = Math.max(0, siblings.indexOf(entry.target));
      entry.target.style.transitionDelay = `${Math.min(index, 5) * 70}ms`;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  revealables.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------- newsletter form */
const form = document.getElementById('newsletter');
if (form) {
  const input = form.querySelector('#email');
  const error = form.querySelector('#email-error');
  const success = form.querySelector('#form-success');
  const button = form.querySelector('button[type="submit"]');

  const showError = (message) => {
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.hidden = false;
    input.focus();
  };

  const clearError = () => {
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    error.hidden = true;
  };

  // Re-validate live once a field has errored.
  input.addEventListener('input', () => {
    if (!error.hidden && input.checkValidity()) clearError();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

    if (!value) return showError('Enter your email address so we know where to send the roast notes.');
    if (!looksValid || !input.checkValidity()) return showError(`"${value}" doesn't look like an email — check for a typo.`);

    clearError();
    success.hidden = true;
    button.disabled = true;
    button.textContent = 'Signing you up…';
    input.setAttribute('readonly', '');
    form.setAttribute('aria-busy', 'true');

    // No backend here — this is where the subscribe request would go.
    window.setTimeout(() => {
      form.removeAttribute('aria-busy');
      button.disabled = false;
      button.textContent = 'Get roast emails';
      input.removeAttribute('readonly');
      input.value = '';
      success.hidden = false;
    }, 900);
  });
}

/* ------------------------------------------------------------------ year */
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
