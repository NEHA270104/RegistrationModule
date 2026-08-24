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

// Redirect countdown for success modal
let redirectCountdownInterval = null;
let redirectCountdownSeconds = 60;
let redirectCancelled = false;

// Helper for safe JSON fetching (protects against static HTML 404/200 rewrites)
async function safeFetchJson(url, options) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch dynamic settings from API and merge with static config
 * Falls back to static config if API fails
 */
async function loadDynamicSettings() {
  try {
    // Use tenant-scoped config endpoint if on /t/:slug
    const settingsUrl = CONFIG.TENANT_SLUG
      ? `${CONFIG.API_BASE_URL}/t/${CONFIG.TENANT_SLUG}/public/config`
      : `${CONFIG.API_BASE_URL}/settings`;

    const rawConfig = await safeFetchJson(settingsUrl);
    if (!rawConfig) {
      console.warn('Failed to fetch dynamic settings, using static config');
      return;
    }

    // Tenant-scoped config wraps data differently
    dynamicConfig = CONFIG.TENANT_SLUG ? (rawConfig.data?.settings || rawConfig) : rawConfig;

    // Apply tenant branding if available
    if (CONFIG.TENANT_SLUG && rawConfig.data?.tenant) {
      applyTenantBranding(rawConfig.data.tenant);
    }

    // Merge offer settings
    if (dynamicConfig.offer) {
      CONFIG.OFFER = {
        ...CONFIG.OFFER,
        startDate: dynamicConfig.offer.startDate || CONFIG.OFFER.startDate,
        durationDays: dynamicConfig.offer.durationDays || CONFIG.OFFER.durationDays,
        isActive: dynamicConfig.offer.isActive ?? CONFIG.OFFER.isActive,
        // Tier-specific discounts
        discountVip: dynamicConfig.offer.discountVip || dynamicConfig.offer.discountAmount || CONFIG.OFFER.discountAmount,
        discountStandard: dynamicConfig.offer.discountStandard || dynamicConfig.offer.discountAmount || CONFIG.OFFER.discountAmount,
        discountBasic: dynamicConfig.offer.discountBasic || dynamicConfig.offer.discountAmount || CONFIG.OFFER.discountAmount,
        label: dynamicConfig.offer.label || CONFIG.OFFER.label,
        description: dynamicConfig.offer.description || CONFIG.OFFER.description,
      };

      // Update offer banner label from dynamic settings
      const offerLabelEl = document.querySelector('#offer-banner .offer-label');
      if (offerLabelEl && CONFIG.OFFER.label) {
        offerLabelEl.textContent = CONFIG.OFFER.label;
      }
    }

    // Merge promo settings
    if (dynamicConfig.promo) {
      CONFIG.PROMO = {
        ...CONFIG.PROMO,
        enabled: dynamicConfig.promo.enabled ?? CONFIG.PROMO.enabled,
        valueProp: dynamicConfig.promo.valueProp || CONFIG.PROMO.valueProp,
        whatsappKeyword: dynamicConfig.promo.whatsappKeyword || CONFIG.PROMO.whatsappKeyword,
        urgencyText: dynamicConfig.promo.urgencyText || CONFIG.PROMO.urgencyText,
      };
    }

    // Render hero promo section
    renderHeroPromo();

    // Merge pricing settings and apply tier-specific discounts
    if (dynamicConfig.pricing) {
      if (dynamicConfig.pricing.vip) {
        CONFIG.TIERS.vip.originalPrice = dynamicConfig.pricing.vip.originalPrice || CONFIG.TIERS.vip.originalPrice;
        // Use tier-specific offer price or calculate from discount
        CONFIG.TIERS.vip.offerPrice = dynamicConfig.pricing.vip.offerPrice ||
          (CONFIG.TIERS.vip.originalPrice - (CONFIG.OFFER.discountVip || CONFIG.OFFER.discountAmount));
        CONFIG.TIERS.vip.discount = CONFIG.TIERS.vip.originalPrice - CONFIG.TIERS.vip.offerPrice;
      }
      if (dynamicConfig.pricing.standard) {
        CONFIG.TIERS.standard.originalPrice = dynamicConfig.pricing.standard.originalPrice || CONFIG.TIERS.standard.originalPrice;
        CONFIG.TIERS.standard.offerPrice = dynamicConfig.pricing.standard.offerPrice ||
          (CONFIG.TIERS.standard.originalPrice - (CONFIG.OFFER.discountStandard || CONFIG.OFFER.discountAmount));
        CONFIG.TIERS.standard.discount = CONFIG.TIERS.standard.originalPrice - CONFIG.TIERS.standard.offerPrice;
      }
      if (dynamicConfig.pricing.basic) {
        CONFIG.TIERS.basic.originalPrice = dynamicConfig.pricing.basic.originalPrice || CONFIG.TIERS.basic.originalPrice;
        CONFIG.TIERS.basic.offerPrice = dynamicConfig.pricing.basic.offerPrice ||
          (CONFIG.TIERS.basic.originalPrice - (CONFIG.OFFER.discountBasic || CONFIG.OFFER.discountAmount));
        CONFIG.TIERS.basic.discount = CONFIG.TIERS.basic.originalPrice - CONFIG.TIERS.basic.offerPrice;
      }
      if (dynamicConfig.pricing.waitlist) {
        CONFIG.TIERS.waitlist.offerPrice = dynamicConfig.pricing.waitlist.price || CONFIG.TIERS.waitlist.offerPrice;
        CONFIG.TIERS.waitlist.originalPrice = dynamicConfig.pricing.waitlist.price || CONFIG.TIERS.waitlist.originalPrice;
        CONFIG.TIERS.waitlist.discount = 0;
      }

      // Update CTA buttons with dynamic max discount
      const maxDiscount = Math.max(
        CONFIG.TIERS.vip.discount || 0,
        CONFIG.TIERS.standard.discount || 0,
        CONFIG.TIERS.basic.discount || 0
      );
      if (maxDiscount > 0) {
        const formatted = maxDiscount.toLocaleString('en-IN');
        document.querySelectorAll('.cta-save-text').forEach((el, i) => {
          const prefix = i === 0 ? 'CLAIM YOUR SEAT NOW' : 'REGISTER NOW';
          el.textContent = `${prefix} \u2013 SAVE UP TO \u20B9${formatted}`;
        });
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
        platform: dynamicConfig.event.platform || CONFIG.EVENT.platform,
        platformVisible: dynamicConfig.event.platformVisible ?? CONFIG.EVENT.platformVisible,
      };

      // Update platform display based on visibility toggle
      updatePlatformDisplay();
    }

    // Update offer end date on the page (all instances)
    // Calculate offer end date from offer_start_date + offer_duration_days
    if (dynamicConfig.offer && dynamicConfig.offer.startDate && dynamicConfig.offer.durationDays) {
      const startDate = new Date(dynamicConfig.offer.startDate);
      const offerEndDate = new Date(startDate.getTime() + (dynamicConfig.offer.durationDays * 24 * 60 * 60 * 1000));

      const formattedDate = offerEndDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short'
      }).toUpperCase();

      // Update all offer end date elements
      const offerEndDateElements = [
        document.getElementById('offer-end-date'),
        document.getElementById('offer-end-date-2')
      ];

      offerEndDateElements.forEach(el => {
        if (el) el.textContent = formattedDate;
      });
    }

    // Update registration close date on the page
    if (dynamicConfig.registration && dynamicConfig.registration.closeDate) {
      const closeDate = new Date(dynamicConfig.registration.closeDate);
      const formattedRegCloseDate = closeDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

      // Update all registration close date elements
      const regCloseDateElements = [
        document.getElementById('registration-close-date'),
        document.getElementById('registration-close-date-2')
      ];

      regCloseDateElements.forEach(el => {
        if (el) el.textContent = formattedRegCloseDate;
      });
    }

    // Render dynamic guests/speakers
    if (dynamicConfig.guests && dynamicConfig.guests.length > 0) {
      renderGuestSpeakers(dynamicConfig.guests);
    } else {
      // Fallback: fetch from dedicated endpoint
      try {
        const guestData = await safeFetchJson(`${CONFIG.API_BASE_URL}/guests`);
        if (guestData) {
          const guests = guestData.data?.guests || [];
          if (guests.length > 0) {
            renderGuestSpeakers(guests);
          } else {
            hideGuestSpeakersSection();
          }
        }
      } catch (e) {
        console.warn('Failed to load guests:', e);
      }
    }

    // Render dynamic MSME benefits
    if (dynamicConfig.msmeBenefits && dynamicConfig.msmeBenefits.length > 0) {
      renderMsmeBenefits(dynamicConfig.msmeBenefits);
    } else {
      // Fallback: fetch from dedicated endpoint
      try {
        const benefitData = await safeFetchJson(`${CONFIG.API_BASE_URL}/msme-benefits`);
        if (benefitData) {
          const benefits = benefitData.data?.benefits || [];
          if (benefits.length > 0) {
            renderMsmeBenefits(benefits);
          }
        }
      } catch (e) {
        console.warn('Failed to load MSME benefits:', e);
      }
    }

    console.log('Dynamic settings loaded successfully');
  } catch (error) {
    console.warn('Error loading dynamic settings:', error);
    // Continue with static config
  }
}

