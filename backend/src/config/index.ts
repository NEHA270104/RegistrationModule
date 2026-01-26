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
  adminApiKey: process.env.ADMIN_API_KEY || 'change-this-in-production',

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Event Details
  event: {
    name: 'AI for MSME Business Summit 2026',
    date: '3rd January 2026',
    time: '9:00 AM - 2:00 PM IST',
    venue: 'Live on Zoom',
    supportEmail: 'support@aiformsme.com',
    supportPhone: '+91 98765 43210',
  },

  // Payment Timeout
  paymentTimeoutMinutes: 10,

  // Pricing (in paise for Razorpay)
  pricing: {
    vip: 249900,
    standard: 149900,
    basic: 99900,
    waitlist: 69900,
  } as const,
} as const;

export type Config = typeof config;
