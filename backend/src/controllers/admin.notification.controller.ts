import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { AIService } from '../services/ai.service.js';
import { logger } from '../utils/logger.js';

const aiService = new AIService();

/**
 * Broadcast a notification to all tenants (global) or a specific target tenant
 * POST /api/admin/notifications
 */
export async function broadcastNotification(req: Request, res: Response): Promise<void> {
  try {
    const { title, message, target_tenant_id } = req.body;

    if (!title || !message) {
      res.status(400).json({
        success: false,
        error: { message: 'Title and message are required' }
      });
      return;
    }

    let tenantId: string | null = null;
    if (target_tenant_id) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target_tenant_id);
      if (!isUuid) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid target_tenant_id UUID format' }
        });
        return;
      }
      tenantId = target_tenant_id;
    }

    const { data, error } = await supabase
      .from('platform_notifications')
      .insert({
        title,
        message,
        tenant_id: tenantId,
        is_read: false
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create admin notification:', error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to save notification: ' + error.message }
      });
      return;
    }

    // Log admin activity
    const actorEmail = (req as any).userEmail || 'admin@eventregplatform.com';
    try {
      await supabase
        .from('admin_activity_log')
        .insert({
          action: 'Create Notification',
          tenant_id: tenantId || undefined,
          actor_email: actorEmail
        });
    } catch (logErr: any) {
      logger.warn('Failed to insert admin activity log for notification:', logErr.message);
    }

    res.status(201).json({
      success: true,
      data
    });
  } catch (error: any) {
    logger.error('Unexpected error in broadcastNotification:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while creating notification' }
    });
  }
}

/**
 * Generate a professional title and message using AI Composition Assistant
 * POST /api/admin/ai/compose-notification
 */
export async function composeNotification(req: Request, res: Response): Promise<void> {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: { message: 'Prompt is required' }
      });
      return;
    }

    const draft = await aiService.composeNotification(prompt);

    res.status(200).json({
      success: true,
      data: draft
    });
  } catch (error: any) {
    logger.error('Error in composeNotification controller:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { message: error.message || 'Failed to compose notification using AI' }
    });
  }
}
