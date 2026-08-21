/* =============================================
   Onboarding Wizard - JavaScript
   ============================================= */

(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    currentStep: 1,
    totalSteps: 3,
    selectedPlan: null,       // 'launchpad' | 'scaleup'
    billingCycle: 'monthly',  // 'monthly' | 'yearly'
    slug: '',
    authToken: null,
    tenantId: null,
    launched: false
  };

  let avatarBase64 = '';

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

  // ---------- Session Guard ----------
  /**
   * Checks whether the browser already holds a valid session for a registered,
   * paid tenant. If so, redirects straight to /dashboard/ without showing any
   * onboarding step. If the user is registered but unpaid (e.g. payment failed),
   * jumps them directly to Step 2 (plan selection) so they can retry payment.
   *
   * Called as the FIRST operation inside init() so no step renders before we know
   * the user's auth state.
   *
   * Returns:
   *   'dashboard'    → caller should redirect and stop
   *   'payment'      → caller should skip to Step 2
   *   'onboarding'   → caller should proceed normally from Step 1
   */
  async function checkExistingSession() {
    // Collect any token from the known storage keys used by DashboardAuth / onboarding flow
    const token =
      localStorage.getItem('dashboard_access_token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('onboarding_token') ||
      (() => {
        // Also scan for Supabase-managed sb-*-auth-token keys
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            try {
              const sbData = JSON.parse(localStorage.getItem(key) || '');
              if (sbData && sbData.access_token) return sbData.access_token;
            } catch (_) { /* ignore parse errors */ }
          }
        }
        return null;
      })();

    if (!token) {
      // No token at all — unauthenticated new visitor, proceed through onboarding normally
      return 'onboarding';
    }

    try {
      const res = await fetch('/api/auth/session-status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        // 401 → token expired or invalid; clear stale data and show Step 1
        if (res.status === 401) {
          localStorage.removeItem('dashboard_access_token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('onboarding_token');
          localStorage.removeItem('dashboard_refresh_token');
          localStorage.removeItem('dashboard_tenant');
        }
        return 'onboarding';
      }

      const json = await res.json();
      if (!json.success || !json.data) return 'onboarding';

      const { is_registered, is_paid } = json.data;

      if (is_registered && is_paid) {
        // User is fully registered with an active subscription — bounce to dashboard
        return 'dashboard';
      }

      if (is_registered && !is_paid) {
        // Account exists in database but payment is pending — jump directly to Step 3 (Plan & Pay)
        return 'payment';
      }

      // Fallback: unregistered or unknown state — normal onboarding
      return 'onboarding';
    } catch (err) {
      // Network error — degrade gracefully, show onboarding normally
      console.warn('[Onboarding] session-status check failed, proceeding normally:', err);
      return 'onboarding';
    }
  }

  // ---------- Initialization ----------
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // ── STEP 0: Session Guard ──────────────────────────────────────────────
    const sessionResult = await checkExistingSession();

    if (sessionResult === 'dashboard') {
      window.location.replace('/dashboard/');
      return; // stop — browser will navigate away
    }

    if (sessionResult === 'payment') {
      // Account is already registered in DB, jump to Step 3 (Plan & Pay)
      const savedEmail = localStorage.getItem('onboarding_email') || '';
      if (savedEmail && $('#companyEmail')) {
        $('#companyEmail').value = savedEmail;
      }
      state.currentStep = 3;
    }
    // ── END Session Guard ──────────────────────────────────────────────────

    const params = new URLSearchParams(window.location.search);
    const paymentSuccess = params.get('payment') === 'success';
    const savedStateStr = sessionStorage.getItem('onboarding_wizard_state');
    
    if (paymentSuccess) {
      window.location.replace('/dashboard/');
      return;
    }

    renderStep();
    bindEvents();
    initPricing();
  }

  function bindEvents() {
    btnBack.addEventListener('click', goBack);
    btnNext.addEventListener('click', goNext);

    // ── Duplicate Registration Check ──────────────────────────────────────
    // Fires on blur (when user leaves the field) and debounced on input so
    // users get feedback as they type without hammering the API.
    //
    // State flags — read by validateCompanyDetails() to block Step 2 progression.
    const dupState = { emailExists: false, phoneExists: false };

    /**
     * Shows or hides the inline banner for a given field.
     * @param {HTMLElement} inputEl  — the form-control input
     * @param {HTMLElement} bannerEl — the .duplicate-banner div
     * @param {boolean}     exists   — whether a duplicate was found
     */
    function setDuplicateBannerState(inputEl, bannerEl, exists) {
      if (!inputEl || !bannerEl) return;
      if (exists) {
        bannerEl.style.display = 'flex';
        bannerEl.style.animation = 'none'; // reset animation
        requestAnimationFrame(() => {
          bannerEl.style.animation = '';   // re-trigger slide-in
        });
        inputEl.classList.add('duplicate-detected');
        inputEl.classList.remove('is-invalid'); // don't double-show error
      } else {
        bannerEl.style.display = 'none';
        inputEl.classList.remove('duplicate-detected');
      }
    }

    /** Lightweight debounce — cancels previous timer on each call. */
    function debounce(fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    // ── Email check ────────────────────────────────────────────────────────
    const emailInput  = $('#companyEmail');
    const emailBanner = $('#emailDuplicateBanner');

    async function checkEmailDuplicate() {
      const email = (emailInput?.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        // Invalid format — clear duplicate state (format error is handled by validateCompanyDetails)
        dupState.emailExists = false;
        setDuplicateBannerState(emailInput, emailBanner, false);
        return;
      }

      // Show a tiny spinner while checking
      const emailGroup = emailInput?.closest('.form-group');
      let spinner = emailGroup?.querySelector('.duplicate-checking-spinner');
      if (emailGroup && !spinner) {
        spinner = document.createElement('span');
        spinner.className = 'duplicate-checking-spinner';
        emailGroup.classList.add('checking-email');
        emailGroup.appendChild(spinner);
      }

      try {
        const res = await fetch(`/api/public/check-email?email=${encodeURIComponent(email)}`);
        const json = await res.json();
        const exists = !!(json.success && json.exists);
        dupState.emailExists = exists;
        setDuplicateBannerState(emailInput, emailBanner, exists);
      } catch (_) {
        // Network error — fail open (don't block the user)
        dupState.emailExists = false;
        setDuplicateBannerState(emailInput, emailBanner, false);
      } finally {
        if (spinner) {
          spinner.remove();
          emailGroup?.classList.remove('checking-email');
        }
      }
    }

    const debouncedEmailCheck = debounce(checkEmailDuplicate, 600);

    if (emailInput) {
      emailInput.addEventListener('blur',  checkEmailDuplicate);
      emailInput.addEventListener('input', debouncedEmailCheck);
      // Clear banner immediately when user edits the field
      emailInput.addEventListener('input', () => {
        if (dupState.emailExists) {
          dupState.emailExists = false;
          setDuplicateBannerState(emailInput, emailBanner, false);
        }
      });
    }

    // ── Phone check ────────────────────────────────────────────────────────
    const phoneInput  = $('#companyPhone');
    const phoneBanner = $('#phoneDuplicateBanner');

    async function checkPhoneDuplicate() {
      const digits = (phoneInput?.value || '').replace(/\D/g, '');
      if (!digits || digits.length < 10) {
        dupState.phoneExists = false;
        setDuplicateBannerState(phoneInput, phoneBanner, false);
        return;
      }

      try {
        const res = await fetch(`/api/public/check-phone?phone=${encodeURIComponent(digits)}`);
        const json = await res.json();
        const exists = !!(json.success && json.exists);
        dupState.phoneExists = exists;
        setDuplicateBannerState(phoneInput, phoneBanner, exists);
      } catch (_) {
        dupState.phoneExists = false;
        setDuplicateBannerState(phoneInput, phoneBanner, false);
      }
    }

    const debouncedPhoneCheck = debounce(checkPhoneDuplicate, 600);

    if (phoneInput) {
      phoneInput.addEventListener('blur',  checkPhoneDuplicate);
      phoneInput.addEventListener('input', debouncedPhoneCheck);
      phoneInput.addEventListener('input', () => {
        if (dupState.phoneExists) {
          dupState.phoneExists = false;
          setDuplicateBannerState(phoneInput, phoneBanner, false);
        }
      });
    }

    // Expose dupState so validateCompanyDetails() can gate Step 2 progression
    state._dupState = dupState;
    // ── End Duplicate Registration Check ──────────────────────────────────

    // Billing toggle
    billingToggle.addEventListener('change', () => {
      state.billingCycle = billingToggle.checked ? 'yearly' : 'monthly';
      if (dynamicPlans.length) {
        renderDynamicPlansGrid();
        updateFooterPrice();
      } else {
        updatePlanPrices();
      }
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

    // Add tier button (only present on event setup step — guard against null)
    const btnAddTier = $('#btnAddTier');
    if (btnAddTier) {
      btnAddTier.addEventListener('click', addTierRow);
    }

    // Remove tier delegation (only present on event setup step — guard against null)
    const tiersContainer = $('#tiersContainer');
    if (tiersContainer) {
      tiersContainer.addEventListener('click', (e) => {
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

    // Avatar upload
    const btnUploadAvatar = $('#btnUploadAvatar');
    const avatarUpload = $('#avatarUpload');
    if (btnUploadAvatar && avatarUpload) {
      btnUploadAvatar.addEventListener('click', () => {
        avatarUpload.click();
      });
      avatarUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          showAlert('File Too Large', 'Please upload an image smaller than 2 MB.', 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          avatarBase64 = ev.target.result;
          const preview = $('#avatarPreview');
          if (preview) preview.src = avatarBase64;
        };
        reader.readAsDataURL(file);
      });
    }

    // Password visibility toggles
    $$('.password-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const container = btn.closest('.password-input-container');
        const input = container ? container.querySelector('input') : null;
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          
          // Toggle SVG icon
          if (isPassword) {
            btn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-off-icon"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            `;
          } else {
            btn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            `;
          }
        }
      });
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
    if (state.currentStep === 1) {
      btnNext.textContent = 'Continue to Account \u2192';
      btnNext.style.display = '';
    } else if (state.currentStep === 2) {
      btnNext.textContent = 'Save Account & Choose Plan \u2192';
      btnNext.style.display = '';
    } else if (state.currentStep === 3) {
      btnNext.style.display = '';
      updateFooterPrice();
    } else {
      btnNext.textContent = 'Continue';
      btnNext.style.display = '';
    }

    $('.wizard-footer').style.display = '';
  }

  function goBack() {
    if (state.currentStep <= 1) return;
    state.currentStep--;
    renderStep();
  }

  async function goNext() {
    if (!validateStep(state.currentStep)) return;

    if (state.currentStep === 1) {
      // Pre-fill login email on Step 2 from company email if empty
      const compEmail = $('#companyEmail') ? $('#companyEmail').value.trim() : '';
      if (compEmail && $('#accountEmail') && !$('#accountEmail').value) {
        $('#accountEmail').value = compEmail;
      }
      state.currentStep = 2;
      renderStep();
      return;
    }

    if (state.currentStep === 2) {
      // Provision account credentials in DB with unpaid/pending subscription status
      setLoading(true);
      try {
        await submitRegistration();
        await saveProfileDetails();
        state.currentStep = 3;
        renderStep();
      } catch (err) {
        showAlert('Account Creation Error', err.message, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (state.currentStep === 3) {
      // Trigger Razorpay payment checkout
      await triggerRazorpayCheckout();
      return;
    }
  }

  // ---------- Validation ----------
  function validateStep(step) {
    clearValidation();

    switch (step) {
      case 1:
        return validateCompanyDetails();
      case 2:
        return validateAccount();
      case 3:
        return validatePlanSelection();
      default:
        return true;
    }
  }

  function clearValidation() {
    $$('.form-control.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    $$('.field-error').forEach((el) => {
      el.style.display = '';
    });
  }

  function markInvalid(id, message) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('is-invalid');
      const group = el.closest('.form-group');
      const errorEl = group ? group.querySelector('.field-error') : null;
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
    if (!email || !isValidEmail(email)) {
      markInvalid('companyEmail', 'Valid email is required');
      valid = false;
    } else if (state._dupState && state._dupState.emailExists) {
      // Duplicate email detected — banner is already showing; add red ring and block
      const emailInput = $('#companyEmail');
      if (emailInput) emailInput.classList.add('duplicate-detected');
      // Scroll the banner into view for users who missed it
      const banner = $('#emailDuplicateBanner');
      if (banner) {
        banner.style.display = 'flex';
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      valid = false;
    }

    const phone = $('#companyPhone').value.trim();
    if (!phone || phone.length < 10) {
      markInvalid('companyPhone', 'Valid phone number is required');
      valid = false;
    } else if (state._dupState && state._dupState.phoneExists) {
      // Duplicate phone detected
      const phoneInput = $('#companyPhone');
      if (phoneInput) phoneInput.classList.add('duplicate-detected');
      const banner = $('#phoneDuplicateBanner');
      if (banner) {
        banner.style.display = 'flex';
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      valid = false;
    }

    const industry = $('#companyIndustry').value;
    if (!industry) { markInvalid('companyIndustry', 'Please select an industry'); valid = false; }

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

  function sanitizePhone(phone) {
    return phone.replace(/\D/g, '');
  }

  function showQrPaymentModal(planName, price, billingCycle, onPaymentSuccess) {
    if (!document.getElementById('qr-scanner-styles')) {
        const style = document.createElement('style');
        style.id = 'qr-scanner-styles';
        style.innerHTML = `
            @keyframes scan-laser {
                0% { top: 5%; }
                50% { top: 95%; }
                100% { top: 5%; }
            }
            .qr-modal-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            .qr-modal-overlay.active {
                opacity: 1;
            }
            .qr-modal-card {
                background: #ffffff;
                width: 100%;
                max-width: 420px;
                border-radius: 20px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                padding: 32px;
                text-align: center;
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            .qr-modal-overlay.active .qr-modal-card {
                transform: scale(1);
            }
            .qr-scanner-frame {
                position: relative;
                width: 240px;
                height: 240px;
                margin: 24px auto;
                border: 4px solid #667eea;
                border-radius: 16px;
                overflow: hidden;
                background: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .qr-laser {
                position: absolute;
                left: 5%;
                right: 5%;
                height: 3px;
                background: #ef4444;
                box-shadow: 0 0 10px #ef4444, 0 0 4px #ef4444;
                animation: scan-laser 2.5s ease-in-out infinite;
            }
            .success-checkmark {
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: #ffffff;
                z-index: 10;
            }
            .checkmark-circle {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: #48bb78;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px;
                color: #ffffff;
                font-size: 40px;
                box-shadow: 0 10px 15px -3px rgba(72, 187, 120, 0.3);
            }
            .btn-sim-success {
                background: #667eea;
                color: #fff;
                border: none;
                width: 100%;
                padding: 12px;
                font-weight: 600;
                border-radius: 12px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .btn-sim-success:hover {
                background: #5a6fd6;
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'qr-modal-overlay';
    overlay.innerHTML = `
        <div class="qr-modal-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a;">Plan Payment</h3>
                <button class="qr-close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">&times;</button>
            </div>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;">Scan to simulate payment with UPI (GPay, PhonePe, Paytm, etc.)</p>
            <div style="font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 16px;">Amount: &#8377; ${price.toLocaleString('en-IN')}</div>
            
            <div class="qr-scanner-frame">
                <!-- SVG UPI QR code -->
                <svg width="180" height="180" viewBox="0 0 29 29" style="display: block;">
                    <path d="M0 0h9v9H0zm1 1h7v7H1zm13 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm2 0h9v9h-9zm1 1h7v7h-7zm-4 1h1v1h-1zm0 2h1v1h-1zm2 0h1v1h-1zm0 1h1v1h-1zm-2 1h1v1h-1zm6 4h1v1h-1zm-6 1h1v1h-1zm1 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-9 1h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zM0 20h9v9H0zm1 1h7v7H1zm11 0h1v1h-1zm2 0h1v1h-1zm3 0h1v1h-1zm3 0h1v1h-1zm4 0h5v5h-5zm0 6h1v1h-1zm3 0h1v1h-1zm1 0h1v1h-1zm-4 1h1v1h-1zm1 0h1v1h-1zm3 0h1v1h-1z" fill="#0f172a"/>
                </svg>
                <div class="qr-laser"></div>
                
                <div class="success-checkmark">
                    <div class="checkmark-circle">&#10003;</div>
                    <h4 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #1e293b;">Payment Successful</h4>
                    <p style="margin: 0; font-size: 13px; color: #64748b;">Processing signup...</p>
                </div>
            </div>
            
            <button id="btn-qr-success" class="btn-sim-success">Simulate Successful Scan</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate in
    setTimeout(() => overlay.classList.add('active'), 10);
    
    // Close handler
    const closeBtn = overlay.querySelector('.qr-close-btn');
    closeBtn.onclick = () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    };
    
    // Success simulation handler
    const successBtn = overlay.querySelector('#btn-qr-success');
    successBtn.onclick = () => {
        const checkmark = overlay.querySelector('.success-checkmark');
        checkmark.style.display = 'flex';
        successBtn.style.display = 'none';
        
        setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                if (typeof onPaymentSuccess === 'function') {
                    onPaymentSuccess();
                }
            }, 300);
        }, 1800);
    };
  }

  // ---------- Plan Selection ----------
  function selectPlan(tier) {
    selectedTier = tier;
    window.selectedTier = tier;
    state.selectedPlan = tier.toLowerCase();

    const plan = dynamicPlans.find(p => p.name.toLowerCase() === tier.toLowerCase());
    if (plan) {
      state.selectedPlanId = plan.id;
    }

    $$('.plan-card').forEach((card) => {
      const isSelected = card.dataset.planName.toLowerCase() === tier.toLowerCase();
      card.classList.toggle('selected', isSelected);
      card.classList.toggle('active', isSelected);
    });

    updateFooterPrice();
  }

  function updateFooterPrice() {
    if (state.currentStep !== 3) return;

    if (!selectedTier) {
      btnNext.textContent = 'Pay & Launch Workspace';
      return;
    }

    const tLower = (selectedTier || '').toLowerCase();
    let monthlyPriceVal = 1;

    const plan = dynamicPlans.find(p => p.name.toLowerCase() === selectedTier.toLowerCase());
    if (plan) {
      monthlyPriceVal = plan.price_inr !== undefined ? plan.price_inr : (plan.price_monthly || 0);
    }
    
    // Normalize prices: Basic ₹1, Standard ₹5, Premium ₹10
    if (!monthlyPriceVal || monthlyPriceVal === 999 || monthlyPriceVal === 99900) {
      if (tLower.includes('standard') || tLower.includes('pro') || tLower.includes('scaleup')) {
        monthlyPriceVal = 5;
      } else if (tLower.includes('premium') || tLower.includes('enterprise')) {
        monthlyPriceVal = 10;
      } else {
        monthlyPriceVal = 1;
      }
    } else if (monthlyPriceVal === 1999 || monthlyPriceVal === 199900) {
      monthlyPriceVal = 5;
    } else if (monthlyPriceVal === 2599 || monthlyPriceVal === 4999 || monthlyPriceVal === 259900) {
      monthlyPriceVal = 10;
    }

    const yearly = state.billingCycle === 'yearly';
    const priceVal = yearly 
      ? (plan && plan.price_annual !== undefined ? plan.price_annual : Math.round(monthlyPriceVal * 12 * 0.83))
      : monthlyPriceVal;

    const priceStr = priceVal === 0 ? 'Free' : `\u20B9${priceVal.toLocaleString('en-IN')}`;
    const suffix = yearly ? '/year' : '/month';
    btnNext.textContent = `Pay & Launch Workspace (${priceStr}${suffix})`;
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
        periodEl.textContent = yearly ? '/year (billed annually)' : '/month';
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
  async function submitRegistration() {
    const email = $('#accountEmail').value.trim();
    const password = $('#accountPassword').value;
    const confirmPassword = $('#accountPasswordConfirm').value;
    const companyName = $('#companyName').value.trim();
    const jobTitle = $('#accountJobTitle') ? $('#accountJobTitle').value.trim() : '';
    const bio = $('#accountBio') ? $('#accountBio').value.trim() : '';

    const res = await fetch('/api/onboarding/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        confirmPassword,
        name: $('#contactName').value.trim(),
        company_name: companyName,
        phone: $('#companyPhone').value.trim(),
        website: $('#companyWebsite').value.trim(),
        industry: $('#companyIndustry').value,
        plan: state.selectedPlan,
        billing_cycle: state.billingCycle,
        referral_code: $('#referralCode').value.trim() || null,
        slug: state.slug,
        termsOfService: $('#tosCheckbox').checked,
        dataProcessing: $('#dpaCheckbox').checked,
        job_title: jobTitle,
        bio: bio,
        order_id: state.orderId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || data.message || 'Signup failed. Please try again.');
    }

    state.authToken = data.data.session.access_token;
    state.tenantId = data.data.tenant.id;
    state.slug = data.data.tenant.slug || state.slug;

    // Store in localStorage
    localStorage.setItem('onboarding_token', state.authToken);
    localStorage.setItem('onboarding_tenant_id', state.tenantId);
    localStorage.setItem('onboarding_slug', state.slug);

    // Store in localStorage for dashboard authentication (DashboardAuth)
    localStorage.setItem('dashboard_access_token', state.authToken);
    localStorage.setItem('dashboard_refresh_token', data.data.session.refresh_token || '');
    localStorage.setItem('dashboard_tenant', JSON.stringify(data.data.tenant));
    localStorage.setItem('authToken', state.authToken);

    // Record legal acceptances (fire-and-forget)
    recordLegalAcceptances(state.authToken, state.slug);
  }

  // ---------- Profile Save ----------
  async function saveProfileDetails() {
    const token = state.authToken || localStorage.getItem('onboarding_token');
    const slug = state.slug || localStorage.getItem('onboarding_slug');

    if (!token || !slug) return;

    let logo_url = '';

    // Upload avatar if provided
    if (avatarBase64) {
      try {
        const avatarRes = await fetch(`/api/t/${slug}/account/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ image_base64: avatarBase64 })
        });
        const avatarData = await avatarRes.json();
        if (avatarRes.ok && avatarData.success) {
          logo_url = avatarData.data.logo_url;
        }
      } catch (err) {
        console.warn('Avatar upload failed, continuing without avatar:', err);
      }
    }

    const jobTitle = $('#accountJobTitle') ? $('#accountJobTitle').value.trim() : '';
    const bio      = $('#accountBio')      ? $('#accountBio').value.trim()      : '';
    const website  = $('#accountWebsite')  ? $('#accountWebsite').value.trim()  : '';

    try {
      await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          job_title: jobTitle,
          bio: bio,
          logo_url: logo_url || undefined,
          custom_domain: website || undefined
        })
      });
    } catch (err) {
      console.warn('Profile save failed, continuing:', err);
    }
  }

  async function redirectToDashboard() {
    setLoading(true);
    try {
      await submitRegistration();
      // Save extended profile details (avatar, job title, bio, website) — non-blocking on failure
      await saveProfileDetails();
      window.location.href = '/dashboard/';
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
      if (state.currentStep === 2) {
        updateFooterPrice();
      } else {
        btnNext.textContent = btnNext.dataset.origText || 'Continue';
      }
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

  let dynamicPlans = [];
  let selectedTier = '';
  window.selectedTier = '';

  // Maps display plan names (from DB) -> backend-accepted enum values
  const tierMapping = {
    'Basic':      'basic',
    'LaunchPad':  'starter',
    'Launchpad':  'starter',
    'launchpad':  'starter',
    'Standard':   'pro',
    'standard':   'pro',
    'ScaleUp Pro': 'pro',
    'Scaleup Pro': 'pro',
    'scaleup pro': 'pro',
    'ScaleUp':    'pro',
    'scaleup':    'pro',
    'Premium':    'premium',
    'Enterprise': 'enterprise',
    // Passthrough for already-normalized values
    'basic':      'basic',
    'starter':    'starter',
    'pro':        'pro',
    'premium':    'premium',
    'enterprise': 'enterprise',
    'vip':        'vip',
    'waitlist':   'waitlist'
  };

  /** Returns the backend-safe tier enum value for a given display name */
  function normalizeTier(name) {
    if (!name) return 'basic';
    return tierMapping[name] || tierMapping[name.toLowerCase()] || name.toLowerCase();
  }

  function loadRazorpayScript() {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function initPricing() {
    const grid = $('.plans-grid');
    if (!grid) return;

    const spinner = '<div class="loader"></div>';
    grid.innerHTML = `
      <div class="pricing-spinner-container" style="grid-column: span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 12px; width: 100%;">
        ${spinner}
        <span style="color: var(--text-light); font-size: 14px; font-weight: 500;">Loading plans from database...</span>
      </div>
    `;

    try {
      const res = await fetch('/api/public/plans').then(r => r.json());
      if (res.success && Array.isArray(res.data)) {
        dynamicPlans = res.data;
        renderDynamicPlansGrid();
      } else {
        throw new Error('Invalid plans data');
      }
    } catch (err) {
      console.error('Failed to load plans from DB during onboarding:', err);
      grid.innerHTML = `<p style="grid-column: span 2; text-align: center; color: var(--danger); width: 100%;">Failed to load pricing plans. Please refresh.</p>`;
    }
  }

  function renderDynamicPlansGrid() {
    const grid = $('.plans-grid');
    if (!grid || !dynamicPlans.length) return;

    const yearly = state.billingCycle === 'yearly';

    grid.innerHTML = dynamicPlans.map(plan => {
      const planNameLower = plan.name.toLowerCase();
      const isPopular = planNameLower === 'standard'
        || planNameLower === 'scaleup pro'
        || planNameLower === 'scaleup';
      
      let monthlyPriceVal = plan.price_inr !== undefined ? plan.price_inr : (plan.price_monthly || 0);
      if (monthlyPriceVal === 999 || monthlyPriceVal === 99900) monthlyPriceVal = 1;
      else if (monthlyPriceVal === 1999 || monthlyPriceVal === 199900) monthlyPriceVal = 5;
      else if (monthlyPriceVal === 2599 || monthlyPriceVal === 4999 || monthlyPriceVal === 259900) monthlyPriceVal = 10;

      const priceVal = yearly 
        ? (plan.price_annual !== undefined ? plan.price_annual : Math.round(monthlyPriceVal * 12 * 0.83))
        : monthlyPriceVal;

      const priceStr = priceVal === 0 ? 'Free' : priceVal.toLocaleString('en-IN');
      const periodStr = yearly ? '/year (billed annually)' : '/month';

      // Default distinct tier descriptions
      let descStr = plan.description || '';
      if (!descStr) {
        if (planNameLower.includes('standard') || planNameLower.includes('pro') || planNameLower.includes('scaleup')) {
          descStr = '10 events + email templates + advanced analytics';
        } else if (planNameLower.includes('premium') || planNameLower.includes('enterprise')) {
          descStr = '50 events + email templates + advanced analytics + dynamic flyer generations';
        } else {
          descStr = '3 events + email templates';
        }
      }

      const featuresArray = Array.isArray(plan.features) ? plan.features : (typeof plan.features === 'string' ? JSON.parse(plan.features) : []);
      const featuresList = featuresArray.map(f => `<li>${escapeHtml(f)}</li>`).join('');

      const isSelected = selectedTier && selectedTier.toLowerCase() === plan.name.toLowerCase();
      const activeClass = isSelected ? 'selected active' : '';

      return `
        <div class="plan-card ${activeClass}" data-plan-id="${plan.id}" data-plan-name="${plan.name}">
          ${isPopular ? '<div class="popular-badge">Popular</div>' : ''}
          <div class="plan-name">${escapeHtml(plan.name)}</div>
          <div class="plan-price">&#8377; ${priceStr}</div>
          <div class="plan-period">${periodStr}</div>
          <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px; font-weight: 500;">${escapeHtml(descStr)}</p>
          <ul class="plan-features">
            ${featuresList}
          </ul>
        </div>
      `;
    }).join('');

    // Re-bind click events
    $$('.plan-card').forEach(card => {
      card.addEventListener('click', () => {
        selectPlan(card.dataset.planName);
      });
    });

    if (!selectedTier && dynamicPlans.length > 0) {
      // Default to Standard or first
      const defaultP = dynamicPlans.find(p => p.name.toLowerCase().includes('standard')) || dynamicPlans[0];
      selectPlan(defaultP.name);
    }
  }

  async function handlePayment() {
    if (!selectedTier) {
      showAlert('Selection Required', 'Please select a plan to continue.', 'warning');
      return;
    }

    const plan = dynamicPlans.find(p => p.name.toLowerCase() === selectedTier.toLowerCase());
    if (!plan) {
      showAlert('Selection Required', 'Please select a plan to continue.', 'warning');
      return;
    }

    const yearly = state.billingCycle === 'yearly';
    let monthlyPriceVal = plan.price_inr !== undefined ? plan.price_inr : (plan.price_monthly || 0);
    if (monthlyPriceVal === 999 || monthlyPriceVal === 99900) monthlyPriceVal = 1;
    else if (monthlyPriceVal === 1999 || monthlyPriceVal === 199900) monthlyPriceVal = 5;
    else if (monthlyPriceVal === 2599 || monthlyPriceVal === 4999 || monthlyPriceVal === 259900) monthlyPriceVal = 10;

    const amount = yearly 
      ? (plan.price_annual !== undefined ? plan.price_annual : Math.round(monthlyPriceVal * 12 * 0.83))
      : monthlyPriceVal;

    // If it's a free plan (amount === 0), bypass payment and proceed to Step 3
    if (amount === 0) {
      proceedToStep3();
      return;
    }

    const sdkLoaded = await loadRazorpayScript();
    if (!sdkLoaded) {
      showAlert('Payment Error', 'Failed to load Razorpay SDK. Please check your internet connection.', 'error');
      return;
    }

    setLoading(true);
    try {
      const email = $('#companyEmail').value.trim();
      const name = $('#contactName').value.trim();
      const phone = $('#companyPhone').value.trim();
      
      const generatedOrderId = 'order_' + Math.random().toString(36).substring(2, 15);
      const billingCycle = state.billingCycle;

      let res;
      try {
        res = await fetch('/api/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: normalizeTier(selectedTier),   // normalized enum value e.g. 'basic', 'standard', 'premium'
            billing_cycle: billingCycle,
            order_id: generatedOrderId
          })
        });

        if (res.status === 500) {
          alert('Server error (500). Please try again later.');
          throw new Error('Server error (500). Please try again later.');
        }
      } catch (fetchErr) {
        if (res && res.status === 500) {
          // already alerted
        } else if (fetchErr.message && fetchErr.message.includes('500')) {
          // already alerted
        } else {
          showAlert('Payment Error', 'Network or connection error occurred.', 'error');
        }
        throw fetchErr;
      }

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.error?.message || 'Failed to create payment order');
      }

      const data = orderData;

      // Dynamic amount resolution (Basic: ₹1, Standard: ₹5, Premium: ₹10)
      let dynamicAmountInRupees = (orderData.amount !== undefined && orderData.amount !== null && orderData.amount > 0)
        ? orderData.amount
        : amount;
      
      if (!dynamicAmountInRupees || dynamicAmountInRupees === 999 || dynamicAmountInRupees === 99900) {
        const tLower = (selectedTier || '').toLowerCase();
        if (tLower.includes('standard') || tLower.includes('pro') || tLower.includes('scaleup')) {
          dynamicAmountInRupees = 5;
        } else if (tLower.includes('premium') || tLower.includes('enterprise')) {
          dynamicAmountInRupees = 10;
        } else {
          dynamicAmountInRupees = 1;
        }
      }

      // Convert to Paise for Razorpay (INR * 100): 1 * 100 = 100 paise, 5 * 100 = 500 paise, 10 * 100 = 1000 paise
      const amountInPaise = Math.round(Number(dynamicAmountInRupees) * 100);
      console.log(`[Razorpay Checkout Debug] Selected Tier: ${selectedTier}, Dynamic Amount (INR): ₹${dynamicAmountInRupees}, Amount in Paise for Razorpay: ${amountInPaise}`);

      // Save state to sessionStorage before checkout
      const wizardState = {
        companyName: $('#companyName').value,
        contactName: $('#contactName').value,
        companyEmail: $('#companyEmail').value,
        companyPhone: $('#companyPhone').value,
        companyWebsite: $('#companyWebsite') ? $('#companyWebsite').value : '',
        companyIndustry: $('#companyIndustry').value,
        referralCode: $('#referralCode') ? $('#referralCode').value : '',
        selectedPlan: state.selectedPlan,
        selectedPlanId: state.selectedPlanId,
        selectedTier: selectedTier,
        billingCycle: state.billingCycle,
        orderId: orderData.order_id
      };
      sessionStorage.setItem('onboarding_wizard_state', JSON.stringify(wizardState));

      const options = {
        key: data.key_id || 'rzp_live_T5Swpc5DUCDVPg',
        amount: amountInPaise, // Dynamically mapped amount in paise (100 for ₹1, 500 for ₹5, 1000 for ₹10)
        currency: orderData.currency || 'INR',
        name: 'EventReg Platform',
        description: `Subscription: ${plan.name} (${state.billingCycle})`,
        order_id: orderData.order_id,
        prefill: {
          name: name,
          email: email,
          contact: phone,
        },
        theme: {
          color: '#667eea',
        },
        redirect: true,
        callback_url: `${window.location.origin}/api/payment-callback`,
        modal: {
          ondismiss: () => {
            showAlert('Payment Cancelled', 'The subscription payment was cancelled. Please complete payment to continue.', 'warning');
          }
        }
      };

      console.log('DEBUG: Razorpay Initialization Data:', {
        key: options.key,
        order_id: options.order_id,
        amount: options.amount
      });
      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err) {
      showAlert('Payment Error', err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const triggerRazorpayCheckout = handlePayment;

  function proceedToStep3() {
    if (state.currentStep === 2) {
      const email = $('#companyEmail').value;
      if (email) {
        $('#accountEmail').value = email;
      }
      state.currentStep = 3;
      renderStep();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
