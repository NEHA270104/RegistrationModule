import { Router } from 'express';
import {
  getPublicBenefits,
  getAllBenefits,
  createBenefit,
  bulkCreateBenefits,
  updateBenefit,
  deleteBenefit,
  reorderBenefits,
  aiGenerateBenefits,
} from '../controllers/msmeBenefit.controller.js';
import { adminAuth } from '../middleware/auth.js';
import { standardLimiter, adminLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/msme-benefits
 * @desc Get active benefits for public display
 * @access Public
 */
router.get('/', standardLimiter, asyncHandler(getPublicBenefits));

// ============================================
// Admin Routes (require authentication)
// ============================================

/**
 * @route GET /api/msme-benefits/admin
 * @desc Get all benefits including inactive (admin only)
 * @access Admin
 */
router.get('/admin', adminAuth, adminLimiter, asyncHandler(getAllBenefits));

/**
 * @route POST /api/msme-benefits/admin
 * @desc Create a new benefit (admin only)
 * @access Admin
 */
router.post('/admin', adminAuth, adminLimiter, asyncHandler(createBenefit));

/**
 * @route POST /api/msme-benefits/admin/bulk
 * @desc Bulk create benefits from CSV/AI (admin only)
 * @access Admin
 */
router.post('/admin/bulk', adminAuth, adminLimiter, asyncHandler(bulkCreateBenefits));

/**
 * @route PUT /api/msme-benefits/admin/reorder
 * @desc Reorder benefits (admin only)
 * @access Admin
 */
router.put('/admin/reorder', adminAuth, adminLimiter, asyncHandler(reorderBenefits));

/**
 * @route POST /api/msme-benefits/admin/ai-generate
 * @desc Generate benefit suggestions using AI (admin only)
 * @access Admin
 */
router.post('/admin/ai-generate', adminAuth, adminLimiter, asyncHandler(aiGenerateBenefits));

/**
 * @route PUT /api/msme-benefits/admin/:id
 * @desc Update a benefit (admin only)
 * @access Admin
 */
router.put('/admin/:id', adminAuth, adminLimiter, asyncHandler(updateBenefit));

/**
 * @route DELETE /api/msme-benefits/admin/:id
 * @desc Delete a benefit (admin only)
 * @access Admin
 */
router.delete('/admin/:id', adminAuth, adminLimiter, asyncHandler(deleteBenefit));

export default router;
