import { Request, Response } from 'express';
import { guestService } from '../services/guest.service.js';
import { openAIService } from '../services/openai.service.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/guests (Public)
 * Returns active guests for the frontend speakers section
 */
export async function getPublicGuests(req: Request, res: Response): Promise<void> {
  const guests = await guestService.getActiveGuests();
  res.json({ success: true, data: { guests } });
}

/**
 * GET /api/guests/admin (Admin)
 * Returns all guests including inactive
 */
export async function getAllGuests(req: Request, res: Response): Promise<void> {
  const guests = await guestService.getAllGuests();
  res.json({ success: true, data: { guests } });
}

/**
 * POST /api/guests/admin (Admin)
 * Create a new guest
 */
export async function createGuest(req: Request, res: Response): Promise<void> {
  const { name, title, bio, session_heading, session_points, sort_order, is_active } = req.body;

  // Validation
  if (!name || !title || !bio) {
    res.status(400).json({
      success: false,
      error: { message: 'Name, title, and bio are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (!session_points || !Array.isArray(session_points) || session_points.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'At least one session point is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const guest = await guestService.createGuest({
    name,
    title,
    bio,
    session_heading,
    session_points,
    sort_order,
    is_active,
  });

  res.status(201).json({ success: true, data: { guest } });
}

/**
 * PUT /api/guests/admin/:id (Admin)
 * Update an existing guest
 */
export async function updateGuest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const guest = await guestService.updateGuest(id, req.body);
  res.json({ success: true, data: { guest } });
}

/**
 * DELETE /api/guests/admin/:id (Admin)
 * Delete a guest and their photo
 */
export async function deleteGuest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await guestService.deleteGuest(id);
  res.json({ success: true, message: 'Guest deleted' });
}

/**
 * POST /api/guests/admin/:id/photo (Admin)
 * Upload guest photo (base64 JSON body)
 */
export async function uploadGuestPhoto(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { photo, filename } = req.body;

  if (!photo) {
    res.status(400).json({
      success: false,
      error: { message: 'Photo is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  // Parse base64 data URL - support all common image formats
  const matches = photo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!matches) {
    logger.error('Photo upload failed: invalid data URL format', { id, photoPrefix: photo.substring(0, 50) });
    res.status(400).json({
      success: false,
      error: { message: 'Invalid photo format. Use JPEG, PNG, or WebP.', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  let mimeType = matches[1];
  const base64Data = matches[2];

  // Normalize common mime type variants
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

  const buffer = Buffer.from(base64Data, 'base64');

  // Validate size (2MB max)
  if (buffer.length > 2 * 1024 * 1024) {
    res.status(400).json({
      success: false,
      error: { message: 'Photo must be under 2MB', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  logger.info('Processing photo upload', { id, mimeType, bufferSize: buffer.length, filename: filename || 'photo.jpg' });
  const { publicUrl } = await guestService.uploadPhoto(id, buffer, mimeType, filename || 'photo.jpg');
  logger.info('Photo upload complete, returning URL', { id, publicUrl });
  res.json({ success: true, data: { photo_url: publicUrl } });
}

/**
 * DELETE /api/guests/admin/:id/photo (Admin)
 * Remove guest photo
 */
export async function deleteGuestPhoto(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  await guestService.deletePhoto(id);
  res.json({ success: true, message: 'Photo deleted' });
}

/**
 * POST /api/guests/admin/ai-enhance (Admin)
 * AI-enhance a guest field (shorten or expand)
 */
export async function aiEnhanceGuestText(req: Request, res: Response): Promise<void> {
  const { fieldType, fieldValue, action, context, lineTarget } = req.body;

  if (!fieldType || !fieldValue?.trim() || !action) {
    res.status(400).json({
      success: false,
      error: { message: 'fieldType, fieldValue, and action are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (!['title', 'bio', 'session_point'].includes(fieldType)) {
    res.status(400).json({
      success: false,
      error: { message: 'fieldType must be title, bio, or session_point', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (!['shorten', 'expand'].includes(action)) {
    res.status(400).json({
      success: false,
      error: { message: 'action must be shorten or expand', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const enhanced = await openAIService.enhanceGuestText(
    fieldType as 'title' | 'bio' | 'session_point',
    fieldValue.trim(),
    action as 'shorten' | 'expand',
    context || {},
    lineTarget ? Number(lineTarget) : undefined
  );

  logger.info('AI guest text enhanced', { fieldType, action, lineTarget });
  res.json({ success: true, data: { original: fieldValue.trim(), enhanced } });
}

/**
 * PUT /api/guests/admin/reorder (Admin)
 * Reorder guests
 */
export async function reorderGuests(req: Request, res: Response): Promise<void> {
  const { orderedIds } = req.body;

  if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'orderedIds array is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  await guestService.reorderGuests(orderedIds);
  res.json({ success: true, message: 'Guests reordered' });
}
