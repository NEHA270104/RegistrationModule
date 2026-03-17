/**
 * Landing Page - EventReg Platform
 */

(function () {
  // ---- Mobile nav toggle ----
  const navToggle = document.getElementById('navToggle');
  const navbar = document.querySelector('.navbar');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navbar.classList.toggle('menu-open');
    });

    // Close menu when clicking a nav link
    document.querySelectorAll('.nav-links a').forEach((link) => {
      link.addEventListener('click', () => {
        navbar.classList.remove('menu-open');
      });
    });
  }

  // ---- Pricing toggle (monthly / yearly) ----
  const pricingToggle = document.getElementById('pricingToggle');
  const monthlyLabel = document.getElementById('monthlyLabel');
  const yearlyLabel = document.getElementById('yearlyLabel');

  if (pricingToggle) {
    pricingToggle.addEventListener('change', () => {
      const isYearly = pricingToggle.checked;
      monthlyLabel.classList.toggle('active', !isYearly);
      yearlyLabel.classList.toggle('active', isYearly);

      document.querySelectorAll('.price-amount[data-monthly]').forEach((el) => {
        el.textContent = isYearly ? el.dataset.yearly : el.dataset.monthly;
      });

      document.querySelectorAll('.price-period').forEach((el) => {
        el.textContent = isYearly ? '/month (billed yearly)' : '/month';
      });
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');

      // Close all
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));

      // Toggle current
      if (!wasOpen) {
        item.classList.add('open');
      }
    });
  });

  // ---- Navbar scroll effect ----
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    if (currentScroll > 100) {
      navbar.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    } else {
      navbar.style.boxShadow = 'none';
    }
    lastScroll = currentScroll;
  });

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80; // navbar height + padding
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
})();
