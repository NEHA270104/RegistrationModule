import crypto from 'crypto';
import Razorpay from 'razorpay';

export const getRazorpay = () => new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
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
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    const isValid = expectedSignature === signature;

    if (!isValid) {
      console.warn('Payment signature verification failed', {
        orderId,
        paymentId,
      });
    }

    return isValid;
  } catch (error) {
    console.error('Error verifying payment signature', {
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
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!webhookSecret) {
      console.warn('Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Error verifying webhook signature', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Create Razorpay order
// Note: This function receives amount in RUPEES (INR) and converts to PAISE for Razorpay
export async function createRazorpayOrder(
  amountInRupees: number,
  receipt: string,
  notes: Record<string, string>
): Promise<{
  id: string;
  amount: number; // Returns amount in RUPEES (same as input)
  currency: string;
  receipt: string;
  status: string;
}> {
  try {
    const amountInPaise = Math.round(amountInRupees * 100);

    const order = await getRazorpay().orders.create({
      amount: amountInPaise, // Razorpay needs amount in paise
      currency: 'INR',
      receipt: receipt,
      notes: notes,
    });

    console.log('Razorpay order created', {
      orderId: order.id,
      amountInRupees: amountInRupees,
      amountInPaise: amountInPaise,
      receipt: order.receipt,
    });

    return {
      id: order.id,
      amount: amountInRupees, // Return in RUPEES for our database
      currency: order.currency,
      receipt: order.receipt || receipt,
      status: order.status,
    };
  } catch (error) {
    console.error('Error creating Razorpay order', {
      error: error instanceof Error ? error.message : 'Unknown error',
      receipt,
      amountInRupees,
    });
    throw error;
  }
}

// Fetch payment details from Razorpay
export async function fetchPaymentDetails(paymentId: string) {
  try {
    const payment = await getRazorpay().payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Error fetching payment details', {
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
    const refund = await getRazorpay().payments.refund(paymentId, {
      amount: amount, // Optional: partial refund amount in paise
      notes: notes,
    });

    console.log('Refund initiated', {
      paymentId,
      refundId: refund.id,
      amount: refund.amount,
    });

    return refund;
  } catch (error) {
    console.error('Error initiating refund', {
      paymentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
