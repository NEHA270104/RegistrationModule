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
        if (el.dataset.yearlyPeriod) {
          el.textContent = isYearly ? el.dataset.yearlyPeriod : el.dataset.monthlyPeriod;
        } else {
          el.textContent = isYearly ? '/month (billed yearly)' : '/month';
        }
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

  // ============================================
  // DYNAMIC PLANS & SETTINGS BINDING
  // ============================================
  
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderPricingGrid(plansList) {
    const grid = document.getElementById('pricingGrid');
    if (!grid) return;

    grid.innerHTML = plansList.map(plan => {
      // Prefer server-computed annual fields; fall back to client-calc for safety
      const monthlyPriceVal = plan.price_inr !== undefined ? plan.price_inr : (plan.price_monthly || 0);
      // price_yearly_monthly: per-month cost when billed annually (server provides this)
      const yearlyEquivalentVal = plan.price_yearly_monthly !== undefined
        ? plan.price_yearly_monthly
        : Math.round(monthlyPriceVal * 0.83);
      // price_annual: total amount charged annually (server provides this)
      const annualPriceVal = plan.price_annual !== undefined
        ? plan.price_annual
        : Math.round(monthlyPriceVal * 12 * 0.83);

      const monthlyStr = monthlyPriceVal === 0 ? 'Free' : monthlyPriceVal.toLocaleString('en-IN');
      const yearlyStr  = monthlyPriceVal === 0 ? 'Free' : yearlyEquivalentVal.toLocaleString('en-IN');
      const annualStr  = annualPriceVal.toLocaleString('en-IN');

      const isPopular = plan.name.toLowerCase() === 'launchpad';

      // Parse JSONB features array
      const featuresArray = Array.isArray(plan.features) ? plan.features : (typeof plan.features === 'string' ? JSON.parse(plan.features) : []);
      const featuresList = featuresArray.map(f => `<li>${escapeHtml(f)}</li>`).join('');

      const pricingToggle = document.getElementById('pricingToggle');
      const isYearlyActive = pricingToggle ? pricingToggle.checked : false;
      const currentPrice = isYearlyActive ? yearlyStr : monthlyStr;

      let priceHTML = '';
      if (monthlyPriceVal === 0) {
        priceHTML = `<span class="price-amount">Free</span>`;
      } else {
        priceHTML = `
          <span class="price-currency">&#8377;</span>
          <span class="price-amount" data-monthly="${monthlyStr}" data-yearly="${yearlyStr}">${currentPrice}</span>
          <span class="price-period" data-monthly-period="/month" data-yearly-period="/month (billed &#8377;${annualStr}/year)">${isYearlyActive ? `/month (billed &#8377;${annualStr}/year)` : '/month'}</span>
        `;
      }

      return `
        <div class="pricing-card ${isPopular ? 'popular' : ''}">
          ${isPopular ? '<div class="popular-ribbon">Most Popular</div>' : ''}
          <div class="pricing-name">${escapeHtml(plan.name)}</div>
          <div class="pricing-price">
            ${priceHTML}
          </div>
          <div class="pricing-desc">${isPopular ? 'For growing event organizers' : monthlyPriceVal === 0 ? 'Perfect for trying out the platform' : 'For large-scale events & agencies'}</div>
          <ul class="pricing-features">
            ${featuresList}
          </ul>
          <a href="/onboarding" class="btn ${isPopular ? 'btn-primary' : 'btn-outline'} btn-block">
            ${monthlyPriceVal === 0 ? 'Start Free' : 'Get Started'}
          </a>
        </div>
      `;
    }).join('');

    // If maintenance mode is active, disable the newly rendered buttons
    if (window.maintenanceModeActive) {
      document.querySelectorAll('a[href="/onboarding"]').forEach(btn => {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        btn.textContent = 'Temporarily Disabled';
      });
    }
  }


  // Safe JSON API Fetch Helper
  async function safeFetchJson(url) {
    try {
      const res = await fetch(url);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  }

  async function initDynamicContent() {
    try {
      // 1. Fetch system settings
      const settingsRes = await safeFetchJson('/api/public/settings');
      if (settingsRes && settingsRes.success && settingsRes.data) {
        const settings = settingsRes.data;
        if (settings.maintenance_mode === true || settings.maintenance_mode === 'true') {
          window.maintenanceModeActive = true;
          const banner = document.getElementById('maintenanceBanner');
          if (banner) banner.style.display = 'block';
          
          document.querySelectorAll('a[href="/onboarding"]').forEach(btn => {
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
            btn.textContent = 'Temporarily Disabled';
          });
        }
        
        const supportEmail = settings.support_email || 'support@eventregplatform.com';
        document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
          link.href = `mailto:${supportEmail}`;
          if (link.textContent.includes('@')) {
            link.textContent = supportEmail;
          }
        });
      }
    } catch (err) {
      console.warn('Could not load public settings (using offline defaults):', err);
    }

    try {
      // 2. Fetch plans
      const plansRes = await safeFetchJson('/api/public/plans');
      if (plansRes && plansRes.success && Array.isArray(plansRes.data)) {
        renderPricingGrid(plansRes.data);
      }
    } catch (err) {
      console.warn('Could not load public plans (using offline defaults):', err);
    }
  }

  // Run initialization
  initDynamicContent();

})();
