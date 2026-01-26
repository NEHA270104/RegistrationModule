import { Router } from 'express';
import {
  joinWaitlist,
  getWaitlistStatus,
  getWaitlistCount,
  verifyLivestreamPayment,
} from '../controllers/waitlist.controller.js';
import { standardLimiter, readOnlyLimiter, paymentLimiter } from '../middleware/rateLimiter.js';
import { validate, waitlistSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route POST /api/waitlist
 * @desc Add user to waitlist
 * @access Public
 */
router.post('/', standardLimiter, validate(waitlistSchema), asyncHandler(joinWaitlist));

/**
 * @route GET /api/waitlist/status
 * @desc Check waitlist status by email
 * @access Public
 */
router.get('/status', readOnlyLimiter, asyncHandler(getWaitlistStatus));

/**
 * @route GET /api/waitlist/count
 * @desc Get current waitlist count
 * @access Public
 */
router.get('/count', readOnlyLimiter, asyncHandler(getWaitlistCount));

/**
 * @route POST /api/waitlist/verify-livestream
 * @desc Verify livestream payment for waitlist user
 * @access Public
 */
router.post(
  '/verify-livestream',
  paymentLimiter,
  asyncHandler(verifyLivestreamPayment)
);

export default router;