/**
 * Apply tenant branding (colors, logo, title) from tenant config
 */
function applyTenantBranding(tenant) {
  if (!tenant) return;

  // Apply brand colors
  if (tenant.primary_color) {
    document.documentElement.style.setProperty('--primary', tenant.primary_color);
    document.documentElement.style.setProperty('--primary-color', tenant.primary_color);
  }
  if (tenant.secondary_color) {
    document.documentElement.style.setProperty('--secondary', tenant.secondary_color);
    document.documentElement.style.setProperty('--secondary-color', tenant.secondary_color);
  }

  // Apply logo
  if (tenant.logo_url) {
    const logoEls = document.querySelectorAll('.logo, .brand-logo, #brand-logo');
    logoEls.forEach(el => {
      if (el.tagName === 'IMG') {
        el.src = tenant.logo_url;
      }
    });
  }

  // Update page title
  if (tenant.name || tenant.company_name) {
    document.title = `${tenant.company_name || tenant.name} - Registration`;
  }

  // Apply favicon
  if (tenant.favicon_url) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = tenant.favicon_url;
  }

  console.log('Tenant branding applied:', tenant.slug);
}

/**
 * Render hero promo section from dynamic settings
 */
function renderHeroPromo() {
  const promoSection = document.getElementById('hero-promo');
  if (!promoSection || !CONFIG.PROMO.enabled) return;

  const valuePropEl = document.getElementById('promo-value-prop');
  const whatsappBtn = document.getElementById('promo-whatsapp-btn');
  const whatsappText = document.getElementById('promo-whatsapp-text');
  const urgencyEl = document.getElementById('promo-urgency');

  // Value proposition
  if (valuePropEl && CONFIG.PROMO.valueProp) {
    valuePropEl.textContent = CONFIG.PROMO.valueProp;
    valuePropEl.style.display = '';
  } else if (valuePropEl) {
    valuePropEl.style.display = 'none';
  }

  // WhatsApp CTA
  const whatsappNumber = dynamicConfig?.support?.whatsapp || '';
  if (whatsappBtn && CONFIG.PROMO.whatsappKeyword && whatsappNumber) {
    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    whatsappBtn.href = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(CONFIG.PROMO.whatsappKeyword)}`;
    if (whatsappText) {
      whatsappText.textContent = `Message "${CONFIG.PROMO.whatsappKeyword}" on WhatsApp to claim your seat`;
    }
    whatsappBtn.style.display = '';
  } else if (whatsappBtn) {
    whatsappBtn.style.display = 'none';
  }

  // Urgency text
  if (urgencyEl && CONFIG.PROMO.urgencyText) {
    urgencyEl.textContent = CONFIG.PROMO.urgencyText;
    urgencyEl.style.display = '';
  } else if (urgencyEl) {
    urgencyEl.style.display = 'none';
  }

  promoSection.style.display = '';

  // Update floating offer reminder label
  const floatLabel = document.getElementById('offer-float-label');
  if (floatLabel) {
    floatLabel.textContent = CONFIG.OFFER.label ? CONFIG.OFFER.label.replace(/[!.]+$/, '') : 'Special Offer';
  }
}

/**
 * Update event platform display (name + visibility)
 */
function updatePlatformDisplay() {
  const visible = CONFIG.EVENT.platformVisible;
  const platform = CONFIG.EVENT.platform || 'Zoom';

  // Hero section platform item
  const heroPlatformItem = document.getElementById('hero-platform-item');
  const heroPlatformText = document.getElementById('hero-platform-text');
  if (heroPlatformItem) heroPlatformItem.style.display = visible ? '' : 'none';
  if (heroPlatformText) heroPlatformText.textContent = platform;

  // Modal platform item
  const modalPlatformItem = document.getElementById('modal-platform-item');
  const modalPlatformText = document.getElementById('modal-platform-text');
  if (modalPlatformItem) modalPlatformItem.style.display = visible ? '' : 'none';
  if (modalPlatformText) modalPlatformText.textContent = `Live on ${platform}`;
}

/**
 * Render guest/speaker cards dynamically from API data
 */
function renderGuestSpeakers(guests) {
  const grid = document.getElementById('speakers-grid');
  if (!grid) return;

  if (!guests || guests.length === 0) {
    hideGuestSpeakersSection();
    return;
  }

  grid.innerHTML = guests.map(guest => {
    const photoHtml = guest.photo_url
      ? `<img src="${escapeHtmlPublic(guest.photo_url)}" alt="${escapeHtmlPublic(guest.name)}">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#d1fae5;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.5" width="40" height="40">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>`;

    const sessionPointsHtml = (guest.session_points || [])
      .map(point => `<li>${escapeHtmlPublic(point)}</li>`)
      .join('');

    const heading = guest.session_heading || "In this session, you'll learn:";

    return `
      <div class="speaker-card">
        <div class="speaker-image">${photoHtml}</div>
        <h3 class="speaker-name">${escapeHtmlPublic(guest.name)}</h3>
        <p class="speaker-title">${escapeHtmlPublic(guest.title)}</p>
        <p class="speaker-bio">${escapeHtmlPublic(guest.bio)}</p>
        <div class="speaker-session">
          <h4>${escapeHtmlPublic(heading)}</h4>
          <ul>${sessionPointsHtml}</ul>
        </div>
      </div>
    `;
  }).join('');
}

