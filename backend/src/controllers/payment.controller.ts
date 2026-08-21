import { Request, Response } from 'express';
import { getRazorpay, verifyPaymentSignature } from '../config/razorpay.js';
import { paymentService } from '../services/payment.service.js';
import { logger, logPayment } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import type { CreateOrderRequest, RazorpayWebhookPayload } from '../types/index.js';
import { AppError } from '../types/index.js';

/**
 * Create a new payment order
 * POST /api/create-order
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const razorpay = getRazorpay();
    const orderData: CreateOrderRequest = req.body;
    const referer = req.headers['referer'] || req.headers['referrer'];
    const metadata = {
      ip_address: req.ip || req.socket.remoteAddress,
      user_agent: req.headers['user-agent'],
      referrer: Array.isArray(referer) ? referer[0] : referer,
    };

    const result = await paymentService.createOrder(orderData, metadata);

    if (result.success && result.order_id) {
      logPayment('create_order_success', result.order_id);
    }

    res.status(200).json({
      ...result,
      key_id: process.env.RAZORPAY_KEY_ID || ''
    });
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn('Order creation failed', { code: error.code, message: error.message });
      res.status(error.statusCode).json({ success: false, error: { message: error.message, code: error.code } });
      return;
    }
    logger.error('Unexpected error in createOrder', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Failed to create order', code: 'ORDER_ERROR' } });
  }
}

/**
 * Verify payment
 * POST /api/verify-payment
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  try {
    const razorpay = getRazorpay();
    let payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(razorpay_payment_id, payment.amount, payment.currency || 'INR');
    } else if (payment.status !== 'captured') {
      res.status(400).json({ success: false, error: { message: `Payment not captured. Status: ${payment.status}` } });
      return;
    }

    const { data: pendingOrder } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    const tenantId = pendingOrder?.metadata?.tenant_id;
    if (tenantId) {
      await supabase.from('tenants').update({ status: 'premium' }).eq('id', tenantId);
    }

    // Upsert payment record
    const { data: existingPayment } = await supabase.from('payments').select('*').eq('order_id', razorpay_order_id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({ status: 'captured', amount: payment.amount }).eq('order_id', razorpay_order_id);
    } else {
      await supabase.from('payments').insert({
        tenant_id: tenantId || '00000000-0000-0000-0000-000000000001',
        order_id: razorpay_order_id,
        status: 'captured',
        amount: payment.amount
      });
    }

    const result = await paymentService.verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });

    res.status(200).json({ success: true, message: 'Payment verified', data: result });
  } catch (error) {
    logger.error('Verification error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ success: false, error: { message: 'Payment verification failed', code: 'VERIFY_ERROR' } });
  }
}

/**
 * Webhook handler
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    await paymentService.handleWebhook(req.body, signature, rawBody);
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(200).json({ status: 'ok', error: 'Logged' });
  }
}

/**
 * Get payment status
 * GET /api/payment-status/:orderId
 */
export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;

    const { registrationService } = await import('../services/registration.service.js');
    const registration = await registrationService.getByRazorpayOrderId(orderId);

    if (!registration) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Order not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        order_id: orderId,
        booking_id: registration.payment_status === 'confirmed' ? registration.booking_id : null,
        payment_status: registration.payment_status,
        registration_status: registration.registration_status,
      },
    });
  } catch (error) {
    logger.error('Error fetching payment status', {
      orderId: req.params.orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch payment status',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Razorpay redirect payment callback handler
 * GET/POST /api/payment-callback
 */
export async function paymentCallback(req: Request, res: Response): Promise<void> {
  const razorpay_order_id = (req.body.razorpay_order_id || req.query.razorpay_order_id) as string;
  const razorpay_payment_id = (req.body.razorpay_payment_id || req.query.razorpay_payment_id) as string;
  const razorpay_signature = (req.body.razorpay_signature || req.query.razorpay_signature) as string;

  try {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      logger.warn('Payment callback missing parameters', { body: req.body, query: req.query });
      res.redirect('/onboarding/?payment=failed&error=missing_params');
      return;
    }

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      logger.warn('Payment signature verification failed in callback', { razorpay_order_id, razorpay_payment_id });
      res.redirect('/onboarding/?payment=failed&error=signature_mismatch');
      return;
    }

    const razorpay = getRazorpay();
    let payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(razorpay_payment_id, payment.amount, payment.currency || 'INR');
    } else if (payment.status !== 'captured') {
      logger.warn('Payment callback: payment not captured', { status: payment.status });
      res.redirect(`/onboarding/?payment=failed&error=payment_status_${payment.status}`);
      return;
    }

    const { data: pendingOrder } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    const tenantId = pendingOrder?.metadata?.tenant_id;
    if (tenantId) {
      await supabase.from('tenants').update({ status: 'premium' }).eq('id', tenantId);
    }

    // Upsert payment record
    const { data: existingPayment } = await supabase.from('payments').select('*').eq('order_id', razorpay_order_id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({ status: 'captured', amount: payment.amount }).eq('order_id', razorpay_order_id);
    } else {
      await supabase.from('payments').insert({
        tenant_id: tenantId || '00000000-0000-0000-0000-000000000001',
        order_id: razorpay_order_id,
        status: 'captured',
        amount: payment.amount
      });
    }

    // Verify payment in service to trigger confirmations, templates, emails, etc.
    await paymentService.verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });

    // Check if account already exists for this email
    const email = pendingOrder?.email;
    let accountExists = false;
    if (email) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();
      if (tenant) {
        accountExists = true;
      }
    }

    logger.info('Payment callback processed successfully', { razorpay_order_id, razorpay_payment_id, accountExists });
    if (accountExists) {
      res.redirect('/dashboard/');
    } else {
      res.redirect('/onboarding/?payment=success');
    }
  } catch (error) {
    logger.error('Payment callback error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.redirect('/onboarding/?payment=failed&error=callback_error');
  }
}