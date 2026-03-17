/* =============================================
   Onboarding Wizard - JavaScript
   ============================================= */

(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    currentStep: 1,
    totalSteps: 5,
    selectedPlan: null,       // 'launchpad' | 'scaleup'
    billingCycle: 'monthly',  // 'monthly' | 'yearly'
    slug: '',
    authToken: null,
    tenantId: null,
    launched: false
  };

  const plans = {
    launchpad: {
      name: 'LaunchPad',
      monthly: 1999,
      yearly: 19990, // ~2 months free
      features: [
        '1 concurrent event',
        'Up to 500 registrations',
        'Basic analytics dashboard',
        'Email notifications',
        'Standard support'
      ]
    },
    scaleup: {
      name: 'ScaleUp Pro',
      monthly: 4999,
      yearly: 49990,
      features: [
        'Unlimited events',
        'Unlimited registrations',
        'Advanced analytics & exports',
        'Custom branding & domain',
        'Priority support & onboarding',
        'API access',
        'Team collaboration'
      ]
    }
  };

  // ---------- DOM Refs ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const stepPanels = $$('.step-panel');
  const stepperSteps = $$('.stepper-step');
  const btnBack = $('#btnBack');
  const btnNext = $('#btnNext');
  const billingToggle = $('#billingToggle');
  const alertOverlay = $('#alertOverlay');

  // ---------- Initialization ----------
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    renderStep();
    bindEvents();
    updatePlanPrices();
  }

  function bindEvents() {
    btnBack.addEventListener('click', goBack);
    btnNext.addEventListener('click', goNext);

    // Plan selection
    $$('.plan-card').forEach((card) => {
      card.addEventListener('click', () => {
        selectPlan(card.dataset.plan);
      });
    });

    // Billing toggle
    billingToggle.addEventListener('change', () => {
      state.billingCycle = billingToggle.checked ? 'yearly' : 'monthly';
      updatePlanPrices();
    });

    // Password strength
    const pwdInput = $('#accountPassword');
    if (pwdInput) {
      pwdInput.addEventListener('input', updatePasswordStrength);
    }

    // Company name -> slug
    const companyInput = $('#companyName');
    if (companyInput) {
      companyInput.addEventListener('input', () => {
        state.slug = generateSlug(companyInput.value);
      });
    }

    // Alert close
    $('#alertCloseBtn').addEventListener('click', hideAlert);
    alertOverlay.addEventListener('click', (e) => {
      if (e.target === alertOverlay) hideAlert();
    });

    // Add tier button
    $('#btnAddTier').addEventListener('click', addTierRow);

    // Remove tier delegation
    $('#tiersContainer').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-remove-tier');
      if (btn) {
        const row = btn.closest('.tier-row');
        const rows = $$('.tier-row');
        if (rows.length > 1) {
          row.remove();
        }
      }
    });
  }

  // ---------- Step Navigation ----------
  function renderStep() {
    // Panels
    stepPanels.forEach((panel, i) => {
      panel.classList.toggle('active', i + 1 === state.currentStep);
    });

    // Stepper indicators
    stepperSteps.forEach((step, i) => {
      const num = i + 1;
      step.classList.remove('active', 'completed');
      if (num === state.currentStep) step.classList.add('active');
      else if (num < state.currentStep) step.classList.add('completed');
    });

    // Back button
    btnBack.disabled = state.currentStep === 1;

    // Next button text
    if (state.currentStep === 3) {
      btnNext.textContent = 'Create Account';
    } else if (state.currentStep === 4) {
      btnNext.textContent = 'Save & Continue';
    } else if (state.currentStep === 5) {
      btnNext.style.display = 'none';
    } else {
      btnNext.textContent = 'Continue';
      btnNext.style.display = '';
    }

    // Hide footer on step 5
    if (state.currentStep === 5) {
      $('.wizard-footer').style.display = 'none';
      populateGoLive();
    } else {
      $('.wizard-footer').style.display = '';
    }
  }

  function goBack() {
    if (state.currentStep <= 1) return;
    state.currentStep--;
    renderStep();
  }

  async function goNext() {
    if (!validateStep(state.currentStep)) return;

    if (state.currentStep === 3) {
      await handleSignup();
      return;
    }

    if (state.currentStep === 4) {
      await handleSetupEvent();
      return;
    }

    if (state.currentStep < state.totalSteps) {
      // Pre-fill email on step 3 from step 1
      if (state.currentStep === 1) {
        const email = $('#companyEmail').value;
        $('#accountEmail').value = email;
      }
      state.currentStep++;
      renderStep();
    }
  }

  // ---------- Validation ----------
  function validateStep(step) {
    clearValidation();

    switch (step) {
      case 1:
        return validateCompanyDetails();
      case 2:
        return validatePlanSelection();
      case 3:
        return validateAccount();
      case 4:
        return validateEvent();
      default:
        return true;
    }
  }

  function clearValidation() {
    $$('.form-control.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function markInvalid(id, message) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('is-invalid');
      const errorEl = el.parentElement.querySelector('.field-error');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }
    }
  }

  function validateCompanyDetails() {
    let valid = true;

    const name = $('#companyName').value.trim();
    if (!name) { markInvalid('companyName', 'Company name is required'); valid = false; }

    const contact = $('#contactName').value.trim();
    if (!contact) { markInvalid('contactName', 'Contact name is required'); valid = false; }

    const email = $('#companyEmail').value.trim();
    if (!email || !isValidEmail(email)) { markInvalid('companyEmail', 'Valid email is required'); valid = false; }

    const phone = $('#companyPhone').value.trim();
    if (!phone || phone.length < 10) { markInvalid('companyPhone', 'Valid phone number is required'); valid = false; }

    return valid;
  }

  function validatePlanSelection() {
    if (!state.selectedPlan) {
      showAlert('Select a Plan', 'Please choose a plan to continue.', 'warning');
      return false;
    }
    return true;
  }

  function validateAccount() {
    let valid = true;

    const email = $('#accountEmail').value.trim();
    if (!email || !isValidEmail(email)) { markInvalid('accountEmail', 'Valid email is required'); valid = false; }

    const password = $('#accountPassword').value;
    if (password.length < 8) { markInvalid('accountPassword', 'Password must be at least 8 characters'); valid = false; }

    const confirm = $('#accountPasswordConfirm').value;
    if (password !== confirm) { markInvalid('accountPasswordConfirm', 'Passwords do not match'); valid = false; }

    const tos = $('#tosCheckbox').checked;
    if (!tos) {
      showAlert('Terms Required', 'Please accept the Terms of Service to continue.', 'warning');
      valid = false;
    }

    const dpa = $('#dpaCheckbox').checked;
    if (!dpa) {
      showAlert('DPA Required', 'Please accept the Data Processing Agreement to continue.', 'warning');
      valid = false;
    }

    return valid;
  }

  function validateEvent() {
    let valid = true;

    const name = $('#eventName').value.trim();
    if (!name) { markInvalid('eventName', 'Event name is required'); valid = false; }

    const date = $('#eventDate').value;
    if (!date) { markInvalid('eventDate', 'Event date is required'); valid = false; }

    const venue = $('#eventVenue').value.trim();
    if (!venue) { markInvalid('eventVenue', 'Venue is required'); valid = false; }

    return valid;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ---------- Plan Selection ----------
  function selectPlan(planKey) {
    state.selectedPlan = planKey;
    $$('.plan-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.plan === planKey);
    });
  }

  function updatePlanPrices() {
    const yearly = state.billingCycle === 'yearly';

    // Update labels
    $('#labelMonthly').classList.toggle('active-label', !yearly);
    $('#labelYearly').classList.toggle('active-label', yearly);
    const badge = $('#saveBadge');
    badge.classList.toggle('visible', yearly);

    // Update prices
    Object.entries(plans).forEach(([key, plan]) => {
      const priceEl = $(`.plan-card[data-plan="${key}"] .plan-price`);
      const periodEl = $(`.plan-card[data-plan="${key}"] .plan-period`);
      if (priceEl) {
        const price = yearly ? plan.yearly : plan.monthly;
        priceEl.textContent = formatCurrency(price);
        periodEl.textContent = yearly ? '/year' : '/month';
      }
    });
  }

  function formatCurrency(amount) {
    return '\u20B9 ' + amount.toLocaleString('en-IN');
  }

  // ---------- Password Strength ----------
  function updatePasswordStrength() {
    const pwd = $('#accountPassword').value;
    const bars = $$('.password-strength .bar');
    const hint = $('#passwordHint');
    let strength = 0;

    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;

    bars.forEach((bar, i) => {
      bar.classList.remove('filled', 'medium', 'strong');
      if (i < strength) {
        bar.classList.add('filled');
        if (strength >= 3) bar.classList.add('strong');
        else if (strength >= 2) bar.classList.add('medium');
      }
    });

    const labels = ['', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    hint.textContent = labels[strength] || '';
  }

  // ---------- Slug Generation ----------
  function generateSlug(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 48);
  }

  // ---------- Ticket Tiers ----------
  function addTierRow() {
    const container = $('#tiersContainer');
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.innerHTML = `
      <div class="form-group">
        <input type="text" class="form-control tier-name" placeholder="Tier name">
      </div>
      <div class="form-group">
        <input type="number" class="form-control tier-price" placeholder="Price" min="0">
      </div>
      <div class="form-group">
        <input type="number" class="form-control tier-seats" placeholder="Seats" min="1">
      </div>
      <button type="button" class="btn-remove-tier" title="Remove tier">&times;</button>
    `;
    container.appendChild(row);
  }

  function collectTiers() {
    const tiers = [];
    $$('.tier-row').forEach((row) => {
      const name = row.querySelector('.tier-name').value.trim();
      const price = parseFloat(row.querySelector('.tier-price').value) || 0;
      const seats = parseInt(row.querySelector('.tier-seats').value) || 0;
      if (name) {
        tiers.push({ name, price, seats });
      }
    });
    return tiers;
  }

  // ---------- API Calls ----------
  async function handleSignup() {
    const email = $('#accountEmail').value.trim();
    const password = $('#accountPassword').value;
    const companyName = $('#companyName').value.trim();

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          company_name: companyName,
          contact_name: $('#contactName').value.trim(),
          phone: $('#companyPhone').value.trim(),
          website: $('#companyWebsite').value.trim(),
          plan: state.selectedPlan,
          billing_cycle: state.billingCycle,
          referral_code: $('#referralCode').value.trim() || null,
          slug: state.slug
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Signup failed. Please try again.');
      }

      state.authToken = data.token;
      state.tenantId = data.tenant_id;
      state.slug = data.slug || state.slug;

      // Store in localStorage
      localStorage.setItem('onboarding_token', data.token);
      localStorage.setItem('onboarding_tenant_id', data.tenant_id);
      localStorage.setItem('onboarding_slug', state.slug);

      // Record legal acceptances (fire-and-forget)
      recordLegalAcceptances(data.token, state.slug);

      state.currentStep = 4;
      renderStep();
    } catch (err) {
      showAlert('Signup Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupEvent() {
    const eventName = $('#eventName').value.trim();
    const eventDate = $('#eventDate').value;
    const eventVenue = $('#eventVenue').value.trim();
    const tiers = collectTiers();

    setLoading(true);

    try {
      const token = state.authToken || localStorage.getItem('onboarding_token');
      const slug = state.slug || localStorage.getItem('onboarding_slug');

      const res = await fetch(`/api/t/${slug}/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          event_name: eventName,
          event_date: eventDate,
          venue: eventVenue,
          ticket_tiers: tiers
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to save event configuration.');
      }

      state.currentStep = 5;
      renderStep();
    } catch (err) {
      showAlert('Setup Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate() {
    if (state.launched) return;

    const btn = $('#btnLaunch');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Launching...';

    try {
      const token = state.authToken || localStorage.getItem('onboarding_token');
      const slug = state.slug || localStorage.getItem('onboarding_slug');

      const res = await fetch(`/api/t/${slug}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Activation failed.');
      }

      state.launched = true;
      btn.innerHTML = '\u2713 Live!';
      btn.style.background = 'var(--success)';
      btn.style.boxShadow = '0 4px 20px rgba(72,187,120,0.4)';

      // Show share section
      $('#shareSection').style.display = 'flex';

    } catch (err) {
      showAlert('Launch Error', err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '\uD83D\uDE80 Launch Now';
    }
  }

  // ---------- Go Live (Step 5) ----------
  function populateGoLive() {
    const slug = state.slug || localStorage.getItem('onboarding_slug') || 'your-company';
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/t/${slug}`;

    $('#previewUrl').textContent = url;

    // Launch button
    const btn = $('#btnLaunch');
    btn.onclick = handleActivate;

    // Share buttons
    $('#btnCopyUrl').onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        const el = $('#btnCopyUrl');
        el.textContent = 'Copied!';
        setTimeout(() => { el.innerHTML = '\uD83D\uDD17 Copy Link'; }, 2000);
      });
    };

    $('#btnWhatsApp').onclick = () => {
      const text = encodeURIComponent(`Check out our event registration page: ${url}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    };
  }

  // ---------- Legal Acceptance ----------
  async function recordLegalAcceptances(token, slug) {
    const email = $('#accountEmail').value.trim();
    const documents = [
      { document_type: 'tos', document_version: '1.0' },
      { document_type: 'dpa', document_version: '1.0' },
    ];

    for (const doc of documents) {
      try {
        await fetch(`/api/t/${slug}/legal/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ ...doc, accepted_by_email: email }),
        });
      } catch (err) {
        console.warn('Legal acceptance recording failed:', err);
      }
    }
  }

  // ---------- Loading State ----------
  function setLoading(loading) {
    btnNext.disabled = loading;
    if (loading) {
      btnNext.dataset.origText = btnNext.textContent;
      btnNext.innerHTML = '<span class="spinner"></span> Please wait...';
    } else {
      btnNext.textContent = btnNext.dataset.origText || 'Continue';
    }
  }

  // ---------- Alert Modal ----------
  function showAlert(title, message, type) {
    const icons = { error: '\u26A0\uFE0F', warning: '\u26A0\uFE0F', success: '\u2705', info: '\u2139\uFE0F' };
    $('#alertIcon').textContent = icons[type] || icons.info;
    $('#alertTitle').textContent = title;
    $('#alertMessage').textContent = message;
    alertOverlay.classList.add('visible');
  }

  function hideAlert() {
    alertOverlay.classList.remove('visible');
  }
})();
