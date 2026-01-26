/**
 * Main Application
 * AI for MSME Summit Registration
 */

class RegistrationApp {
  constructor() {
    this.selectedTier = null;
    this.selectedPrice = 0;
    this.seats = [];
    this.isWaitlistMode = false;

    this.init();
  }

  /**
   * Initialize application
   */
  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadSeats();
    this.startSeatPolling();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      seatsGrid: document.getElementById('seats-grid'),
      waitlistNotice: document.getElementById('waitlist-notice'),
      registrationForm: document.getElementById('registration-form'),
      selectedTierDisplay: document.getElementById('selected-tier-display'),
      selectedTierName: document.getElementById('selected-tier-name'),
      selectedTierPrice: document.getElementById('selected-tier-price'),
      tierInput: document.getElementById('tier'),
      submitBtn: document.getElementById('submit-btn'),
      btnPrice: document.getElementById('btn-price'),
      loadingOverlay: document.getElementById('loading-overlay'),
      successModal: document.getElementById('success-modal'),
      bookingIdDisplay: document.getElementById('booking-id-display'),
      bookingDetails: document.getElementById('booking-details'),
      totalSeatsDisplay: document.getElementById('total-seats-display'),
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Form submission
    this.elements.registrationForm.addEventListener('submit', (e) => this.handleSubmit(e));