function hideGuestSpeakersSection() {
  const section = document.getElementById('speakers-section');
  if (section) section.style.display = 'none';
}

/**
 * Render MSME benefit cards dynamically from API data
 */
function renderMsmeBenefits(benefits) {
  const grid = document.getElementById('msme-benefits-grid');
  const section = document.getElementById('msme-benefits-section');
  if (!grid || !section) return;

  if (!benefits || benefits.length === 0) {
    section.style.display = 'none';
    return;
  }

  grid.innerHTML = benefits.map(benefit => {
    const iconHtml = benefit.icon
      ? `<span class="msme-benefit-icon">${escapeHtmlPublic(benefit.icon)}</span>`
      : '';
    return `
      <div class="msme-benefit-card">
        ${iconHtml}
        <h3>${escapeHtmlPublic(benefit.title)}</h3>
        <p>${escapeHtmlPublic(benefit.description)}</p>
      </div>
    `;
  }).join('');

  section.style.display = '';
}

function escapeHtmlPublic(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  // Update pricing display with dynamic values from API
  updatePricingDisplay(false);
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
      const offerName = (CONFIG.OFFER.label || 'Offer').replace(/[!.]+$/, '');
      if (days > 0) {
        offerText.innerHTML = `${offerName} ends in <strong>${days} day${days > 1 ? 's' : ''}</strong>`;
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
      const offerName = (CONFIG.OFFER.label || 'Offer').replace(/[!.]+$/, '');
      offerText.innerHTML = `${offerName} has <strong>ended</strong>`;
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

    // Always update original price and discount from config
    if (originalPriceEl) {
      originalPriceEl.innerHTML = `&#8377;${tierConfig.originalPrice.toLocaleString('en-IN')}`;
    }
    if (discountEl) {
      discountEl.innerHTML = `Save &#8377;${tierConfig.discount.toLocaleString('en-IN')}`;
    }

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
    offerBadge.innerHTML = `&#8377;${tierConfig.discount.toLocaleString('en-IN')} OFF`;
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
    const data = await safeFetchJson(`${CONFIG.API_BASE_URL}/seats`);
    if (data) {
      seatAvailability = data;
      setDefaultTierByAvailability();
      updateLiveSeatCounter();
    } else {
      selectTier('vip');
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

  // Also update FOMO seat counters
  updateFomoSeats();
}

/**
 * Start polling for seat updates
 */
function startSeatPolling() {
  setInterval(async () => {
    try {
      const data = await safeFetchJson(`${CONFIG.API_BASE_URL}/seats`);
      if (data) {
        seatAvailability = data;
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

  // Clear redirect countdown when modal is closed
  if (redirectCountdownInterval) {
    clearInterval(redirectCountdownInterval);
    redirectCountdownInterval = null;
  }
}

/**
 * Cancel the automatic redirect
 */
function cancelRedirect() {
  redirectCancelled = true;

  // Clear the countdown interval
  if (redirectCountdownInterval) {
    clearInterval(redirectCountdownInterval);
    redirectCountdownInterval = null;
  }

  // Update UI to show cancelled state
  const countdownContainer = document.getElementById('redirect-countdown');
  const countdownMessage = countdownContainer?.querySelector('.countdown-message');
  const cancelBtn = document.getElementById('cancel-redirect-btn');

  if (countdownContainer) {
    countdownContainer.classList.add('redirect-cancelled');
  }

  if (countdownMessage) {
    countdownMessage.innerHTML = 'Auto-redirect cancelled. Take your time to join the WhatsApp group!';
  }

  if (cancelBtn) {
    cancelBtn.style.display = 'none';
  }
}

/**
 * Start the redirect countdown timer
 */
function startRedirectCountdown() {
  // Reset state
  redirectCountdownSeconds = 60;
  redirectCancelled = false;

  const countdownContainer = document.getElementById('redirect-countdown');
  const countdownSecondsEl = document.getElementById('countdown-seconds');
  const cancelBtn = document.getElementById('cancel-redirect-btn');

  // Reset UI
  if (countdownContainer) {
    countdownContainer.classList.remove('redirect-cancelled');
    countdownContainer.style.display = 'block';
  }

  if (cancelBtn) {
    cancelBtn.style.display = 'inline-block';
  }

  // Update countdown display
  const updateCountdown = () => {
    if (countdownSecondsEl) {
      countdownSecondsEl.textContent = redirectCountdownSeconds;
    }

    if (redirectCountdownSeconds <= 0 && !redirectCancelled) {
      // Time's up - redirect to registration page
      clearInterval(redirectCountdownInterval);
      redirectCountdownInterval = null;

      // Close the modal and redirect
      closeSuccessModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Show a brief message that we're redirecting
      setTimeout(() => {
        openRegistrationModal();
      }, 300);
    }

    redirectCountdownSeconds--;
  };

  // Initial update
  updateCountdown();

  // Start interval
  redirectCountdownInterval = setInterval(updateCountdown, 1000);
}

// EventReg / Brand modal functions
function openBizflowModal() {
  openEventRegModal();
}
function openEventRegModal() {
  const modal = document.getElementById('eventreg-modal') || document.getElementById('bizflow-modal');
  if (modal) modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBizflowModal() {
  closeEventRegModal();
}
function closeEventRegModal() {
  const modal = document.getElementById('eventreg-modal') || document.getElementById('bizflow-modal');
  if (modal) modal.classList.add('hidden');
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

// Message Modal functions
function showMessageModal(message, type = 'error', title = null) {
  const modal = document.getElementById('message-modal');
  const iconEl = document.getElementById('message-icon');
  const titleEl = document.getElementById('message-title');
  const textEl = document.getElementById('message-text');

  // Set icon type
  iconEl.className = 'message-icon ' + type;

  // Set appropriate icon SVG based on type
  if (type === 'error') {
    iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    titleEl.textContent = title || 'Error';
  } else if (type === 'warning') {
    iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    titleEl.textContent = title || 'Warning';
  } else {
    iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    titleEl.textContent = title || 'Notice';
  }

  textEl.textContent = message;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeMessageModal() {
  document.getElementById('message-modal').classList.remove('hidden');
  document.getElementById('message-modal').classList.add('hidden');
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

    // Proactive duplicate checking for email
    const emailInput = document.getElementById('email');
    if (emailInput) {
      emailInput.addEventListener('blur', () => this.checkDuplicateEmail(emailInput));
    }

    // Proactive duplicate checking for phone
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      });
      phoneInput.addEventListener('blur', () => this.checkDuplicatePhone(phoneInput));
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

    (document.getElementById('eventreg-modal') || document.getElementById('bizflow-modal'))?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeEventRegModal();
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

    document.getElementById('message-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeMessageModal();
      }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeRegistrationModal();
        closeSuccessModal();
        closeEventRegModal();
        closePrivacyModal();
        closeTermsModal();
        closeMessageModal();
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

      // Handle duplicate registration errors
      if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        this.showError(
          'This email address is already registered for the summit. Please use a different email or contact support if you need assistance.',
          'warning',
          'Already Registered'
        );
      } else if (error.code === 'PHONE_ALREADY_REGISTERED') {
        this.showError(
          'This phone number is already registered for the summit. Please use a different phone number or contact support if you need assistance.',
          'warning',
          'Already Registered'
        );
      } else if (error.code === 'PERSON_ALREADY_REGISTERED') {
        this.showError(
          'A registration with this name and phone number already exists. If you need to make changes to your registration, please contact support.',
          'warning',
          'Already Registered'
        );
      } else if (error.code === 'ALREADY_REGISTERED') {
        this.showError(
          error.message || 'You are already registered for the summit.',
          'warning',
          'Already Registered'
        );
      } else {
        this.showError(error.message || 'Registration failed. Please try again.');
      }
    }
  }

  openRazorpayCheckout(orderData, formData) {
    // Store the current order ID for abandonment tracking
    this.currentOrderId = orderData.order_id;

    const options = {
      key: orderData.key_id || CONFIG.RAZORPAY_KEY_ID,
      amount: orderData.amount * 100, // Convert rupees to paise for Razorpay
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
        console.log('Razorpay handler called with response:', response);
        // Clear the order ID as payment was successful
        this.currentOrderId = null;
        try {
          await this.handlePaymentSuccess(response);
        } catch (error) {
          console.error('Error in payment handler:', error);
          this.hideLoading();
          this.showError('Payment verification failed. Please contact support with your payment ID: ' + response.razorpay_payment_id);
        }
      },
      modal: {
        ondismiss: async () => {
          closeRegistrationModal();

          // Track the abandonment
          if (this.currentOrderId) {
            try {
              await api.trackAbandonment(this.currentOrderId, 'user_cancelled_modal');
            } catch (err) {
              console.error('Failed to track abandonment:', err);
            }
            this.currentOrderId = null;
          }

          this.showError(
            'Payment was cancelled. Your registration is not complete. Please try again to secure your seat.',
            'warning',
            'Payment Cancelled'
          );
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
    console.log('handlePaymentSuccess called');
    this.showLoading('Verifying payment...');

    try {
      console.log('Calling verify-payment API...');
      const verifyResponse = await api.verifyPayment({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      console.log('verify-payment response:', verifyResponse);

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

    // Track the abandonment
    if (this.currentOrderId) {
      api.trackAbandonment(
        this.currentOrderId,
        response.error?.description || 'payment_failed'
      ).catch(err => console.error('Failed to track abandonment:', err));
      this.currentOrderId = null;
    }

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

    // Set WhatsApp community link from config
    if (this.elements.whatsappLink) {
      this.elements.whatsappLink.href = CONFIG.WHATSAPP_COMMUNITY_LINK;
    }

    this.elements.successModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Start 60-second countdown for auto-redirect
    startRedirectCountdown();
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

  /**
   * Check for duplicate email registration
   */
  async checkDuplicateEmail(input) {
    const email = input.value.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return; // Skip if empty or invalid
    }

    try {
      // First check for pending registrations
      const pendingResponse = await api.checkPendingRegistration(email);
      if (pendingResponse.success && pendingResponse.data?.has_pending) {
        // Only show message for ACTIVE (non-expired) pending registrations
        if (!pendingResponse.data.is_expired) {
          this.showPendingRegistrationMessage(pendingResponse.data);
          return;
        }
        // For expired sessions, just continue silently
      }

      // Then check for confirmed duplicates
      const response = await api.checkDuplicates(email, null);
      if (response.data?.is_duplicate) {
        const emailDuplicate = response.data.duplicates?.find(d => d.field === 'email');
        if (emailDuplicate) {
          this.setFieldError(input, emailDuplicate.message);
        }
      }
    } catch (error) {
      console.error('Error checking duplicate email:', error);
    }
  }

  /**
   * Show friendly message for pending registration
   */
  showPendingRegistrationMessage(data) {
    const { is_expired, time_remaining_minutes, registration, message } = data;

    if (is_expired) {
      // Expired - silently let them continue with fresh registration
      // No need to show any modal - just proceed normally
      console.log('Previous session expired, allowing fresh registration');
      return;
    }

    // Only show message for ACTIVE pending registrations (not expired)
    // Pre-fill the form with their data to help them continue
    const form = this.elements.registrationForm;
    if (form && registration) {
      form.name.value = registration.name || '';
      form.email.value = registration.email || '';
      form.phone.value = registration.phone || '';
      if (form.business_name) form.business_name.value = registration.business_name || '';
      if (form.industry) form.industry.value = registration.industry || '';

      // Select their tier
      if (registration.tier) {
        selectTier(registration.tier);
      }
    }

    // Show friendly message only for active pending registrations
    showMessageModal(
      `Your payment didn't go through. Your seat for ${this.getTierDisplayName(registration?.tier)} is being held for the next ${time_remaining_minutes} minutes. Click "OK" to complete your payment.`,
      'warning',
      'Continue Your Registration'
    );
  }

  /**
   * Get tier display name
   */
  getTierDisplayName(tier) {
    const names = {
      vip: 'Executive Experience',
      standard: 'Business Builder',
      basic: 'Growth Starter',
      waitlist: 'Livestream Access'
    };
    return names[tier] || tier;
  }

  /**
   * Check for duplicate phone registration
   */
  async checkDuplicatePhone(input) {
    const phone = input.value.trim().replace(/\D/g, '');
    if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
      return; // Skip if empty or invalid
    }

    try {
      const response = await api.checkDuplicates(null, phone);
      if (response.data?.is_duplicate) {
        const phoneDuplicate = response.data.duplicates?.find(d => d.field === 'phone');
        if (phoneDuplicate) {
          this.setFieldError(input, phoneDuplicate.message);
        }
      }
    } catch (error) {
      console.error('Error checking duplicate phone:', error);
    }
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

  showError(message, type = 'error', title = null) {
    showMessageModal(message, type, title);
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

// ===== FOMO ELEMENTS ANIMATION =====
// ============================================================
// IMPORTANT: ALL FOMO ANIMATIONS ARE DISPLAY-ONLY
// ============================================================
// These functions create visual urgency effects but do NOT:
// - Affect actual seat availability
// - Modify any database records
// - Impact registration or booking logic
// - Change backend seat inventory
//
// Actual bookings are handled by:
// - Backend API validation
// - Database seat_inventory table
// - Server-side availability checks
// ============================================================

/**
 * FOMO (Fear Of Missing Out) System
 * Creates urgency through dynamic social proof elements
 * DISPLAY ONLY - No impact on actual bookings
 */
let fomoInterval;
let lastRegistrationTime = new Date();
let baseSeatsGone = 0; // Base value from actual seat data (for reference only)
let displayedSeatsGone = 0; // Currently displayed value (cosmetic only)

/**
 * Initialize FOMO elements with dynamic content
 */
function initFomoElements() {
  // Initialize live viewers simulation
  updateLiveViewers();

  // Update live viewers every 3-8 seconds (random interval for realism)
  scheduleLiveViewersUpdate();

  // Initialize last registration time
  updateLastRegistrationTime();

  // Update "last registration" every 30 seconds
  setInterval(updateLastRegistrationTime, 30000);

  // Sync FOMO seats with actual availability when seats are fetched
  updateFomoSeats();

  // Start the "seats gone" animation after initial data is loaded
  setTimeout(startSeatsGoneAnimation, 5000);
}

/**
 * ============================================================
 * FOMO DISPLAY ANIMATION - COSMETIC ONLY
 * ============================================================
 * IMPORTANT: These functions ONLY update the visual display.
 * They do NOT affect actual bookings, seat availability, or any backend data.
 *
 * Actual seat availability is:
 * - Fetched from backend API (/api/seats)
 * - Validated server-side during registration
 * - Stored in the database (seat_inventory table)
 *
 * This animation is purely for creating urgency/FOMO on the frontend.
 * ============================================================
 */

/**
 * Start the dynamic "seats gone" counter animation
 * DISPLAY ONLY - Does not affect actual bookings
 */
function startSeatsGoneAnimation() {
  scheduleNextSeatsIncrement();
}

/**
 * Schedule the next seats increment with random timing
 * DISPLAY ONLY - Does not affect actual bookings
 */
function scheduleNextSeatsIncrement() {
  // Random delay between 10-20 seconds
  const delay = 10000 + Math.random() * 10000;

  setTimeout(() => {
    incrementSeatsGone();
    scheduleNextSeatsIncrement();
  }, delay);
}

/**
 * Increment the "seats gone" counter with animation
 * DISPLAY ONLY - This only updates the DOM text content for visual effect.
 * It does NOT call any API or modify actual seat availability.
 * Real bookings are validated against actual database values on the backend.
 */
function incrementSeatsGone() {
  const fomoSoldEl = document.getElementById('fomo-sold');
  if (!fomoSoldEl) return;

  // Get current displayed value (this is just the DOM text, not real data)
  const currentValue = parseInt(fomoSoldEl.textContent) || 0;

  // Don't exceed total seats display (keep some "availability" shown)
  const totalSeats = parseInt(document.getElementById('fomo-seats')?.textContent) || 120;
  if (currentValue >= totalSeats - 5) return; // Keep at least 5 seats shown as available

  // Random increment: 1-3 seats (DISPLAY ONLY)
  const increment = Math.floor(Math.random() * 3) + 1;
  const newValue = Math.min(currentValue + increment, totalSeats - 5);

  // Animate the number change with flash effect (VISUAL ONLY)
  fomoSoldEl.classList.add('seats-flash');
  animateNumber(fomoSoldEl, currentValue, newValue, 800);

  // Remove flash class after animation
  setTimeout(() => {
    fomoSoldEl.classList.remove('seats-flash');
  }, 500);

  // Update urgency styling (VISUAL ONLY)
  if (newValue > totalSeats * 0.7) {
    fomoSoldEl.classList.add('text-danger');
    fomoSoldEl.classList.remove('text-warning');
  } else if (newValue > totalSeats * 0.5) {
    fomoSoldEl.classList.add('text-warning');
  }

  // Update the "last registration" time display (VISUAL ONLY)
  const timeEl = document.getElementById('last-registration-time');
  if (timeEl) {
    timeEl.textContent = 'just now';
    timeEl.closest('.fomo-item')?.classList.add('fomo-pulse');
    setTimeout(() => {
      timeEl.closest('.fomo-item')?.classList.remove('fomo-pulse');
    }, 1000);
  }
}

/**
 * Simulate live viewers count (creates social proof)
 * DISPLAY ONLY - This is a simulated value for visual effect.
 * Range: 23-89 viewers with natural fluctuation
 */
function updateLiveViewers() {
  const viewersEl = document.getElementById('live-viewers');
  if (!viewersEl) return;

  const currentViewers = parseInt(viewersEl.textContent) || 47;

  // Natural fluctuation: -5 to +7 viewers (SIMULATED)
  const change = Math.floor(Math.random() * 13) - 5;
  let newViewers = currentViewers + change;

  // Keep within realistic bounds (23-89)
  newViewers = Math.max(23, Math.min(89, newViewers));

  // Animate the number change (VISUAL ONLY)
  animateNumber(viewersEl, currentViewers, newViewers, 800);
}

/**
 * Schedule next live viewers update with random delay for natural feel
 */
function scheduleLiveViewersUpdate() {
  const delay = 3000 + Math.random() * 5000; // 3-8 seconds
  setTimeout(() => {
    updateLiveViewers();
    scheduleLiveViewersUpdate();
  }, delay);
}

/**
 * Update "Last registration" time with realistic intervals
 * DISPLAY ONLY - This is simulated for visual urgency effect.
 * Does not reflect actual registration times.
 */
function updateLastRegistrationTime() {
  const timeEl = document.getElementById('last-registration-time');
  if (!timeEl) return;

  // Simulated registration intervals (DISPLAY ONLY - not real data)
  const intervals = [
    { text: 'just now', weight: 5 },
    { text: '1 min ago', weight: 15 },
    { text: '2 mins ago', weight: 20 },
    { text: '3 mins ago', weight: 20 },
    { text: '5 mins ago', weight: 15 },
    { text: '8 mins ago', weight: 10 },
    { text: '12 mins ago', weight: 8 },
    { text: '15 mins ago', weight: 5 },
    { text: '20 mins ago', weight: 2 },
  ];

  // Weighted random selection
  const totalWeight = intervals.reduce((sum, i) => sum + i.weight, 0);
  let random = Math.random() * totalWeight;

  for (const interval of intervals) {
    random -= interval.weight;
    if (random <= 0) {
      timeEl.textContent = interval.text;
      break;
    }
  }

  // Add pulse animation
  timeEl.closest('.fomo-item')?.classList.add('fomo-pulse');
  setTimeout(() => {
    timeEl.closest('.fomo-item')?.classList.remove('fomo-pulse');
  }, 1000);
}

/**
 * Sync FOMO seats counter with actual seat availability
 */
function updateFomoSeats() {
  if (!seatAvailability || !seatAvailability.seats) return;

  const seats = seatAvailability.seats;
  let totalSeats = 0;
  let totalSold = 0;
  let totalAvailable = 0;

  seats.forEach(seat => {
    if (seat.tier_name !== 'waitlist') {
      // Calculate total from available + sold + held, or use total_seats if available
      const seatTotal = seat.total_seats || (seat.available_seats + (seat.sold_seats || 0) + (seat.held_seats || 0));
      totalSeats += seatTotal;
      totalSold += seat.sold_seats || 0;
      totalAvailable += seat.available_seats || 0;
    }
  });

  // Store base value for animation
  baseSeatsGone = totalSold;

  const fomoSeatsEl = document.getElementById('fomo-seats');
  const fomoSoldEl = document.getElementById('fomo-sold');

  if (fomoSeatsEl) {
    fomoSeatsEl.textContent = totalSeats;
  }

  if (fomoSoldEl) {
    const currentDisplayed = parseInt(fomoSoldEl.textContent) || 0;
    // Only update if real data is higher than what's displayed (don't go backwards)
    if (totalSold > currentDisplayed) {
      animateNumber(fomoSoldEl, currentDisplayed, totalSold, 1000);
    }

    // Add urgency styling based on how many seats are left
    if (totalAvailable <= 20) {
      fomoSoldEl.classList.add('text-danger');
    } else if (totalSold > totalSeats * 0.5) {
      fomoSoldEl.classList.add('text-warning');
    }
  }
}

/**
 * Animate number change for smooth transitions
 */
function animateNumber(element, from, to, duration) {
  if (from === to) return;

  const start = performance.now();
  const diff = to - from;

  function update(currentTime) {
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function for smooth animation
    const easeOutQuad = progress * (2 - progress);
    const current = Math.round(from + diff * easeOutQuad);

    element.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Show occasional "Someone just registered!" toast notification
 * DISPLAY ONLY - This is a simulated notification for FOMO effect.
 * Does not represent actual registrations.
 */
function showRegistrationToast() {
  // Create toast element (SIMULATED - not real registration data)
  const toast = document.createElement('div');
  toast.className = 'fomo-toast';

  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Ahmedabad', 'Kolkata', 'Jaipur', 'Surat'];
  const tiers = ['Executive Experience', 'Business Builder', 'Growth Starter'];

  const city = cities[Math.floor(Math.random() * cities.length)];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];

  toast.innerHTML = `
    <div class="toast-icon">🎉</div>
    <div class="toast-content">
      <strong>New Registration!</strong>
      <span>Someone from ${city} just booked ${tier}</span>
    </div>
  `;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('show'), 100);

  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Schedule random toast notifications (every 45-90 seconds)
 */
function scheduleRegistrationToasts() {
  const delay = 45000 + Math.random() * 45000; // 45-90 seconds
  setTimeout(() => {
    showRegistrationToast();
    scheduleRegistrationToasts();
  }, delay);
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new RegistrationApp();

  // Initialize FOMO elements after a short delay
  setTimeout(() => {
    initFomoElements();
    // Start showing toast notifications after 30 seconds
    setTimeout(scheduleRegistrationToasts, 30000);
  }, 2000);

  // Initialize scroll handlers for sticky elements
  initScrollHandlers();
});

/**
 * Initialize scroll handlers for sticky CTA bar and back-to-top button
 */
function initScrollHandlers() {
  const stickyCta = document.getElementById('sticky-cta');
  const backToTop = document.getElementById('back-to-top');
  const stickyViewers = document.getElementById('sticky-viewers');
  const liveViewers = document.getElementById('live-viewers');
  let lastScrollY = 0;
  let ticking = false;

  function handleScroll() {
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // Show sticky CTA bar after scrolling 400px
    if (stickyCta) {
      if (scrollY > 400) {
        stickyCta.classList.add('visible');
      } else {
        stickyCta.classList.remove('visible');
      }
    }

    // Show back-to-top button after scrolling 600px
    if (backToTop) {
      if (scrollY > 600) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }

    // Show floating offer reminder after scrolling past hero section (only when promo is enabled)
    const offerFloatReminder = document.getElementById('offer-float-reminder');
    if (offerFloatReminder) {
      const heroSection = document.querySelector('.hero');
      const heroBottom = heroSection ? heroSection.offsetTop + heroSection.offsetHeight : 800;
      if (scrollY > heroBottom && CONFIG.PROMO && CONFIG.PROMO.enabled) {
        offerFloatReminder.classList.add('visible');
      } else {
        offerFloatReminder.classList.remove('visible');
      }
    }

    // Sync sticky viewers count with main live-viewers
    if (stickyViewers && liveViewers) {
      stickyViewers.textContent = liveViewers.textContent;
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Initial check
  handleScroll();
}

/**
 * Scroll to top of the page smoothly
 */
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
