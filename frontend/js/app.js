/**
 * Main Application
 * AI for MSME Summit Registration
 */

// Dynamic settings loaded from API
let dynamicConfig = null;

// 3-Day Offer System
let offerCountdownInterval;
let offerExpired = false;
let offerEndDate = null;

// Seat availability cache
let seatAvailability = null;

// Current selected tier
let selectedTier = 'vip'; // Default to VIP (will be adjusted based on availability)

/**
 * Fetch dynamic settings from API and merge with static config
 * Falls back to static config if API fails
 */
async function loadDynamicSettings() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/settings`);
    if (!response.ok) {
      console.warn('Failed to fetch dynamic settings, using static config');
      return;
    }

    dynamicConfig = await response.json();

    // Merge offer settings
    if (dynamicConfig.offer) {
      CONFIG.OFFER = {
        ...CONFIG.OFFER,
        startDate: dynamicConfig.offer.startDate || CONFIG.OFFER.startDate,
        durationDays: dynamicConfig.offer.durationDays || CONFIG.OFFER.durationDays,
        discountAmount: dynamicConfig.offer.discountAmount || CONFIG.OFFER.discountAmount,
        isActive: dynamicConfig.offer.isActive ?? CONFIG.OFFER.isActive,
      };
    }

    // Merge pricing settings
    if (dynamicConfig.pricing) {
      if (dynamicConfig.pricing.vip) {
        CONFIG.TIERS.vip.offerPrice = dynamicConfig.pricing.vip.offerPrice || CONFIG.TIERS.vip.offerPrice;
        CONFIG.TIERS.vip.originalPrice = dynamicConfig.pricing.vip.originalPrice || CONFIG.TIERS.vip.originalPrice;
      }
      if (dynamicConfig.pricing.standard) {
        CONFIG.TIERS.standard.offerPrice = dynamicConfig.pricing.standard.offerPrice || CONFIG.TIERS.standard.offerPrice;
        CONFIG.TIERS.standard.originalPrice = dynamicConfig.pricing.standard.originalPrice || CONFIG.TIERS.standard.originalPrice;
      }
      if (dynamicConfig.pricing.basic) {
        CONFIG.TIERS.basic.offerPrice = dynamicConfig.pricing.basic.offerPrice || CONFIG.TIERS.basic.offerPrice;
        CONFIG.TIERS.basic.originalPrice = dynamicConfig.pricing.basic.originalPrice || CONFIG.TIERS.basic.originalPrice;
      }
      if (dynamicConfig.pricing.waitlist) {
        CONFIG.TIERS.waitlist.offerPrice = dynamicConfig.pricing.waitlist.price || CONFIG.TIERS.waitlist.offerPrice;
        CONFIG.TIERS.waitlist.originalPrice = dynamicConfig.pricing.waitlist.price || CONFIG.TIERS.waitlist.originalPrice;
      }
    }

    // Merge event settings
    if (dynamicConfig.event) {
      CONFIG.EVENT = {
        ...CONFIG.EVENT,
        name: dynamicConfig.event.name || CONFIG.EVENT.name,
        date: dynamicConfig.event.date || CONFIG.EVENT.date,
        time: dynamicConfig.event.time || CONFIG.EVENT.time,
        venue: dynamicConfig.event.venue || CONFIG.EVENT.venue,
      };
    }

    console.log('Dynamic settings loaded successfully');
  } catch (error) {
    console.warn('Error loading dynamic settings:', error);
    // Continue with static config
  }
}

/**
 * Initialize the 3-day offer countdown system
 */
function initOfferCountdown() {
  if (!CONFIG.OFFER.isActive) {
    offerExpired = true;
    updatePricingDisplay(true);
    return;
  }

  // Calculate offer end date
  const startDate = new Date(CONFIG.OFFER.startDate);
  offerEndDate = new Date(startDate.getTime() + (CONFIG.OFFER.durationDays * 24 * 60 * 60 * 1000));

  // Check if offer has expired
  const now = new Date();
  if (now >= offerEndDate) {
    offerExpired = true;
    handleOfferExpiry();
    return;
  }

  // Start countdown
  updateOfferCountdown();
  offerCountdownInterval = setInterval(updateOfferCountdown, 1000);
}

/**
 * Update the offer countdown display
 */
function updateOfferCountdown() {
  const now = new Date();
  const remaining = offerEndDate - now;

  if (remaining <= 0) {
    clearInterval(offerCountdownInterval);
    offerExpired = true;
    handleOfferExpiry();
    return;
  }

  // Calculate days, hours, minutes, seconds
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

  // Update timer displays
  const countdownTimer = document.getElementById('countdown-timer');
  const offerTimer = document.getElementById('offer-timer');
  const offerBanner = document.getElementById('offer-banner');

  let timeString;
  if (days > 0) {
    timeString = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    timeString = `${hours}h ${minutes}m ${seconds}s`;
  } else {
    timeString = `${minutes}m ${seconds}s`;
  }

  if (countdownTimer) countdownTimer.textContent = timeString;
  if (offerTimer) offerTimer.textContent = timeString;

  // Update banner text
  if (offerBanner) {
    const offerText = offerBanner.querySelector('.offer-text');
    if (offerText) {
      if (days > 0) {
        offerText.innerHTML = `Early Bird ends in <strong>${days} day${days > 1 ? 's' : ''}</strong>`;
      } else if (hours > 0) {
        offerText.innerHTML = `Only <strong>${hours} hour${hours > 1 ? 's' : ''}</strong> left!`;
      } else {
        offerText.innerHTML = `<strong>Last chance!</strong> Offer ending soon`;
      }
    }
  }
}

/**
 * Handle offer expiry
 */
function handleOfferExpiry() {
  const offerBanner = document.getElementById('offer-banner');
  const countdownTimer = document.getElementById('countdown-timer');
  const offerTimer = document.getElementById('offer-timer');

  if (offerBanner) {
    offerBanner.classList.add('expired');
    const offerText = offerBanner.querySelector('.offer-text');
    if (offerText) {
      offerText.innerHTML = 'Early bird offer has <strong>ended</strong>';
    }
  }

  if (countdownTimer) countdownTimer.textContent = 'ENDED';
  if (offerTimer) offerTimer.textContent = 'ENDED';

  // Update pricing to original
  updatePricingDisplay(true);
}

/**
 * Update pricing display based on offer status
 */
function updatePricingDisplay(showOriginal = false) {
  const tierCards = document.querySelectorAll('.tier-card');
  tierCards.forEach(card => {
    const tier = card.dataset.tier;
    const tierConfig = CONFIG.TIERS[tier];
    if (!tierConfig) return;

    const offerPriceEl = card.querySelector('.tier-offer-price');
    const discountEl = card.querySelector('.tier-discount');
    const originalPriceEl = card.querySelector('.tier-original-price');

    if (showOriginal || offerExpired) {
      if (offerPriceEl) offerPriceEl.innerHTML = `&#8377;${tierConfig.originalPrice.toLocaleString('en-IN')}`;
      if (discountEl) discountEl.style.display = 'none';
      if (originalPriceEl) originalPriceEl.style.display = 'none';
    } else {
      if (offerPriceEl) offerPriceEl.innerHTML = `&#8377;${tierConfig.offerPrice.toLocaleString('en-IN')}`;
      if (discountEl) discountEl.style.display = 'inline-block';
      if (originalPriceEl) originalPriceEl.style.display = 'block';
    }
  });

  // Update sticky bar
  updateStickyBarPrice();
}

