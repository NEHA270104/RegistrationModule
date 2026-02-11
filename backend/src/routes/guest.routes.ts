import { Router } from 'express';
import {
  getPublicGuests,
  getAllGuests,
  createGuest,
  updateGuest,
  deleteGuest,
  uploadGuestPhoto,
  deleteGuestPhoto,
  reorderGuests,
  aiEnhanceGuestText,
} from '../controllers/guest.controller.js';
import { adminAuth } from '../middleware/auth.js';
import { standardLimiter, adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/guests
 * @desc Get active guests for public display
 * @access Public
 */
router.get('/', standardLimiter, asyncHandler(getPublicGuests));

// ============================================
// Admin Routes (require authentication)
// ============================================

/**
 * @route GET /api/guests/admin
 * @desc Get all guests including inactive (admin only)
 * @access Admin
 */
router.get('/admin', adminAuth, adminLimiter, asyncHandler(getAllGuests));

/**
 * @route POST /api/guests/admin
 * @desc Create a new guest (admin only)
 * @access Admin
 */
router.post('/admin', adminAuth, adminLimiter, asyncHandler(createGuest));

/**
 * @route POST /api/guests/admin/ai-enhance
 * @desc AI-enhance a guest field text (admin only)
 * @access Admin
 */
router.post('/admin/ai-enhance', adminAuth, adminLimiter, asyncHandler(aiEnhanceGuestText));

/**
 * @route PUT /api/guests/admin/reorder
 * @desc Reorder guests (admin only)
 * @access Admin
 */
router.put('/admin/reorder', adminAuth, adminLimiter, asyncHandler(reorderGuests));

/**
 * @route PUT /api/guests/admin/:id
 * @desc Update a guest (admin only)
 * @access Admin
 */
router.put('/admin/:id', adminAuth, adminLimiter, asyncHandler(updateGuest));

/**
 * @route DELETE /api/guests/admin/:id
 * @desc Delete a guest (admin only)
 * @access Admin
 */
router.delete('/admin/:id', adminAuth, adminLimiter, asyncHandler(deleteGuest));

/**
 * @route POST /api/guests/admin/:id/photo
 * @desc Upload guest photo (admin only)
 * @access Admin
 */
router.post('/admin/:id/photo', adminAuth, adminLimiter, asyncHandler(uploadGuestPhoto));

/**
 * @route DELETE /api/guests/admin/:id/photo
 * @desc Delete guest photo (admin only)
 * @access Admin
 */
router.delete('/admin/:id/photo', adminAuth, adminLimiter, asyncHandler(deleteGuestPhoto));

export default router;
