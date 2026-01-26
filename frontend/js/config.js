/**
 * Frontend Configuration
 * AI for MSME Summit Registration
 */

const CONFIG = {
  // API Configuration
  API_BASE_URL: 'http://localhost:3000/api',

  // Razorpay Configuration
  RAZORPAY_KEY_ID: 'rzp_test_RlYiaIXp6zl52C',

  // Event Details
  EVENT: {
    name: 'AI for MSME Business Summit 2026',
    description: 'Transform Your Business with AI',
    date: '7th Feb 2026',
    time: '8:30 AM - 5:00 PM IST',
    venue: 'Ashish Plaza, opposite Fergusson college campus road, Shivajinagar, Pune,Maharashtra 411004',
  },

  // Tier Configuration
  TIERS: {
    vip: {
      name: 'VIP Pass',
      color: '#f59e0b',
      class: 'vip',
    },
    standard: {
      name: 'Standard Pass',
      color: '#10b981',
      class: 'standard',
    },
    basic: {
      name: 'Basic Pass',
      color: '#6b7280',
      class: 'basic',
    },
    waitlist: {
      name: 'Waitlist - Live Stream',
      color: '#3b82f6',
      class: 'waitlist',
    },
  },

  // Validation Rules
  VALIDATION: {
    name: {
      minLength: 2,
      maxLength: 100,
      pattern: /^[a-zA-Z\s.'-]+$/,
    },
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: {
      pattern: /^[6-9]\d{9}$/,
      length: 10,
    },
  },

  // Messages
  MESSAGES: {
    SEAT_FETCH_ERROR: 'Unable to load seat availability. Please refresh the page.',
    ORDER_CREATE_ERROR: 'Failed to create order. Please try again.',
    PAYMENT_VERIFY_ERROR: 'Payment verification failed. Please contact support.',
    VALIDATION_ERROR: 'Please fill in all required fields correctly.',
    NETWORK_ERROR: 'Network error. Please check your connection.',
    SOLD_OUT: 'This tier is sold out. Please select another tier.',
    ALREADY_REGISTERED: 'This email is already registered for the event.',
  },

  // Polling interval for seat updates (ms)
  SEAT_POLL_INTERVAL: 30000, // 30 seconds
};

// Freeze configuration to prevent modification
Object.freeze(CONFIG);
Object.freeze(CONFIG.EVENT);
Object.freeze(CONFIG.TIERS);
Object.freeze(CONFIG.VALIDATION);
Object.freeze(CONFIG.MESSAGES);
