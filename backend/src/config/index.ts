import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },

  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID!,
    keySecret: process.env.RAZORPAY_KEY_SECRET!,
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
    const key = process.env.ADMIN_API_KEY || 'change-this-in-production';
    console.log(`[Config] ADMIN_API_KEY loaded, length: ${key.length}`);
    return key;
  })(),

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Event Details (fallback values - actual values fetched from database)
  event: {
    name: 'AI for MSME Business Summit 2026',
    date: '21st February 2026',
    time: '9:00 AM - 5:00 PM IST',
    venue: 'TBD soon',
    supportEmail: 'support@bizflowai.in',
    supportPhone: '+91 8188050895',
  },

  // Payment Timeout
  paymentTimeoutMinutes: 10,

  // Pricing (in paise for Razorpay) - Offered prices with Rs.1000 discount
  // Original: VIP: 3499, Standard: 2499, Basic: 1999
  // Offer: VIP: 2499, Standard: 1499, Basic: 999
  pricing: {
    vip: 249900,      // Rs. 2,499 (offer price)
    standard: 149900, // Rs. 1,499 (offer price)
    basic: 99900,     // Rs. 999 (offer price)
    waitlist: 0,      // Free waitlist
  } as const,
} as const;

export type Config = typeof config;