/**
 * Select a tier
 */
function selectTier(tier) {
  selectedTier = tier;

  // Update hidden input
  const tierInput = document.getElementById('tier');
  if (tierInput) tierInput.value = tier;

  // Update visual selection
  document.querySelectorAll('.tier-card').forEach(card => {
    card.classList.remove('selected');
    if (card.dataset.tier === tier) {
      card.classList.add('selected');
    }
  });

  // Update sticky bar price
  updateStickyBarPrice();
}

/**
 * Update sticky bar with current tier price
 */
function updateStickyBarPrice() {
  const tierConfig = CONFIG.TIERS[selectedTier];
  if (!tierConfig) return;

  const stickyOfferPrice = document.querySelector('.offer-price');
  const stickyOriginalPrice = document.querySelector('.offer-original');
  const offerBadge = document.querySelector('.offer-badge');

  if (stickyOfferPrice) {
    const price = offerExpired ? tierConfig.originalPrice : tierConfig.offerPrice;
    stickyOfferPrice.innerHTML = `&#8377;${price.toLocaleString('en-IN')}`;
  }

  if (stickyOriginalPrice) {
    stickyOriginalPrice.innerHTML = `&#8377;${tierConfig.originalPrice.toLocaleString('en-IN')}`;
    stickyOriginalPrice.style.display = offerExpired ? 'none' : 'inline';
  }

  if (offerBadge) {
    offerBadge.style.display = offerExpired ? 'none' : 'inline-block';
  }
}

