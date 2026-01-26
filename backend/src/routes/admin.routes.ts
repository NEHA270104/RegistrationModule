import { Router } from 'express';
import {
  getDashboardStats,
  getAllRegistrations,
  getRegistrationDetails,
  exportRegistrations,
  getWaitlistEntries,
  getSeatInventory,
  adjustSeats,
  resendConfirmation,
} from '../controllers/admin.controller.js';
import { adminAuth } from '../middleware/auth.js';
import { strictLimiter, standardLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

/**
 * @route GET /api/admin/stats
 * @desc Get dashboard statistics
 * @access Admin
 */
router.get('/stats', standardLimiter, asyncHandler(getDashboardStats));

/**
 * @route GET /api/admin/registrations
 * @desc Get all registrations with filters
 * @access Admin
 */
router.get('/registrations', standardLimiter, asyncHandler(getAllRegistrations));

/**
 * @route GET /api/admin/registrations/:bookingId
 * @desc Get full registration details
 * @access Admin
 */
router.get('/registrations/:bookingId', standardLimiter, asyncHandler(getRegistrationDetails));

/**
 * @route POST /api/admin/registrations/:bookingId/resend
 * @desc Resend confirmation to a registration
 * @access Admin
 */
router.post('/registrations/:bookingId/resend', standardLimiter, asyncHandler(resendConfirmation));

/**
 * @route GET /api/admin/export
 * @desc Export registrations as CSV
 * @access Admin
 */
router.get('/export', strictLimiter, asyncHandler(exportRegistrations));

/**
 * @route GET /api/admin/waitlist
 * @desc Get all waitlist entries
 * @access Admin
 */
router.get('/waitlist', standardLimiter, asyncHandler(getWaitlistEntries));

/**
 * @route GET /api/admin/seats
 * @desc Get seat inventory status
 * @access Admin
 */
router.get('/seats', standardLimiter, asyncHandler(getSeatInventory));

/**
 * @route POST /api/admin/seats/adjust
 * @desc Manual seat adjustment (disabled for safety)
 * @access Admin
 */
router.post('/seats/adjust', strictLimiter, asyncHandler(adjustSeats));

export default router;
