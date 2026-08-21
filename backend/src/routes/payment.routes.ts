import { Router, Request, Response } from 'express';
import {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
  paymentCallback,
} from '../controllers/payment.controller.js';
import {
  trackAbandonment,
  validateRecoveryToken,
  createRecoveryOrder,
} from '../controllers/abandonment.controller.js';
import { paymentLimiter, webhookLimiter, readOnlyLimiter, standardLimiter } from '../middleware/rateLimiter.js';
import { validate, createOrderSchema, verifyPaymentSchema } from '../middleware/validation.js';
import { webhookAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { qrCodeService } from '../services/qrcode.service.js';
import { config } from '../config/index.js';

const router = Router();

/**
 * @route POST /api/create-order
 * @desc Create a new Razorpay order for registration
 * @access Public
 */
router.post(
  '/create-order',
  paymentLimiter,
  validate(createOrderSchema),
  asyncHandler(createOrder)
);

/**
 * @route POST /api/verify-payment
 * @desc Verify Razorpay payment after checkout
 * @access Public
 */
router.post(
  '/verify-payment',
  paymentLimiter,
  validate(verifyPaymentSchema),
  asyncHandler(verifyPayment)
);

router.post(
  '/payments/verify',
  paymentLimiter,
  validate(verifyPaymentSchema),
  asyncHandler(verifyPayment)
);

router.get(
  '/payment-callback',
  asyncHandler(paymentCallback)
);

router.post(
  '/payment-callback',
  asyncHandler(paymentCallback)
);

/**
 * @route POST /api/webhook/payment
 * @desc Handle payment gateway webhook events
 * @access Payment Gateway Only (webhook signature verified)
 */
router.post(
  '/webhook/payment',
  webhookLimiter,
  webhookAuth,
  asyncHandler(handleWebhook)
);

/**
 * @route GET /api/payment-status/:orderId
 * @desc Get payment status by Razorpay order ID
 * @access Public
 */
router.get(
  '/payment-status/:orderId',
  readOnlyLimiter,
  asyncHandler(getPaymentStatus)
);

/**
 * @route POST /api/track-abandonment
 * @desc Track payment abandonment (called by frontend)
 * @access Public
 */
router.post(
  '/track-abandonment',
  standardLimiter,
  asyncHandler(trackAbandonment)
);

/**
 * @route GET /api/recover/:token
 * @desc Validate recovery token and get user data
 * @access Public
 */
router.get(
  '/recover/:token',
  readOnlyLimiter,
  asyncHandler(validateRecoveryToken)
);

/**
 * @route POST /api/recover/:token/order
 * @desc Create a new order from recovery token
 * @access Public
 */
router.post(
  '/recover/:token/order',
  paymentLimiter,
  asyncHandler(createRecoveryOrder)
);

/**
 * @route GET /api/qr/:token
 * @desc Generate QR code image for recovery link
 * @access Public
 */
router.get(
  '/qr/:token',
  readOnlyLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const recoveryLink = `${config.frontendUrl}/recover/${token}`;

    const qrBuffer = await qrCodeService.generateBuffer(recoveryLink, {
      width: 200,
      margin: 2,
      color: {
        dark: '#059669',
        light: '#ffffff',
      },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(qrBuffer);
  })
);

export default router;
