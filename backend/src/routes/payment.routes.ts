import { Router } from 'express';
import {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
} from '../controllers/payment.controller.js';
import { paymentLimiter, webhookLimiter, readOnlyLimiter } from '../middleware/rateLimiter.js';
import { validate, createOrderSchema, verifyPaymentSchema } from '../middleware/validation.js';
import { webhookAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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

export default router;
