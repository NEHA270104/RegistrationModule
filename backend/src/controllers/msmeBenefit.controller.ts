import { Request, Response } from 'express';
import { msmeBenefitService } from '../services/msmeBenefit.service.js';
import { openAIService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/msme-benefits (Public)
 * Returns active benefits for the frontend section
 */
export async function getPublicBenefits(req: Request, res: Response): Promise<void> {
  const benefits = await msmeBenefitService.getActiveBenefits();
  res.json({ success: true, data: { benefits } });
}

/**
 * GET /api/msme-benefits/admin (Admin)
 * Returns all benefits including inactive
 */
export async function getAllBenefits(req: Request, res: Response): Promise<void> {
  const benefits = await msmeBenefitService.getAllBenefits();
  res.json({ success: true, data: { benefits } });
}

/**
 * POST /api/msme-benefits/admin (Admin)
 * Create a new benefit
 */
export async function createBenefit(req: Request, res: Response): Promise<void> {
  const { title, description, icon, sort_order, is_active } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({
      success: false,
      error: { message: 'Title is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const benefit = await msmeBenefitService.createBenefit({
    title: title.trim(),
    description,
    icon,
    sort_order,
    is_active,
  });

  res.status(201).json({ success: true, data: { benefit } });
}

/**
 * POST /api/msme-benefits/admin/bulk (Admin)
 * Bulk create benefits from CSV/AI
 */
export async function bulkCreateBenefits(req: Request, res: Response): Promise<void> {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'items array is required and must not be empty', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  for (const item of items) {
    if (!item.title || !item.title.trim()) {
      res.status(400).json({
        success: false,
        error: { message: 'Each item must have a title', code: 'VALIDATION_ERROR' },
      });
      return;
    }
  }

  const benefits = await msmeBenefitService.bulkCreateBenefits(items);
  res.status(201).json({ success: true, data: { benefits, count: benefits.length } });
}

/**
 * PUT /api/msme-benefits/admin/:id (Admin)
 * Update an existing benefit
 */
export async function updateBenefit(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const benefit = await msmeBenefitService.updateBenefit(id, req.body);
  res.json({ success: true, data: { benefit } });
}

/**
 * DELETE /api/msme-benefits/admin/:id (Admin)
 * Delete a benefit
 */
export async function deleteBenefit(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await msmeBenefitService.deleteBenefit(id);
  res.json({ success: true, message: 'Benefit deleted' });
}

/**
 * PUT /api/msme-benefits/admin/reorder (Admin)
 * Reorder benefits
 */
export async function reorderBenefits(req: Request, res: Response): Promise<void> {
  const { orderedIds } = req.body;

  if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'orderedIds array is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  await msmeBenefitService.reorderBenefits(orderedIds);
  res.json({ success: true, message: 'Benefits reordered' });
}

/**
 * POST /api/msme-benefits/admin/ai-generate (Admin)
 * Generate benefit suggestions using OpenAI
 */
export async function aiGenerateBenefits(req: Request, res: Response): Promise<void> {
  const { theme, count } = req.body;

  if (!theme || !theme.trim()) {
    res.status(400).json({
      success: false,
      error: { message: 'Theme is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const clampedCount = Math.min(Math.max(count || 6, 1), 12);
  const suggestions = await openAIService.generateBenefitSuggestions(theme.trim(), clampedCount);

  logger.info('AI benefits generated', { theme: theme.trim(), count: suggestions.length });
  res.json({ success: true, data: { suggestions, theme: theme.trim() } });
}
