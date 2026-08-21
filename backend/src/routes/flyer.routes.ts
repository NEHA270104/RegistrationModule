import { Router } from 'express';
import { getFlyers, createFlyer, deleteFlyer, generateFlyer } from '../controllers/flyer.controller.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @route GET /api/admin/flyers
 * @desc Get all flyers (admin only)
 * @access Admin
 */
router.get('/', asyncHandler(getFlyers));

/**
 * @route POST /api/admin/flyers/generate
 * @desc AI-powered flyer copy generation using Claude (template + event details → copy + image_url)
 * @access Admin
 */
router.post('/generate', asyncHandler(generateFlyer));

/**
 * @route POST /api/admin/flyers
 * @desc Create and upload a flyer (admin only)
 * @access Admin
 */
router.post('/', asyncHandler(createFlyer));

/**
 * @route DELETE /api/admin/flyers/:id
 * @desc Delete a flyer (admin only)
 * @access Admin
 */
router.delete('/:id', asyncHandler(deleteFlyer));

export default router;