/**
 * Get current price for tier (considers offer status)
 */
function getOfferPrice(tier) {
  const tierConfig = CONFIG.TIERS[tier];
  if (!tierConfig) return 0;
  return offerExpired ? tierConfig.originalPrice : tierConfig.offerPrice;
}

/**
 * Fetch seat availability and set default tier
 */
async function initSeatAvailability() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/seats`);
    if (response.ok) {
      seatAvailability = await response.json();
      setDefaultTierByAvailability();
      updateLiveSeatCounter();
    }
  } catch (error) {
    console.error('Failed to fetch seat availability:', error);
    // Default to VIP if API fails
    selectTier('vip');
  }
}

/**
 * Set default tier based on availability (VIP → Standard → Basic → Waitlist)
 */
function setDefaultTierByAvailability() {
  if (!seatAvailability || !seatAvailability.seats) {
    selectTier('vip');
    return;
  }

  const seats = seatAvailability.seats;
  const vipSeats = seats.find(s => s.tier_name === 'vip');
  const standardSeats = seats.find(s => s.tier_name === 'standard');
  const basicSeats = seats.find(s => s.tier_name === 'basic');

  if (vipSeats && vipSeats.available_seats > 0) {
    selectTier('vip');
  } else if (standardSeats && standardSeats.available_seats > 0) {
    selectTier('standard');
  } else if (basicSeats && basicSeats.available_seats > 0) {
    selectTier('basic');
  } else {
    // All sold out - redirect to waitlist
    window.location.href = '/waitlist.html';
  }
}

/**
 * Update live seat counter display
 */
function updateLiveSeatCounter() {
  if (!seatAvailability || !seatAvailability.seats) return;

  const seats = seatAvailability.seats;
  let totalAvailable = 0;
  let totalSold = 0;

  seats.forEach(seat => {
    if (seat.tier_name !== 'waitlist') {
      totalAvailable += seat.available_seats || 0;
      totalSold += seat.sold_seats || 0;
    }
  });

  // Update counter displays
  const seatsLeftEl = document.getElementById('seats-left');
  const registeredEl = document.getElementById('total-registered');

  if (seatsLeftEl) seatsLeftEl.textContent = totalAvailable;
  if (registeredEl) registeredEl.textContent = totalSold;

  // Update tier-specific availability
  seats.forEach(seat => {
    const tierCard = document.querySelector(`.tier-card[data-tier="${seat.tier_name}"]`);
    if (tierCard) {
      const availabilityEl = tierCard.querySelector('.tier-availability');
      if (availabilityEl) {
        if (seat.available_seats <= 0) {
          availabilityEl.textContent = 'SOLD OUT';
          availabilityEl.classList.add('sold-out');
          tierCard.classList.add('sold-out');
        } else if (seat.available_seats <= 5) {
          availabilityEl.textContent = `Only ${seat.available_seats} left!`;
          availabilityEl.classList.add('low-stock');
        } else {
          availabilityEl.textContent = `${seat.available_seats} seats available`;
        }
      }
    }
  });
}

/**
 * Start polling for seat updates
 */
function startSeatPolling() {
  setInterval(async () => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/seats`);
      if (response.ok) {
        seatAvailability = await response.json();
        updateLiveSeatCounter();
      }
    } catch (error) {
      console.error('Seat polling error:', error);
    }
  }, CONFIG.SEAT_POLL_INTERVAL);
}

