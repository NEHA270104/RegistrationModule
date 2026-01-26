import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

// Initialize Razorpay instance
export const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

// Verify Razorpay payment signature
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === signature;

    if (!isValid) {
      logger.warn('Payment signature verification failed', {
        orderId,
        paymentId,
      });
    }

    return isValid;
  } catch (error) {
    logger.error('Error verifying payment signature', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Verify Razorpay webhook signature
export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  try {
    if (!config.razorpay.webhookSecret) {
      logger.warn('Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    logger.error('Error verifying webhook signature', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Create Razorpay order
export async function createRazorpayOrder(
  amount: number,
  receipt: string,
  notes: Record<string, string>
): Promise<{
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}> {
  try {
    const order = await razorpay.orders.create({
      amount: amount, // Amount in paise
      currency: 'INR',
      receipt: receipt,
      notes: notes,
    });

    logger.info('Razorpay order created', {
      orderId: order.id,
      amount: order.amount,
      receipt: order.receipt,
    });

    return order;
  } catch (error) {
    logger.error('Error creating Razorpay order', {
      error: error instanceof Error ? error.message : 'Unknown error',
      receipt,
      amount,
    });
    throw error;
  }
}

// Fetch payment details from Razorpay
export async function fetchPaymentDetails(paymentId: string) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error('Error fetching payment details', {
      paymentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Refund payment
export async function refundPayment(
  paymentId: string,
  amount?: number,
  notes?: Record<string, string>
) {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount, // Optional: partial refund amount in paise
      notes: notes,
    });

    logger.info('Refund initiated', {
      paymentId,
      refundId: refund.id,
      amount: refund.amount,
    });

    return refund;
  } catch (error) {
    logger.error('Error initiating refund', {
      paymentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
