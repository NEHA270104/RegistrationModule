/**
 * Frontend Configuration
 * AI Summit for MSME Business Owners
 * By EventReg Platform Technology LLP
 */

const CONFIG = {
  // Tenant Detection
  // Extract tenant slug from URL path /t/:slug
  TENANT_SLUG: (() => {
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 't' && pathParts[2]) {
      return pathParts[2];
    }
    return null;
  })(),

  // API Configuration
  // Dynamic resolution supporting localhost, Netlify proxy, and cloud backends
  API_BASE_URL: (() => {
    if (typeof window !== 'undefined') {
      if (window.CUSTOM_API_BASE_URL) return window.CUSTOM_API_BASE_URL;
      const stored = localStorage.getItem('api_base_url');
      if (stored) return stored;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
      }
    }
    return '/api';
  })(),

  // Tenant-scoped API base (for public endpoints)
  get TENANT_API_BASE() {
    if (this.TENANT_SLUG) {
      return `${this.API_BASE_URL}/t/${this.TENANT_SLUG}/public`;
    }
    return null;
  },

  // Razorpay Configuration (Live Mode)
  RAZORPAY_KEY_ID: 'rzp_live_SBXVkYjOsVLrl2',

  // Event Details
  EVENT: {
    name: 'AI Summit for MSME Business Owners 2026',
    tagline: 'From Survival to Scale',
    description: 'Transform Your Business with AI',
    date: '21st Feb 2026',
    time: '9:00 AM - 5:00 PM IST',
    venue: 'Ashish Plaza, opposite Fergusson college campus road, Shivajinagar, Pune, Maharashtra 411004',
    platform: 'Zoom',
    platformVisible: true,
    organizer: 'EventReg Platform Technology LLP',
  },

  // WhatsApp Community Link
  // Create a WhatsApp Community: https://faq.whatsapp.com/cxt?entrypointid=how_to_create_community
  // Or WhatsApp Group: https://faq.whatsapp.com/1479185602613498/
  WHATSAPP_COMMUNITY_LINK: 'https://chat.whatsapp.com/CQhaJSZzOv6LfzsdQ4M6Le',

  // 3-Day Early Bird Offer Configuration (28-30 Jan 2026)
  // Change these dates to control offer period
  OFFER: {
    startDate: '2026-01-27T00:00:00+05:30', // Offer start date (IST)
    durationDays: 4, // Number of days the offer runs (27, 28, 29, 30 Jan)
    discountAmount: 1000, // Base discount (varies per tier)
    isActive: true, // Toggle offer on/off
    label: 'Early Bird Special!',
    description: 'Save on all passes',
  },

  // Hero Promo Section (admin-configurable)
  PROMO: {
    enabled: false,
    valueProp: '',
    whatsappKeyword: '',
    urgencyText: '',
  },

  // Empathetic Tier Configuration
  // All tiers include: Full Summit Access, Lunch & Refreshments, Certificate, WhatsApp Community
  TIERS: {
    vip: {
      name: 'Executive Experience',
      displayName: 'Executive Experience',
      tagline: 'Your success deserves the spotlight',
      color: '#f59e0b',
      class: 'vip',
      originalPrice: 4999,
      offerPrice: 2499,
      discount: 2500,
      benefits: [
        'Priority Front Row Seating',
        'All Session Recordings (30 days)',
        '1-on-1 AI Consultation (15 mins)',
        'VIP Networking Lounge Access',
        'Premium Resource Kit',
      ],
    },
    standard: {
      name: 'Business Builder',
      displayName: 'Business Builder',
      tagline: 'Everything you need to transform',
      color: '#10b981',
      class: 'standard',
      originalPrice: 2999,
      offerPrice: 1499,
      discount: 1500,
      benefits: [
        'Reserved Seating',
        'Session Recordings (7 days)',
        'Group Q&A Priority',
        'Networking Session Access',
      ],
    },
    basic: {
      name: 'Growth Starter',
      displayName: 'Growth Starter',
      tagline: 'Take your first step with confidence',
      color: '#6b7280',
      class: 'basic',
      originalPrice: 1999,
      offerPrice: 999,
      discount: 1000,
      benefits: [
        'General Seating',
        'Same-Day Recording Access',
        'Community Q&A Access',
      ],
    },
    waitlist: {
      name: 'Livestream Access',
      displayName: 'Livestream Access',
      tagline: 'Join us from anywhere',
      color: '#3b82f6',
      class: 'waitlist',
      originalPrice: 699,
      offerPrice: 699,
      discount: 0,
      benefits: [
        'Full Live Stream Access',
        'Chat Participation',
        '3-Day Recording Access',
        'Digital Certificate',
      ],
    },
  },

  // Common benefits for ALL paid tiers (displayed separately)
  COMMON_BENEFITS: [
    'Full Summit Access (9 AM - 5 PM)',
    'Complimentary Lunch & Refreshments',
    'Digital Certificate of Participation',
    'WhatsApp Community Access',
    'Event Materials & Resources',
  ],

  // Validation Rules
  VALIDATION: {
    name: {
      minLength: 2,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s.'-]+$/,
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
    EMAIL_ALREADY_REGISTERED: 'This email address is already registered for the summit.',
    PHONE_ALREADY_REGISTERED: 'This phone number is already registered for the summit.',
    PERSON_ALREADY_REGISTERED: 'A registration with this name and phone already exists.',
  },

  // Polling interval for seat updates (ms)
  SEAT_POLL_INTERVAL: 30000, // 30 seconds
};

// Freeze static configuration to prevent accidental modification
// Note: OFFER, TIERS, and EVENT are NOT frozen to allow dynamic updates from API
Object.freeze(CONFIG.COMMON_BENEFITS);
Object.freeze(CONFIG.VALIDATION);
Object.freeze(CONFIG.MESSAGES);

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
  window.API_BASE_URL = CONFIG.API_BASE_URL;
}
