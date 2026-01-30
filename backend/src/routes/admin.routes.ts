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
  deleteRegistration,
  createManualRegistration,
  resyncSeatCounts,
  sendPaymentReminder,
} from '../controllers/admin.controller.js';
import {
  getAbandonments,
  getAbandonmentStats,
  getAbandonmentDetails,
  deleteAbandonment,
  updateFollowupStatus,
  generateRecoveryLink,
  sendFollowupEmail,
  exportAbandonments,
  getPendingRegistrations,
  cleanupExpiredRegistrations,
} from '../controllers/abandonment.controller.js';
import { adminAuth } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

// Disable caching for all admin routes to ensure fresh data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

/**
 * @route GET /api/admin/stats
 * @desc Get dashboard statistics
 * @access Admin
 */
router.get('/stats', adminLimiter, asyncHandler(getDashboardStats));

/**
 * @route GET /api/admin/registrations
 * @desc Get all registrations with filters
 * @access Admin
 */
router.get('/registrations', adminLimiter, asyncHandler(getAllRegistrations));

/**
 * @route GET /api/admin/registrations/:bookingId
 * @desc Get full registration details
 * @access Admin
 */
router.get('/registrations/:bookingId', adminLimiter, asyncHandler(getRegistrationDetails));

/**
 * @route POST /api/admin/registrations/:bookingId/resend
 * @desc Resend confirmation to a registration
 * @access Admin
 */
router.post('/registrations/:bookingId/resend', adminLimiter, asyncHandler(resendConfirmation));

/**
 * @route DELETE /api/admin/registrations/:bookingId
 * @desc Delete a registration
 * @access Admin
 */
router.delete('/registrations/:bookingId', adminLimiter, asyncHandler(deleteRegistration));

/**
 * @route POST /api/admin/registrations
 * @desc Create a manual registration
 * @access Admin
 */
router.post('/registrations', adminLimiter, asyncHandler(createManualRegistration));

/**
 * @route GET /api/admin/export
 * @desc Export registrations as CSV
 * @access Admin
 */
router.get('/export', adminLimiter, asyncHandler(exportRegistrations));

/**
 * @route GET /api/admin/waitlist
 * @desc Get all waitlist entries
 * @access Admin
 */
router.get('/waitlist', adminLimiter, asyncHandler(getWaitlistEntries));

/**
 * @route GET /api/admin/seats
 * @desc Get seat inventory status
 * @access Admin
 */
router.get('/seats', adminLimiter, asyncHandler(getSeatInventory));

/**
 * @route POST /api/admin/seats/adjust
 * @desc Manual seat adjustment (disabled for safety)
 * @access Admin
 */
router.post('/seats/adjust', adminLimiter, asyncHandler(adjustSeats));

/**
 * @route POST /api/admin/seats/resync
 * @desc Resync seat counts from registrations table
 * @access Admin
 */
router.post('/seats/resync', adminLimiter, asyncHandler(resyncSeatCounts));

/**
 * @route POST /api/admin/registrations/:registrationId/remind
 * @desc Send payment reminder email to pending registration
 * @access Admin
 */
router.post('/registrations/:registrationId/remind', adminLimiter, asyncHandler(sendPaymentReminder));

// ============================================
// Payment Abandonment Routes
// ============================================

/**
 * @route GET /api/admin/abandonments
 * @desc Get all payment abandonments with filters
 * @access Admin
 */
router.get('/abandonments', adminLimiter, asyncHandler(getAbandonments));

/**
 * @route GET /api/admin/abandonments/stats
 * @desc Get abandonment statistics
 * @access Admin
 */
router.get('/abandonments/stats', adminLimiter, asyncHandler(getAbandonmentStats));

/**
 * @route GET /api/admin/abandonments/export
 * @desc Export abandonments as CSV
 * @access Admin
 */
router.get('/abandonments/export', adminLimiter, asyncHandler(exportAbandonments));

/**
 * @route GET /api/admin/abandonments/pending
 * @desc Get pending registrations (held seats awaiting payment)
 * @access Admin
 */
router.get('/abandonments/pending', adminLimiter, asyncHandler(getPendingRegistrations));

/**
 * @route POST /api/admin/abandonments/cleanup
 * @desc Release expired registrations and free up seats
 * @access Admin
 */
router.post('/abandonments/cleanup', adminLimiter, asyncHandler(cleanupExpiredRegistrations));

/**
 * @route GET /api/admin/abandonments/:id
 * @desc Get single abandonment details
 * @access Admin
 */
router.get('/abandonments/:id', adminLimiter, asyncHandler(getAbandonmentDetails));

/**
 * @route DELETE /api/admin/abandonments/:id
 * @desc Delete an abandonment record
 * @access Admin
 */
router.delete('/abandonments/:id', adminLimiter, asyncHandler(deleteAbandonment));

/**
 * @route PATCH /api/admin/abandonments/:id/status
 * @desc Update follow-up status
 * @access Admin
 */
router.patch('/abandonments/:id/status', adminLimiter, asyncHandler(updateFollowupStatus));

/**
 * @route POST /api/admin/abandonments/:id/recovery-link
 * @desc Generate recovery link with QR code
 * @access Admin
 */
router.post('/abandonments/:id/recovery-link', adminLimiter, asyncHandler(generateRecoveryLink));

/**
 * @route POST /api/admin/abandonments/:id/send-email
 * @desc Send follow-up email with recovery link
 * @access Admin
 */
router.post('/abandonments/:id/send-email', adminLimiter, asyncHandler(sendFollowupEmail));

export default router;