    // Form input validation
    const inputs = this.elements.registrationForm.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => this.clearFieldError(input));
    });

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
  }

  /**
   * Load seat availability
   */
  async loadSeats() {
    try {
      const response = await api.getSeats();

      if (response.success) {
        this.seats = response.seats;
        this.isWaitlistMode = response.waitlist_mode;
        this.renderSeats();
        this.updateTotalSeats(response.total_available);

        if (this.isWaitlistMode) {
          this.elements.waitlistNotice.classList.remove('hidden');
        }
      }
    } catch (error) {
      this.showError(CONFIG.MESSAGES.SEAT_FETCH_ERROR);
      this.elements.seatsGrid.innerHTML = `
        <div class="seats-loading">
          <p class="text-error">Failed to load seats. Please refresh the page.</p>
        </div>
      `;
    }
  }

  /**
   * Render seat cards
   */
  renderSeats() {
    this.elements.seatsGrid.innerHTML = this.seats.map(seat => this.createSeatCard(seat)).join('');

    // Bind click events to seat cards
    this.elements.seatsGrid.querySelectorAll('.seat-card').forEach(card => {
      card.addEventListener('click', () => {
        const tier = card.dataset.tier;
        const isSoldOut = card.classList.contains('sold-out');
        if (!isSoldOut) {
          this.selectTier(tier);
        }
      });
    });
  }

  /**
   * Create seat card HTML
   */
  createSeatCard(seat) {
    const tierConfig = CONFIG.TIERS[seat.tier_name] || {};
    const isSoldOut = seat.is_sold_out;
    const isLow = seat.available_seats <= 5 && seat.available_seats > 0;
    const isSelected = this.selectedTier === seat.tier_name;

    const benefitsHtml = (seat.benefits || []).slice(0, 4).map(benefit =>
      `<li>${this.escapeHtml(benefit)}</li>`
    ).join('');

    return `
      <div class="seat-card ${tierConfig.class || ''} ${isSoldOut ? 'sold-out' : ''} ${isSelected ? 'selected' : ''}"
           data-tier="${seat.tier_name}"
           data-price="${seat.price_inr}">
        ${isSoldOut ? '<span class="sold-out-badge">Sold Out</span>' : ''}
        <div class="seat-card-header">
          <span class="tier-badge ${tierConfig.class || ''}">${tierConfig.name || seat.display_name}</span>
          <span class="seats-remaining ${isLow ? 'low' : ''}">
            ${isSoldOut ? 'No seats' : `${seat.available_seats} seats left`}
          </span>
        </div>
        <h3 class="seat-card-title">${this.escapeHtml(seat.display_name)}</h3>
        <div class="seat-card-price">
          ${seat.price_display}
        </div>
        <ul class="seat-card-benefits">
          ${benefitsHtml}
        </ul>
        <button class="select-tier-btn ${isSelected ? 'selected' : ''}" ${isSoldOut ? 'disabled' : ''}>
          ${isSoldOut ? 'Sold Out' : (isSelected ? 'Selected' : 'Select This Pass')}
        </button>
      </div>
    `;
  }

  /**
   * Select a tier
   */
  selectTier(tierName) {
    const seat = this.seats.find(s => s.tier_name === tierName);
    if (!seat || seat.is_sold_out) return;

    this.selectedTier = tierName;
    this.selectedPrice = seat.price_inr;

    // Update UI
    const tierConfig = CONFIG.TIERS[tierName] || {};
    this.elements.selectedTierName.textContent = tierConfig.name || seat.display_name;
    this.elements.selectedTierPrice.textContent = seat.price_display;
    this.elements.tierInput.value = tierName;
    this.elements.btnPrice.textContent = seat.price_display;
    this.elements.submitBtn.disabled = false;

    // Update card selection
    this.elements.seatsGrid.querySelectorAll('.seat-card').forEach(card => {
      const isSelected = card.dataset.tier === tierName;
      card.classList.toggle('selected', isSelected);
      const btn = card.querySelector('.select-tier-btn');
      if (btn && !card.classList.contains('sold-out')) {
        btn.textContent = isSelected ? 'Selected' : 'Select This Pass';
        btn.classList.toggle('selected', isSelected);
      }
    });

    // Scroll to form
    this.elements.registrationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    // Validate form
    if (!this.validateForm()) {
      return;
    }

    // Get form data
    const formData = this.getFormData();

    // Show loading
    this.showLoading('Creating your order...');

    try {
      // Create order
      const orderResponse = await api.createOrder(formData);

      if (!orderResponse.success) {
        throw new ApiError(orderResponse.error?.message || 'Order creation failed', 'ORDER_ERROR');
      }

      // Hide loading before Razorpay opens
      this.hideLoading();

      // Initialize Razorpay checkout
      this.openRazorpayCheckout(orderResponse, formData);
    } catch (error) {
      this.hideLoading();

      if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        this.showError(CONFIG.MESSAGES.ALREADY_REGISTERED);
      } else if (error.code === 'TIER_SOLD_OUT' || error.code === 'SOLD_OUT') {
        this.showError(CONFIG.MESSAGES.SOLD_OUT);
        await this.loadSeats(); // Refresh seats
      } else {
        this.showError(error.message || CONFIG.MESSAGES.ORDER_CREATE_ERROR);
      }
    }
  }

  /**
   * Open Razorpay checkout
   */
  openRazorpayCheckout(orderData, formData) {
    const options = {
      key: orderData.key_id || CONFIG.RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: CONFIG.EVENT.name,
      description: `${CONFIG.TIERS[formData.tier]?.name || 'Pass'} Registration`,
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
      // Enable UPI with QR code option
      config: {
        display: {
          blocks: {
            banks: {
              name: 'Pay via UPI / QR',
              instruments: [
                {
                  method: 'upi',
                  flows: ['qrcode', 'collect', 'intent'],
                },
              ],
            },
            other: {
              name: 'Other Payment Methods',
              instruments: [
                { method: 'card' },
                { method: 'netbanking' },
                { method: 'wallet' },
              ],
            },
          },
          sequence: ['block.banks', 'block.other'],
          preferences: {
            show_default_blocks: false,
          },
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response) => {
      this.handlePaymentFailure(response);
    });
    rzp.open();
  }

  /**
   * Handle successful payment
   */
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
        await this.loadSeats(); // Refresh seats
      } else {
        this.showError(CONFIG.MESSAGES.PAYMENT_VERIFY_ERROR);
      }
    } catch (error) {
      this.hideLoading();
      this.showError(error.message || CONFIG.MESSAGES.PAYMENT_VERIFY_ERROR);
    }
  }

  /**
   * Handle payment failure
   */
  handlePaymentFailure(response) {
    console.error('Payment failed:', response.error);
    this.showError(`Payment failed: ${response.error.description}`);
  }

  /**
   * Show success modal
   */
  showSuccessModal(data) {
    this.elements.bookingIdDisplay.textContent = data.booking_id;

    const reg = data.registration || {};
    const tierConfig = CONFIG.TIERS[reg.tier] || {};

    this.elements.bookingDetails.innerHTML = `
      <p><span class="label">Name</span><span class="value">${this.escapeHtml(reg.name || '-')}</span></p>
      <p><span class="label">Email</span><span class="value">${this.escapeHtml(reg.email || '-')}</span></p>
      <p><span class="label">Pass Type</span><span class="value">${tierConfig.name || reg.tier || '-'}</span></p>
      <p><span class="label">Amount Paid</span><span class="value">${this.formatPrice(reg.amount_paid || 0)}</span></p>
    `;

    this.elements.successModal.classList.remove('hidden');
  }

  /**
   * Validate form
   */
  validateForm() {
    let isValid = true;
    const requiredFields = ['name', 'email', 'phone', 'tier'];

    requiredFields.forEach(fieldName => {
      const input = document.getElementById(fieldName);
      if (!this.validateField(input)) {
        isValid = false;
      }
    });

    return isValid;
  }

  /**
   * Validate single field
   */
  validateField(input) {
    const fieldName = input.name || input.id;
    const value = input.value.trim();
    let errorMessage = '';

    switch (fieldName) {
      case 'name':
        if (!value) {
          errorMessage = 'Name is required';
        } else if (value.length < CONFIG.VALIDATION.name.minLength) {
          errorMessage = 'Name must be at least 2 characters';
        } else if (!CONFIG.VALIDATION.name.pattern.test(value)) {
          errorMessage = 'Name contains invalid characters';
        }
        break;

      case 'email':
        if (!value) {
          errorMessage = 'Email is required';
        } else if (!CONFIG.VALIDATION.email.pattern.test(value)) {
          errorMessage = 'Please enter a valid email address';
        }
        break;

      case 'phone':
        if (!value) {
          errorMessage = 'Phone number is required';
        } else if (!CONFIG.VALIDATION.phone.pattern.test(value)) {
          errorMessage = 'Please enter a valid 10-digit Indian phone number';
        }
        break;

      case 'tier':
        if (!value) {
          errorMessage = 'Please select a pass type';
        }
        break;
    }

    this.setFieldError(input, errorMessage);
    return !errorMessage;
  }

  /**
   * Set field error
   */
  setFieldError(input, message) {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = message;
    }
    input.classList.toggle('error', !!message);
  }

  /**
   * Clear field error
   */
  clearFieldError(input) {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = '';
    }
    input.classList.remove('error');
  }

  /**
   * Get form data
   */
  getFormData() {
    const form = this.elements.registrationForm;
    return {
      tier: form.tier.value,
      name: form.name.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim().replace(/\D/g, ''),
      business_name: form.business_name?.value.trim() || undefined,
      industry: form.industry?.value || undefined,
      revenue_range: form.revenue_range?.value || undefined,
      utm_source: this.getUrlParam('utm_source'),
      utm_medium: this.getUrlParam('utm_medium'),
      utm_campaign: this.getUrlParam('utm_campaign'),
    };
  }

  /**
   * Reset form
   */
  resetForm() {
    this.elements.registrationForm.reset();
    this.selectedTier = null;
    this.selectedPrice = 0;
    this.elements.selectedTierName.textContent = '-';
    this.elements.selectedTierPrice.textContent = '-';
    this.elements.btnPrice.textContent = '';
    this.elements.submitBtn.disabled = true;
  }

  /**
   * Update total seats display
   */
  updateTotalSeats(available) {
    const total = 120;
    this.elements.totalSeatsDisplay.textContent =
      available > 0 ? `${available} of ${total}` : 'Sold Out';
  }

  /**
   * Start polling for seat updates
   */
  startSeatPolling() {
    setInterval(() => {
      this.loadSeats();
    }, CONFIG.SEAT_POLL_INTERVAL);
  }

  /**
   * Show loading overlay
   */
  showLoading(message = 'Processing...') {
    const loaderText = this.elements.loadingOverlay.querySelector('.loader-text');
    if (loaderText) {
      loaderText.textContent = message;
    }
    this.elements.loadingOverlay.classList.remove('hidden');
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    this.elements.loadingOverlay.classList.add('hidden');
  }

  /**
   * Show error message
   */
  showError(message) {
    // Simple alert for now - could be replaced with toast notification
    alert(message);
  }

  /**
   * Format price
   */
  formatPrice(amountInPaise) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amountInPaise / 100);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get URL parameter
   */
  getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) || undefined;
  }
}

/**
 * Close success modal
 */
function closeSuccessModal() {
  document.getElementById('success-modal').classList.add('hidden');
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new RegistrationApp();
});
