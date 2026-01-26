import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service.js';
import { logger, logPayment } from '../utils/logger.js';
import type {
  CreateOrderRequest,
  VerifyPaymentRequest,
  RazorpayWebhookPayload,
} from '../types/index.js';
import { AppError } from '../types/index.js';

/**
 * Create a new payment order
 * POST /api/create-order
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const orderData: CreateOrderRequest = req.body;

    // Get client metadata
    const metadata = {
      ip_address: req.ip || req.socket.remoteAddress,
      user_agent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'],
    };

    const result = await paymentService.createOrder(orderData, metadata);

    logPayment('create_order_success', result.order_id);

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn('Order creation failed', {
        code: error.code,
        message: error.message,
        email: req.body?.email,
      });

      res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
        },
      });
      return;
    }

    logger.error('Unexpected error in createOrder controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create order',
        code: 'ORDER_ERROR',
      },
    });
  }
}

/**
 * Verify payment after Razorpay checkout
 * POST /api/verify-payment
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const paymentData: VerifyPaymentRequest = req.body;

    logPayment(
      'verify_payment_attempt',
      paymentData.razorpay_order_id,
      paymentData.razorpay_payment_id
    );

    const result = await paymentService.verifyPayment(paymentData);

    logPayment(
      'verify_payment_success',
      paymentData.razorpay_order_id,
      paymentData.razorpay_payment_id,
      'confirmed'
    );

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      logPayment(
        'verify_payment_failed',
        req.body?.razorpay_order_id,
        req.body?.razorpay_payment_id,
        'failed'
      );

      res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
        },
      });
      return;
    }

    logger.error('Unexpected error in verifyPayment controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Payment verification failed',
        code: 'VERIFY_ERROR',
      },
    });
  }
}

/**
 * Handle Razorpay webhook
 * POST /api/webhook/razorpay
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    const payload: RazorpayWebhookPayload = req.body;

    logger.info('Webhook received', {
      event: payload.event,
      paymentId: payload.payload.payment?.entity?.id,
    });

    await paymentService.handleWebhook(payload, signature, rawBody);

    // Always return 200 to Razorpay to acknowledge receipt
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    // Log but still return 200 to prevent Razorpay retries for application errors
    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      event: req.body?.event,
    });

    // Return 200 for application errors (we've logged them)
    // Return 401 only for signature verification failures
    if (error instanceof AppError && error.code === 'INVALID_WEBHOOK_SIGNATURE') {
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE',
        },
      });
      return;
    }

    res.status(200).json({ status: 'ok', error: 'Processing error logged' });
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
