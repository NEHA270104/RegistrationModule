import { Router } from 'express';
import {
  getPublicSettings,
  getAllSettings,
  getSettingsByCategory,
  updateSetting,
  updateSettings,
  updateOfferConfig,
  updateTierPricing,
  getSettingsHistory,
  aiGeneratePromo,
} from '../controllers/settings.controller.js';
import { adminAuth } from '../middleware/auth.js';
import { standardLimiter, adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/settings
 * @desc Get public settings for frontend config
 * @access Public
 */
router.get('/', standardLimiter, asyncHandler(getPublicSettings));

// ============================================
// Admin Routes (require authentication)
// ============================================

/**
 * @route GET /api/settings/admin
 * @desc Get all settings (admin only)
 * @access Admin
 */
router.get('/admin', adminAuth, adminLimiter, asyncHandler(getAllSettings));

/**
 * @route GET /api/settings/admin/category/:category
 * @desc Get settings by category (admin only)
 * @access Admin
 */
router.get('/admin/category/:category', adminAuth, adminLimiter, asyncHandler(getSettingsByCategory));

/**
 * @route GET /api/settings/admin/history
 * @desc Get settings change history (admin only)
 * @access Admin
 */
router.get('/admin/history', adminAuth, adminLimiter, asyncHandler(getSettingsHistory));

/**
 * @route PUT /api/settings/admin/:key
 * @desc Update a single setting (admin only)
 * @access Admin
 */
router.put('/admin/:key', adminAuth, adminLimiter, asyncHandler(updateSetting));

/**
 * @route POST /api/settings/admin/batch
 * @desc Update multiple settings (admin only)
 * @access Admin
 */
router.post('/admin/batch', adminAuth, adminLimiter, asyncHandler(updateSettings));

/**
 * @route PUT /api/settings/admin/offer
 * @desc Update offer configuration (admin only)
 * @access Admin
 */
router.put('/admin/offer', adminAuth, adminLimiter, asyncHandler(updateOfferConfig));

/**
 * @route PUT /api/settings/admin/pricing/:tier
 * @desc Update tier pricing (admin only)
 * @access Admin
 */
router.put('/admin/pricing/:tier', adminAuth, adminLimiter, asyncHandler(updateTierPricing));

/**
 * @route POST /api/settings/admin/promo/ai-suggest
 * @desc Generate AI promo content suggestions (admin only)
 * @access Admin
 */
router.post('/admin/promo/ai-suggest', adminAuth, adminLimiter, asyncHandler(aiGeneratePromo));

export default router;