// Modal functions
function openRegistrationModal() {
  document.getElementById('registration-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeRegistrationModal() {
  document.getElementById('registration-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function closeSuccessModal() {
  document.getElementById('success-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// BizFlow modal functions
function openBizflowModal() {
  document.getElementById('bizflow-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBizflowModal() {
  document.getElementById('bizflow-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// Privacy Policy modal functions
function openPrivacyModal() {
  document.getElementById('privacy-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePrivacyModal() {
  document.getElementById('privacy-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// Terms of Service modal functions
function openTermsModal() {
  document.getElementById('terms-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeTermsModal() {
  document.getElementById('terms-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// FAQ toggle
function toggleFaq(button) {
  const faqItem = button.parentElement;
  const answer = faqItem.querySelector('.faq-answer');
  const isActive = button.classList.contains('active');

  // Close all FAQs
  document.querySelectorAll('.faq-question').forEach(q => {
    q.classList.remove('active');
    q.parentElement.querySelector('.faq-answer').classList.remove('active');
  });

  // Open clicked FAQ if it wasn't already open
  if (!isActive) {
    button.classList.add('active');
    answer.classList.add('active');
  }
}

class RegistrationApp {
  constructor() {
    this.init();
  }

  async init() {
    this.cacheElements();
    this.bindEvents();

    // Load dynamic settings from API first (falls back to static config)
    await loadDynamicSettings();

    // Initialize 3-day offer countdown
    initOfferCountdown();

    // Initialize seat availability and set default tier
    await initSeatAvailability();

    // Start polling for seat updates
    startSeatPolling();
  }

  cacheElements() {
    this.elements = {
      registrationForm: document.getElementById('registration-form'),
      submitBtn: document.getElementById('submit-btn'),
      loadingOverlay: document.getElementById('loading-overlay'),
      successModal: document.getElementById('success-modal'),
      registrationModal: document.getElementById('registration-modal'),
      bookingDetails: document.getElementById('booking-details'),
      whatsappLink: document.getElementById('whatsapp-link'),
    };
  }

  bindEvents() {
    // Form submission
    if (this.elements.registrationForm) {
      this.elements.registrationForm.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Form input validation
    const inputs = this.elements.registrationForm?.querySelectorAll('input, select');
    inputs?.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => this.clearFieldError(input));
    });

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      });
    }

    // Close modal on outside click
    document.getElementById('registration-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeRegistrationModal();
      }
    });

    document.getElementById('success-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeSuccessModal();
      }
    });

    document.getElementById('bizflow-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeBizflowModal();
      }
    });

    document.getElementById('privacy-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closePrivacyModal();
      }
    });

    document.getElementById('terms-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeTermsModal();
      }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeRegistrationModal();
        closeSuccessModal();
        closeBizflowModal();
        closePrivacyModal();
        closeTermsModal();
      }
    });
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (!this.validateForm()) {
      return;
    }

    const formData = this.getFormData();
    this.showLoading('Registering...');

    try {
      // For free registration, we'll create a direct registration without payment
      const response = await api.createOrder(formData);

      if (!response.success) {
        throw new ApiError(response.error?.message || 'Registration failed', response.error?.code || 'ERROR');
      }

      this.hideLoading();

      // If payment is required (price > 0), open Razorpay
      if (response.amount > 0) {
        this.openRazorpayCheckout(response, formData);
      } else {
        // Free registration - show success directly
        this.showSuccessModal({
          booking_id: response.booking_id || response.order_id,
          registration: {
            name: formData.name,
            email: formData.email,
            tier: formData.tier,
            amount_paid: 0
          }
        });
        this.resetForm();
        closeRegistrationModal();
      }
    } catch (error) {
      this.hideLoading();

      if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        this.showError('This email is already registered for the event.');
      } else {
        this.showError(error.message || 'Registration failed. Please try again.');
      }
    }
  }

  openRazorpayCheckout(orderData, formData) {
    const options = {
      key: orderData.key_id || CONFIG.RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: CONFIG.EVENT.name,
      description: 'Summit Registration',
      order_id: orderData.order_id,
      prefill: orderData.prefill || {
        name: formData.name,
        email: formData.email,
        contact: `+91${formData.phone}`,
      },
      notes: orderData.notes || {},
      theme: {
        color: '#059669',
      },
      handler: async (response) => {
        await this.handlePaymentSuccess(response);
      },
      modal: {
        ondismiss: () => {
          console.log('Payment modal closed');
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response) => {
      this.handlePaymentFailure(response);
    });
    rzp.open();
  }

  async handlePaymentSuccess(response) {
    this.showLoading('Verifying payment...');

    try {
      const verifyResponse = await api.verifyPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });

      this.hideLoading();

      if (verifyResponse.success) {
        this.showSuccessModal(verifyResponse);
        this.resetForm();
        closeRegistrationModal();
      } else {
        this.showError('Payment verification failed. Please contact support.');
      }
    } catch (error) {
      this.hideLoading();
      this.showError(error.message || 'Payment verification failed. Please contact support.');
    }
  }

  handlePaymentFailure(response) {
    console.error('Payment failed:', response.error);
    this.showError(`Payment failed: ${response.error.description}`);
  }

  showSuccessModal(data) {
    const reg = data.registration || {};
    const tierConfig = CONFIG.TIERS[reg.tier] || {};

    if (this.elements.bookingDetails) {
      this.elements.bookingDetails.innerHTML = `
        <p><span class="label">Name</span><span class="value">${this.escapeHtml(reg.name || '-')}</span></p>
        <p><span class="label">Email</span><span class="value">${this.escapeHtml(reg.email || '-')}</span></p>
        <p><span class="label">Booking ID</span><span class="value">${this.escapeHtml(data.booking_id || '-')}</span></p>
      `;
    }

    // Set WhatsApp group link (you can configure this in config.js)
    if (this.elements.whatsappLink) {
      this.elements.whatsappLink.href = 'https://chat.whatsapp.com/your-group-link';
    }

    this.elements.successModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  validateForm() {
    let isValid = true;
    const requiredFields = ['name', 'email', 'phone', 'business_name', 'industry', 'designation'];

    requiredFields.forEach(fieldName => {
      const input = document.getElementById(fieldName);
      if (input && !this.validateField(input)) {
        isValid = false;
      }
    });

    return isValid;
  }

  validateField(input) {
    const fieldName = input.name || input.id;
    const value = input.value.trim();
    let errorMessage = '';

    switch (fieldName) {
      case 'name':
        if (!value) {
          errorMessage = 'Name is required';
        } else if (value.length < 2) {
          errorMessage = 'Name must be at least 2 characters';
        }
        break;

      case 'email':
        if (!value) {
          errorMessage = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errorMessage = 'Please enter a valid email address';
        }
        break;

      case 'phone':
        if (!value) {
          errorMessage = 'Phone number is required';
        } else if (!/^[6-9]\d{9}$/.test(value)) {
          errorMessage = 'Please enter a valid 10-digit phone number';
        }
        break;

      case 'business_name':
        if (!value) {
          errorMessage = 'Business name is required';
        }
        break;

      case 'industry':
        if (!value) {
          errorMessage = 'Please select an industry';
        }
        break;

      case 'designation':
        if (!value) {
          errorMessage = 'Designation is required';
        }
        break;
    }

    this.setFieldError(input, errorMessage);
    return !errorMessage;
  }

  setFieldError(input, message) {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = message;
    }
    input.classList.toggle('error', !!message);
  }

  clearFieldError(input) {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = '';
    }
    input.classList.remove('error');
  }

  getFormData() {
    const form = this.elements.registrationForm;
    return {
      tier: form.tier?.value || 'standard',
      name: form.name.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim().replace(/\D/g, ''),
      business_name: form.business_name?.value.trim() || undefined,
      industry: form.industry?.value || undefined,
      designation: form.designation?.value.trim() || undefined,
      utm_source: this.getUrlParam('utm_source'),
      utm_medium: this.getUrlParam('utm_medium'),
      utm_campaign: this.getUrlParam('utm_campaign'),
    };
  }

  resetForm() {
    this.elements.registrationForm?.reset();
  }

  showLoading(message = 'Processing...') {
    const loaderText = this.elements.loadingOverlay?.querySelector('.loader-text');
    if (loaderText) {
      loaderText.textContent = message;
    }
    this.elements.loadingOverlay?.classList.remove('hidden');
  }

  hideLoading() {
    this.elements.loadingOverlay?.classList.add('hidden');
  }

  showError(message) {
    alert(message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) || undefined;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new RegistrationApp();
});
