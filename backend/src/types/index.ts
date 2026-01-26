// ============================================
// AI for MSME Summit - Type Definitions
// ============================================

export type TierType = 'vip' | 'standard' | 'basic' | 'waitlist';
export type PaymentStatus = 'pending' | 'processing' | 'confirmed' | 'failed' | 'refunded' | 'expired';
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'waitlisted';

// ============================================
// Database Models
// ============================================

export interface SeatInventory {
  id: string;
  tier_name: TierType;
  display_name: string;
  total_seats: number;
  sold_seats: number;
  held_seats: number;
  price_inr: number;
  is_active: boolean;
  description: string | null;
  benefits: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  booking_id: string;
  name: string;
  email: string;
  phone: string;
  business_name: string | null;
  industry: string | null;
  revenue_range: string | null;
  employee_count: string | null;
  tier: TierType;
  amount_paid: number;
  payment_status: PaymentStatus;
  registration_status: RegistrationStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  payment_initiated_at: string | null;
  payment_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  ip_address: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  confirmation_email_sent: boolean;
  confirmation_whatsapp_sent: boolean;
  ticket_downloaded: boolean;
}

export interface Waitlist {
  id: string;
  name: string;
  email: string;
  phone: string;
  business_name: string | null;
  industry: string | null;
  preferred_tier: TierType;
  position: number;
  is_notified: boolean;
  notified_at: string | null;
  converted_to_registration_id: string | null;
  converted_at: string | null;
  has_livestream_access: boolean;
  livestream_payment_id: string | null;
  livestream_amount: number;
  created_at: string;
  updated_at: string;
  ip_address: string | null;
  utm_source: string | null;
}

export interface PendingOrder {
  id: string;
  razorpay_order_id: string;
  tier: TierType;
  amount: number;
  email: string;
  phone: string;
  name: string;
  status: 'pending' | 'completed' | 'expired';
  expires_at: string;
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface PaymentWebhookLog {
  id: string;
  webhook_id: string;
  event_type: string;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateOrderRequest {
  tier: TierType;
  name: string;
  email: string;
  phone: string;
  business_name?: string;
  industry?: string;
  revenue_range?: string;
  employee_count?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  registration_id: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  notes: {
    tier: string;
    registration_id: string;
  };
}

export interface VerifyPaymentRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  booking_id: string;
  message: string;
  registration: Partial<Registration>;
}

export interface SeatAvailability {
  tier_name: TierType;
  display_name: string;
  total_seats: number;
  available_seats: number;
  price_inr: number;
  price_display: string;
  is_active: boolean;
  is_sold_out: boolean;
  benefits: string[];
}

export interface SeatsResponse {
  success: boolean;
  seats: SeatAvailability[];
  all_sold_out: boolean;
  total_available: number;
  waitlist_mode: boolean;
}

export interface WaitlistRequest {
  name: string;
  email: string;
  phone: string;
  business_name?: string;
  industry?: string;
  preferred_tier: TierType;
  purchase_livestream?: boolean;
}

export interface WaitlistResponse {
  success: boolean;
  position: number;
  message: string;
  livestream_order?: {
    order_id: string;
    amount: number;
    key_id: string;
  };
}

// ============================================
// Razorpay Types
// ============================================

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayPayment {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method: string;
  description: string;
  email: string;
  contact: string;
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPayment;
    };
    order?: {
      entity: RazorpayOrder;
    };
  };
  created_at: number;
}

// ============================================
// Admin Types
// ============================================

export interface AdminRegistrationFilters {
  tier?: TierType;
  payment_status?: PaymentStatus;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface AdminDashboardStats {
  total_registrations: number;
  confirmed_registrations: number;
  pending_payments: number;
  total_revenue: number;
  seats_by_tier: {
    tier: TierType;
    total: number;
    sold: number;
    available: number;
  }[];
  waitlist_count: number;
  today_registrations: number;
  conversion_rate: number;
}

export interface ExportOptions {
  format: 'csv' | 'json';
  filters?: AdminRegistrationFilters;
  fields?: string[];
}

// ============================================
// Email Types
// ============================================

export interface EmailConfirmationData {
  to: string;
  name: string;
  booking_id: string;
  tier: TierType;
  tier_display: string;
  amount: number;
  event_date: string;
  event_time: string;
  venue: string;
  benefits: string[];
}

export interface EmailTemplateData {
  subject: string;
  preheader?: string;
  body: string;
  cta_text?: string;
  cta_url?: string;
}

// ============================================
// Error Types
// ============================================

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
