import { supabase } from '../config/supabase.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../config/razorpay.js';
import { logger, logPayment } from '../utils/logger.js';
import { seatService } from './seat.service.js';
import { registrationService } from './registration.service.js';
import { emailService } from './email.service.js';
import { abandonmentService } from './abandonment.service.js';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  TierType,
  RazorpayWebhookPayload,
} from '../types/index.js';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

export class PaymentService {
  /**
   * Create a new order for payment
   */
  async createOrder(
    data: CreateOrderRequest,
    metadata?: { ip_address?: string; user_agent?: string; referrer?: string }
  ): Promise<CreateOrderResponse> {
    const tier = data.tier;

    try {
      logger.info('Creating order - Step 1: Checking duplicates', { email: data.email, phone: data.phone });

      // Check for duplicate registration (email, phone, or name+phone)
      const duplicateCheck = await registrationService.checkDuplicateRegistration(
        data.email,
        data.phone,
        data.name
      );
      if (duplicateCheck.isDuplicate) {
        throw new AppError(
          duplicateCheck.reason || 'You are already registered for the summit',
          400,
          duplicateCheck.code || 'ALREADY_REGISTERED'
        );
      }

      logger.info('Creating order - Step 2: Checking seat availability', { tier });

      // Check if all seats are sold and redirect to waitlist
      const allSold = await seatService.checkAllSeatsSold();
      if (allSold && tier !== 'waitlist') {
        throw new AppError(
          'All seats are sold out. Please join the waitlist.',
          400,
          'SOLD_OUT'
        );
      }

      logger.info('Creating order - Step 3: Reserving seat', { tier });

      // Check tier availability and reserve seat
      const reserveResult = await seatService.reserveSeat(tier);
      if (!reserveResult.success) {
        throw new AppError(
          reserveResult.error || 'No seats available for this tier',
          400,
          'TIER_SOLD_OUT'
        );
      }

      logger.info('Creating order - Step 4: Getting tier price', { tier });

      // Get tier price from database (stored in RUPEES)
      const amount = await seatService.getTierPrice(tier);

      logger.info('Creating order - Step 5: Creating Razorpay order', { tier, amount });

      // Generate unique receipt ID
      const receiptId = `rcpt_${Date.now()}_${uuidv4().slice(0, 8)}`;

      // Create Razorpay order - amount in RUPEES, function converts to paise for Razorpay
      const razorpayOrder = await createRazorpayOrder(amount, receiptId, {
        tier: tier,
        email: data.email,
        phone: data.phone,
      });

      logger.info('Creating order - Step 6: Creating pending order', { orderId: razorpayOrder.id });

      // Create pending order record
      await this.createPendingOrder(
        razorpayOrder.id,
        tier,
        amount,
        data,
        config.paymentTimeoutMinutes
      );

      logger.info('Creating order - Step 7: Creating registration', { orderId: razorpayOrder.id });

      // Create registration record
      const registration = await registrationService.createRegistration(
        data,
        razorpayOrder.id,
        amount,
        metadata
      );

      logger.info('Creating order - Step 8: Order created successfully', { orderId: razorpayOrder.id, registrationId: registration.id });

      logPayment('order_created', razorpayOrder.id, undefined, 'pending');

      return {
        success: true,
        order_id: razorpayOrder.id,
        amount: amount, // Pass directly to frontend for Razorpay
        currency: 'INR',
        key_id: config.razorpay.keyId,
        registration_id: registration.id,
        prefill: {
          name: data.name,
          email: data.email,
          contact: data.phone,
        },
        notes: {
          tier: tier,
          registration_id: registration.id,
        },
      };
    } catch (error) {
      // Release the reserved seat if order creation failed
      // Only skip release if error is specifically TIER_SOLD_OUT (seat was never reserved)
      const isAppError = error instanceof AppError;
      const isTierSoldOut = isAppError && error.code === 'TIER_SOLD_OUT';

      if (!isTierSoldOut) {
        logger.info('Releasing held seat due to order creation failure', { tier });
        await seatService.releaseHeldSeat(tier);
      }

      if (isAppError) throw error;

      // Log detailed error information for debugging
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        tier: tier,
        email: data.email,
        // Include Razorpay-specific error details if available
        razorpayError: (error as { error?: { description?: string; code?: string } })?.error,
      };
      logger.error('Unexpected error in createOrder', errorDetails);

      throw new AppError('Failed to create order', 500, 'ORDER_CREATE_ERROR');
    }
  }

  /**
   * Verify payment after Razorpay checkout
   */
  async verifyPayment(data: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data;

    try {
      // Verify signature
      const isValid = verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isValid) {
        logPayment('signature_invalid', razorpay_order_id, razorpay_payment_id, 'failed');
        throw new AppError('Invalid payment signature', 400, 'INVALID_SIGNATURE');
      }

      // Get registration
      const registration = await registrationService.getByRazorpayOrderId(razorpay_order_id);
      if (!registration) {
        throw new AppError('Registration not found', 404, 'REGISTRATION_NOT_FOUND');
      }

      // Check if already processed (idempotency)
      if (registration.payment_status === 'confirmed') {
        return {
          success: true,
          booking_id: registration.booking_id,
          message: 'Payment already confirmed',
          registration: {
            booking_id: registration.booking_id,
            name: registration.name,
            email: registration.email,
            tier: registration.tier,
            amount_paid: registration.amount_paid,
          },
        };
      }

      // Confirm seat (move from held to sold)
      await seatService.confirmSeat(registration.tier);

      // Update registration with payment confirmation
      const confirmedRegistration = await registrationService.confirmPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      // Mark pending order as completed
      await this.completePendingOrder(razorpay_order_id);

      logPayment('payment_verified', razorpay_order_id, razorpay_payment_id, 'confirmed');

      // Send confirmation email (async, don't block response)
      this.sendConfirmationNotifications(confirmedRegistration).catch((err) => {
        logger.error('Error sending confirmation notifications', { error: err.message });
      });

      return {
        success: true,
        booking_id: confirmedRegistration.booking_id,
        message: 'Payment verified successfully',
        registration: {
          booking_id: confirmedRegistration.booking_id,
          name: confirmedRegistration.name,
          email: confirmedRegistration.email,
          tier: confirmedRegistration.tier,
          amount_paid: confirmedRegistration.amount_paid,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in verifyPayment', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Payment verification failed', 500, 'VERIFY_ERROR');
    }
  }

  /**
   * Handle Razorpay webhook
   */
  async handleWebhook(
    payload: RazorpayWebhookPayload,
    signature: string,
    rawBody: string
  ): Promise<void> {
    try {
      // Verify webhook signature
      if (!verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature');
        throw new AppError('Invalid webhook signature', 401, 'INVALID_WEBHOOK_SIGNATURE');
      }

      const webhookId = `${payload.event}_${payload.payload.payment?.entity?.id || payload.payload.order?.entity?.id}_${payload.created_at}`;

      // Check for duplicate webhook (idempotency)
      const isDuplicate = await this.isWebhookProcessed(webhookId);
      if (isDuplicate) {
        logger.info('Duplicate webhook ignored', { webhookId });
        return;
      }

      // Log webhook
      await this.logWebhook(webhookId, payload);

      // Handle different events
      switch (payload.event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(payload);
          break;

        case 'payment.failed':
          await this.handlePaymentFailed(payload);
          break;

        case 'order.paid':
          await this.handleOrderPaid(payload);
          break;

        default:
          logger.info('Unhandled webhook event', { event: payload.event });
      }

      // Mark webhook as processed
      await this.markWebhookProcessed(webhookId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Webhook processing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Webhook processing failed', 500, 'WEBHOOK_ERROR');
    }
  }

  /**
   * Handle payment.captured webhook event
   */
  private async handlePaymentCaptured(payload: RazorpayWebhookPayload): Promise<void> {
    const payment = payload.payload.payment?.entity;
    if (!payment) return;

    logPayment('webhook_payment_captured', payment.order_id, payment.id, payment.status);

    // Get registration
    const registration = await registrationService.getByRazorpayOrderId(payment.order_id);
    if (!registration) {
      logger.warn('Registration not found for webhook', { orderId: payment.order_id });
      return;
    }

    // If already confirmed, skip
    if (registration.payment_status === 'confirmed') {
      logger.info('Payment already confirmed via webhook', { orderId: payment.order_id });
      return;
    }

    // Confirm the payment
    await seatService.confirmSeat(registration.tier);
    const confirmed = await registrationService.confirmPayment(
      payment.order_id,
      payment.id,
      '' // Signature not available in webhook
    );
    await this.completePendingOrder(payment.order_id);

    // Send notifications
    this.sendConfirmationNotifications(confirmed).catch((err) => {
      logger.error('Error sending notifications from webhook', { error: err.message });
    });
  }

  /**
   * Handle payment.failed webhook event
   */
  private async handlePaymentFailed(payload: RazorpayWebhookPayload): Promise<void> {
    const payment = payload.payload.payment?.entity;
    if (!payment) return;

    logPayment('webhook_payment_failed', payment.order_id, payment.id, 'failed');

    // Get registration
    const registration = await registrationService.getByRazorpayOrderId(payment.order_id);
    if (!registration) return;

    // Release the held seat
    await seatService.releaseHeldSeat(registration.tier);

    // Mark payment as failed
    await registrationService.markPaymentFailed(payment.order_id, 'Payment failed via webhook');

    // Mark pending order as expired
    await this.expirePendingOrder(payment.order_id);

    // Record abandonment for follow-up
    try {
      await abandonmentService.recordAbandonment({
        registration_id: registration.id,
        razorpay_order_id: payment.order_id,
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        business_name: registration.business_name || undefined,
        tier: registration.tier,
        amount: registration.amount_paid,
        abandonment_type: 'failed',
        abandonment_reason: `Payment failed: ${payment.description || 'Unknown error'}`,
        utm_source: registration.utm_source || undefined,
        utm_campaign: registration.utm_campaign || undefined,
      });
    } catch (error) {
      logger.error('Failed to record abandonment', {
        orderId: payment.order_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle order.paid webhook event
   */
  private async handleOrderPaid(payload: RazorpayWebhookPayload): Promise<void> {
    const order = payload.payload.order?.entity;
    if (!order) return;

    logPayment('webhook_order_paid', order.id, undefined, 'paid');
    // The payment.captured event usually handles the confirmation
    // This is a backup confirmation
  }

  /**
   * Create pending order record
   */
  private async createPendingOrder(
    orderId: string,
    tier: TierType,
    amount: number,
    data: CreateOrderRequest,
    timeoutMinutes: number
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + timeoutMinutes);

      await supabase.from('pending_orders').insert({
        razorpay_order_id: orderId,
        tier: tier,
        amount: amount,
        email: data.email,
        phone: data.phone,
        name: data.name,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        metadata: {
          business_name: data.business_name,
          industry: data.industry,
        },
      });
    } catch (error) {
      logger.error('Error creating pending order', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Mark pending order as completed
   */
  private async completePendingOrder(orderId: string): Promise<void> {
    try {
      await supabase
        .from('pending_orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('razorpay_order_id', orderId);
    } catch (error) {
      logger.error('Error completing pending order', { orderId });
    }
  }

  /**
   * Mark pending order as expired
   */
  private async expirePendingOrder(orderId: string): Promise<void> {
    try {
      await supabase
        .from('pending_orders')
        .update({ status: 'expired' })
        .eq('razorpay_order_id', orderId);
    } catch (error) {
      logger.error('Error expiring pending order', { orderId });
    }
  }

  /**
   * Check if webhook was already processed
   */
  private async isWebhookProcessed(webhookId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('payment_webhook_log')
        .select('id')
        .eq('webhook_id', webhookId)
        .eq('processed', true)
        .limit(1);

      return data !== null && data.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Log webhook to database
   */
  private async logWebhook(webhookId: string, payload: RazorpayWebhookPayload): Promise<void> {
    try {
      await supabase.from('payment_webhook_log').insert({
        webhook_id: webhookId,
        event_type: payload.event,
        razorpay_payment_id: payload.payload.payment?.entity?.id || null,
        razorpay_order_id:
          payload.payload.payment?.entity?.order_id ||
          payload.payload.order?.entity?.id ||
          null,
        payload: payload as unknown as Record<string, unknown>,
        processed: false,
      });
    } catch (error) {
      logger.error('Error logging webhook', { webhookId });
    }
  }

  /**
   * Mark webhook as processed
   */
  private async markWebhookProcessed(webhookId: string): Promise<void> {
    try {
      await supabase
        .from('payment_webhook_log')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq('webhook_id', webhookId);
    } catch (error) {
      logger.error('Error marking webhook processed', { webhookId });
    }
  }

  /**
   * Send confirmation notifications (email + WhatsApp)
   */
  private async sendConfirmationNotifications(registration: {
    booking_id: string;
    name: string;
    email: string;
    phone: string;
    tier: TierType;
    amount_paid: number;
  }): Promise<void> {
    try {
      // Send confirmation email
      await emailService.sendConfirmationEmail({
        to: registration.email,
        name: registration.name,
        booking_id: registration.booking_id,
        tier: registration.tier,
        tier_display: this.getTierDisplayName(registration.tier),
        amount: registration.amount_paid,
        event_date: config.event.date,
        event_time: config.event.time,
        venue: config.event.venue,
        benefits: await this.getTierBenefits(registration.tier),
      });

      await registrationService.markEmailSent(registration.booking_id);
      logger.info('Confirmation email sent', { bookingId: registration.booking_id });
    } catch (error) {
      logger.error('Error sending confirmation email', {
        bookingId: registration.booking_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get tier display name
   */
  private getTierDisplayName(tier: TierType): string {
    const names: Record<TierType, string> = {
      vip: 'VIP Pass',
      standard: 'Standard Pass',
      basic: 'Basic Pass',
      waitlist: 'Waitlist - Live Stream',
    };
    return names[tier] || tier;
  }

  /**
   * Get tier benefits
   */
  private async getTierBenefits(tier: TierType): Promise<string[]> {
    const inventory = await seatService.getTierAvailability(tier);
    return inventory?.benefits || [];
  }
}

export const paymentService = new PaymentService();
