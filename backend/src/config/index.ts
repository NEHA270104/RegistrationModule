import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env from multiple candidate locations
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Also run standard dotenv.config() fallback
dotenv.config();

// Support Razorpay Key ID alias if typed with typo in env
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.RZORPAY_KEY_ID || 'rzp_test_placeholder';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder';

// Check & warn for missing env vars without crashing startup
if (!process.env.RAZORPAY_KEY_ID && !process.env.RZORPAY_KEY_ID) {
  console.warn('[Config Warning] Missing RAZORPAY_KEY_ID in env. Using placeholder for non-payment boot routes.');
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  console.warn('[Config Warning] Missing RAZORPAY_KEY_SECRET in env. Using placeholder for non-payment boot routes.');
}

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || 'https://zoovfzgtnxzuaolibzgw.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },

  // Razorpay
  razorpay: {
    keyId: razorpayKeyId,
    keySecret: razorpayKeySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  // MSG91 Email Configuration
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY || '',
    fromEmail: process.env.MSG91_FROM_EMAIL || 'noreply@yourdomain.com',
    fromName: process.env.MSG91_FROM_NAME || 'AI for MSME Summit',
    domain: process.env.MSG91_DOMAIN || '',
    // Template IDs - Create these in MSG91 dashboard
    templates: {
      registrationConfirmation: process.env.MSG91_TEMPLATE_REGISTRATION || '',
      waitlistConfirmation: process.env.MSG91_TEMPLATE_WAITLIST || '',
      paymentReminder: process.env.MSG91_TEMPLATE_REMINDER || '',
      paymentRecovery: process.env.MSG91_TEMPLATE_RECOVERY || '',
      otp: process.env.MSG91_TEMPLATE_OTP || '',
    },
  },

  // WhatsApp (Optional)
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  },

  // Admin
  adminApiKey: (() => {
    const key = process.env.ADMIN_API_KEY || 'admin123';
    console.log(`[Config] ADMIN_API_KEY loaded, length: ${key.length}`);
    return key;
  })(),

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // OpenAI (for AI content generation)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  // Anthropic (for AI composition assistant)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },

  // Event Details (fallback values - actual values fetched from database)
  event: {
    name: 'AI for MSME Business Summit 2026',
    date: '21st February 2026',
    time: '9:00 AM - 5:00 PM IST',
    venue: 'Centre For Police Research, (CPR) Pune, Pune University Chowk, Dr Homi Bhabha Rd, Chavan Nagar, Pashan, Pune, Maharashtra 411008',
    supportEmail: 'support@bizflowai.in',
    supportPhone: '+91 8188050895',
  },

  // Payment Timeout
  paymentTimeoutMinutes: 10,

  // Pricing (in paise for Razorpay) - Live testing values (₹1, ₹5, ₹10)
  pricing: {
    vip: 249900,
    premium: 1000,     // Rs. 10 (1000 paise)
    enterprise: 1000,  // Rs. 10 (1000 paise)
    standard: 500,     // Rs. 5 (500 paise)
    pro: 500,          // Rs. 5 (500 paise)
    basic: 100,        // Rs. 1 (100 paise)
    starter: 100,      // Rs. 1 (100 paise)
    launchpad: 100,    // Rs. 1 (100 paise)
    waitlist: 0,
  } as const,
} as const;

export type Config = typeof config;
