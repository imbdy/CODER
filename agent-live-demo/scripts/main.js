document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.btn');
  if (btn) {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      btn.textContent = 'Subscribing...';
      btn.disabled = true;

      setTimeout(() => {
        btn.textContent = 'Subscribed!';
        btn.disabled = false;
      }, 1000);
    });
  }

  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailInput = document.getElementById('email');
      const email = emailInput.value;

      if (email) {
        emailInput.value = '';
        emailInput.setAttribute('disabled', true);
        btn.textContent = 'Subscribing...';
        btn.disabled = true;

        setTimeout(() => {
          btn.textContent = 'Subscribed!';
          btn.disabled = false;
        }, 1000);
      } else {
        alert('Please enter a valid email address.');
      }
    });
  }
});