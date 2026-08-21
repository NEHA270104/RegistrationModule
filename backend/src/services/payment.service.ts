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
import { subscriptionService } from './subscription.service.js';
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
import { pricing, getPriceInRupees } from '../config/pricing.js';

export class PaymentService {
  /**
   * Get tier price dynamically from the database
   */
  async getTierPriceDynamically(tier: string, billingCycle: string = 'monthly'): Promise<number> {
    const normalized = tier.toLowerCase();
    
    // 1. Query live price dynamically from Supabase subscription_plans table
    if (['starter', 'pro', 'enterprise', 'basic', 'standard', 'premium', 'launchpad', 'scaleup'].includes(normalized)) {
      try {
        const { data: plans, error } = await supabase
          .from('subscription_plans')
          .select('*');
        
        if (!error && plans && plans.length > 0) {
          const plan = plans.find((p: any) => {
            const nameLower = p.name.toLowerCase();
            if (normalized === 'starter' || normalized === 'basic' || normalized === 'launchpad')
              return nameLower.includes('basic') || nameLower.includes('starter') || nameLower.includes('launchpad');
            if (normalized === 'pro' || normalized === 'standard' || normalized === 'scaleup')
              return nameLower.includes('standard') || nameLower.includes('pro') || nameLower.includes('scaleup');
            if (normalized === 'enterprise' || normalized === 'premium')
              return nameLower.includes('premium') || nameLower.includes('enterprise');
            return nameLower === normalized;
          });

          if (plan && plan.price_inr !== undefined && plan.price_inr !== null) {
            const monthlyPrice = Number(plan.price_inr);
            if (billingCycle === 'yearly') {
              return plan.price_annual !== undefined ? Number(plan.price_annual) : Math.round(monthlyPrice * 12 * 0.83);
            }
            return monthlyPrice;
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch plan price dynamically from Supabase subscription_plans, falling back:', err);
      }
    }

    // Explicit Live Testing Plan Fallback (Basic = 1, Standard = 5, Premium = 10)
    if (normalized === 'basic' || normalized === 'starter' || normalized === 'launchpad') {
      return billingCycle === 'yearly' ? Math.round(1 * 12 * 0.83) : 1;
    }
    if (normalized === 'standard' || normalized === 'pro' || normalized === 'scaleup') {
      return billingCycle === 'yearly' ? Math.round(5 * 12 * 0.83) : 5;
    }
    if (normalized === 'premium' || normalized === 'enterprise') {
      return billingCycle === 'yearly' ? Math.round(10 * 12 * 0.83) : 10;
    }

    // 2. Check if it's an event ticket tier in seat_inventory
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from('seat_inventory')
        .select('price_inr')
        .eq('tier_name', normalized)
        .maybeSingle();
      
      if (!ticketError && ticket) {
        return ticket.price_inr;
      }
    } catch (err) {
      logger.warn('Failed to fetch ticket price dynamically, falling back to static config:', err);
    }

    // 3. Fallback to static pricing config
    return getPriceInRupees(tier);
  }

  /**
   * Create a new order for payment
   */
  async createOrder(
    data: CreateOrderRequest,
    metadata?: { ip_address?: string; user_agent?: string; referrer?: string }
  ): Promise<CreateOrderResponse> {
    const tier = data.tier;
    const normalizedTier = tier.toLowerCase();
    const isSubscriptionTier = [
      'starter', 'pro', 'enterprise', 'basic', 'standard', 'premium',
      'launchpad', 'scaleup'   // alias tier names
    ].includes(normalizedTier);

    try {
      if (!isSubscriptionTier) {
        logger.info('Creating order - Step 1: Checking duplicates', { email: data.email, phone: data.phone });

        // Check for duplicate registration (email, phone, or name+phone)
        const duplicateCheck = await registrationService.checkDuplicateRegistration(
          data.email || '',
          data.phone || '',
          data.name || ''
        );
        if (duplicateCheck.isDuplicate) {
          // If there's a pending/failed registration, try to find and create a recovery link
          if (duplicateCheck.code === 'PENDING_REGISTRATION_EXISTS' && duplicateCheck.registrationId) {
            try {
              // Look for existing abandonment record
              const abandonment = await abandonmentService.getByRegistrationId(duplicateCheck.registrationId);

              if (abandonment) {
                // Generate/regenerate recovery link
                const recovery = await abandonmentService.generateRecoveryLink(abandonment.id);

                logger.info('Generated recovery link for duplicate registration attempt', {
                  email: data.email,
                  abandonmentId: abandonment.id,
                  registrationId: duplicateCheck.registrationId,
                });

                // Include recovery link in error for frontend to display
                const errorWithRecovery = new AppError(
                  duplicateCheck.reason || 'You have an incomplete registration',
                  400,
                  duplicateCheck.code || 'PENDING_REGISTRATION_EXISTS'
                );
                (errorWithRecovery as any).recoveryLink = recovery.link;
                throw errorWithRecovery;
              }
            } catch (recoveryError) {
              // If recovery link generation fails, just show the standard message
              logger.warn('Failed to generate recovery link for pending registration', {
                error: recoveryError instanceof Error ? recoveryError.message : 'Unknown error',
                registrationId: duplicateCheck.registrationId,
              });
            }
          }

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
      }

      logger.info('Creating order - Step 4: Getting tier price', { tier });

      // Get tier price dynamically from the database
      const amount = await this.getTierPriceDynamically(tier, data.billing_cycle);
      const amountInPaise = Math.round(amount * 100);

      logger.info('Creating order - Step 5: Creating Razorpay order', { tier, amount });

      // Generate unique receipt ID
      const receiptId = `rcpt_${Date.now()}_${uuidv4().slice(0, 8)}`;

      // Console.log right before the Razorpay order call to verify the amount in paise
      console.log(`[Razorpay Order Debug] Creating Razorpay order for tier: ${tier}, amount: ${amount} INR, amount in paise: ${amountInPaise}`);

      // Create Razorpay order - amount in RUPEES, function converts to paise for Razorpay
      const razorpayOrder = await createRazorpayOrder(amount, receiptId, {
        tier: tier,
        email: data.email || '',
        phone: data.phone || '',
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

      if (isSubscriptionTier) {
        logger.info('Creating order - Step 7: Subscription order created successfully', { orderId: razorpayOrder.id });
        logPayment('subscription_order_created', razorpayOrder.id, undefined, 'pending');

        return {
          success: true,
          order_id: razorpayOrder.id,
          amount: amount,
          currency: 'INR',
          key_id: config.razorpay.keyId,
          prefill: {
            name: data.name || '',
            email: data.email || '',
            contact: data.phone || '',
          },
          notes: {
            tier: tier,
          },
        };
      }

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
          name: data.name || '',
          email: data.email || '',
          contact: data.phone || '',
        },
        notes: {
          tier: tier,
          registration_id: registration.id,
        },
      };
    } catch (error) {
      if (!isSubscriptionTier) {
        // Release the reserved seat if order creation failed
        // Only skip release if error is specifically TIER_SOLD_OUT (seat was never reserved)
        const isAppError = error instanceof AppError;
        const isTierSoldOut = isAppError && error.code === 'TIER_SOLD_OUT';

        if (!isTierSoldOut) {
          logger.info('Releasing held seat due to order creation failure', { tier });
          await seatService.releaseHeldSeat(tier);
        }
      }

      const isAppError = error instanceof AppError;
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

      // Check if this order is a subscription upgrade
      const { data: pendingOrder, error: pendingOrderError } = await supabase
        .from('pending_orders')
        .select('*')
        .eq('razorpay_order_id', razorpay_order_id)
        .maybeSingle();

      if (pendingOrderError) {
        logger.error('Error fetching pending order in verifyPayment', { error: pendingOrderError.message, orderId: razorpay_order_id });
      }

      const isSubscription = pendingOrder && [
        'starter', 'pro', 'enterprise', 'basic', 'standard', 'premium'
      ].includes(pendingOrder.tier.toLowerCase());

      if (isSubscription) {
        const tenantId = pendingOrder.metadata?.tenant_id;
        const billingCycle = pendingOrder.metadata?.billing_cycle || 'monthly';

        if (tenantId) {
          // Upgrade/change subscription plan (if tenant exists, e.g. upgrades)
          await subscriptionService.changePlan(tenantId, pendingOrder.tier.toLowerCase(), billingCycle);
        } else {
          logger.info('Skipping plan activation in verifyPayment: tenant not created yet (new onboarding flow)');
        }

        // Mark pending order as completed
        await this.completePendingOrder(razorpay_order_id);

        // Update payment status in payments table
        await supabase
          .from('payments')
          .update({ status: 'captured' })
          .eq('order_id', razorpay_order_id);

        // Log transaction in payment_webhook_log
        try {
          await supabase.from('payment_webhook_log').insert({
            webhook_id: `verify_${razorpay_payment_id}`,
            event_type: 'payment.verified',
            razorpay_payment_id: razorpay_payment_id,
            razorpay_order_id: razorpay_order_id,
            payload: { verified_via: 'api_verification', date: new Date().toISOString() } as any,
            processed: true
          });
        } catch (logErr) {
          logger.error('Error logging verified payment to payment_webhook_log', { razorpay_order_id });
        }

        logPayment('subscription_payment_verified', razorpay_order_id, razorpay_payment_id, 'confirmed');

        return {
          success: true,
          booking_id: `SUB-${razorpay_order_id.slice(-8).toUpperCase()}`,
          message: 'Subscription payment verified successfully',
          registration: {
            name: pendingOrder.name,
            email: pendingOrder.email,
            tier: pendingOrder.tier as any,
            amount_paid: pendingOrder.amount,
          },
        };
      }

      // Get registration
      const registration = await registrationService.getByRazorpayOrderId(razorpay_order_id);
      if (!registration) {
        throw new AppError('Registration not found', 404, 'REGISTRATION_NOT_FOUND');
      }

      // Check if already processed (idempotency)
      if (registration.payment_status === 'confirmed') {
        // Still handle recovery conversion even if webhook already confirmed the payment
        if (data.recovery_token) {
          this.handleRecoveryConversion(data.recovery_token, registration.id).catch((err) => {
            logger.error('Error handling recovery conversion (idempotent path)', { error: err.message });
          });
        }

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

      // Update payment status in payments table
      await supabase
        .from('payments')
        .update({ status: 'captured' })
        .eq('order_id', razorpay_order_id);

      logPayment('payment_verified', razorpay_order_id, razorpay_payment_id, 'confirmed');

      // Send confirmation email (async, don't block response)
      this.sendConfirmationNotifications(confirmedRegistration).catch((err) => {
        logger.error('Error sending confirmation notifications', { error: err.message });
      });

      // Handle recovery conversion tracking (async, don't block response)
      if (data.recovery_token) {
        this.handleRecoveryConversion(data.recovery_token, confirmedRegistration.id).catch((err) => {
          logger.error('Error handling recovery conversion', { error: err.message });
        });
      }

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

    // Update payment status in payments table
    await supabase
      .from('payments')
      .update({ status: 'captured' })
      .eq('order_id', payment.order_id);

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

    // Update payment status in payments table
    await supabase
      .from('payments')
      .update({ status: 'failed' })
      .eq('order_id', payment.order_id);

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
        email: data.email || 'pending@example.com',
        phone: data.phone || '0000000000',
        name: data.name || 'Pending Onboarding',
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        metadata: {
          business_name: data.business_name,
          industry: data.industry,
          tenant_id: data.tenant_id,
          billing_cycle: data.billing_cycle || 'monthly'
        },
      });

      // Log entry into the new payments table
      let tenantId = data.tenant_id;
      if (!tenantId) {
        const { data: firstTenant } = await supabase
          .from('tenants')
          .select('id')
          .limit(1)
          .maybeSingle();
        tenantId = firstTenant?.id || '00000000-0000-0000-0000-000000000001';
      }
      const amountInPaise = Math.round(amount * 100);

      const { error: paymentError } = await supabase.from('payments').insert({
        tenant_id: tenantId,
        order_id: orderId,
        status: 'pending',
        amount: amountInPaise,
        created_at: new Date().toISOString()
      });

      if (paymentError) {
        logger.error('Error logging pending payment', {
          orderId,
          tenantId,
          error: paymentError.message
        });
      } else {
        logger.info('Logged pending payment in payments table', { orderId, tenantId, amountInPaise });
      }
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
   * Handle recovery conversion: mark token used and abandonment as converted
   */
  private async handleRecoveryConversion(token: string, registrationId: string): Promise<void> {
    try {
      // Look up abandonment by token (without expiry/used check since payment just succeeded)
      const abandonment = await abandonmentService.getByRecoveryToken(token);

      if (!abandonment) {
        logger.warn('Recovery token not found for conversion tracking', { token: token.substring(0, 8) + '...' });
        return;
      }

      // Mark recovery link as used
      await abandonmentService.markRecoveryLinkUsed(token);

      // Mark abandonment as converted
      await abandonmentService.markConverted(abandonment.id, registrationId);

      logger.info('Recovery conversion tracked', {
        abandonmentId: abandonment.id,
        registrationId,
        email: abandonment.email,
      });
    } catch (error) {
      logger.error('Failed to track recovery conversion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        token: token.substring(0, 8) + '...',
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
      starter: 'Starter Plan',
      pro: 'Pro Plan',
      enterprise: 'Enterprise Plan',
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
