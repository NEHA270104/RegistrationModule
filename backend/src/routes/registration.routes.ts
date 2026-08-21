import { Router } from 'express';
import {
  getRegistration,
  checkRegistration,
  checkPendingRegistration,
  resendConfirmationEmail,
} from '../controllers/registration.controller.js';
import { readOnlyLimiter, standardLimiter } from '../middleware/rateLimiter.js';
import { validateParams, bookingIdSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/registration/:bookingId
 * @desc Get registration details by booking ID
 * @access Public (limited data)
 */
router.get(
  '/:bookingId',
  readOnlyLimiter,
  validateParams(bookingIdSchema),
  asyncHandler(getRegistration)
);

/**
 * @route POST /api/registration/check
 * @desc Check if email is already registered
 * @access Public
 */
router.post('/check', standardLimiter, asyncHandler(checkRegistration));

/**
 * @route POST /api/registration/pending
 * @desc Check for pending registrations by email (to continue payment)
 * @access Public
 */
router.post('/pending', standardLimiter, asyncHandler(checkPendingRegistration));

/**
 * @route POST /api/registration/:bookingId/resend-email
 * @desc Resend confirmation email
 * @access Public (rate limited)
 */
router.post(
  '/:bookingId/resend-email',
  standardLimiter,
  validateParams(bookingIdSchema),
  asyncHandler(resendConfirmationEmail)
);

export default router;
