import { Router } from 'express';
import { getSeats, getTierAvailability } from '../controllers/seats.controller.js';
import { readOnlyLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/seats
 * @desc Get current seat availability for all tiers
 * @access Public
 */
router.get('/', readOnlyLimiter, asyncHandler(getSeats));

/**
 * @route GET /api/seats/:tier
 * @desc Get specific tier availability
 * @access Public
 */
router.get('/:tier', readOnlyLimiter, asyncHandler(getTierAvailability));

export default router;
