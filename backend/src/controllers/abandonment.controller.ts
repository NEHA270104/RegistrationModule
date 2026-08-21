import { Request, Response } from 'express';
import { abandonmentService } from '../services/abandonment.service.js';
import { registrationService } from '../services/registration.service.js';
import { seatService } from '../services/seat.service.js';
import { logger } from '../utils/logger.js';
import { createRazorpayOrder } from '../config/razorpay.js';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/supabase.js';
import { getPriceInRupees } from '../config/pricing.js';
import type { AbandonmentFilters, TrackAbandonmentRequest, UpdateFollowupRequest } from '../types/index.js';

/**
 * Track payment abandonment (public endpoint)
 * POST /api/track-abandonment
 */
export async function trackAbandonment(req: Request, res: Response): Promise<void> {
  try {
    const { razorpay_order_id, reason } = req.body as TrackAbandonmentRequest;

    if (!razorpay_order_id) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Razorpay order ID is required',
          code: 'MISSING_ORDER_ID',
        },
      });
      return;
    }

    // Look up the registration by Razorpay order ID
    const registration = await registrationService.getByRazorpayOrderId(razorpay_order_id);

    if (!registration) {
      logger.warn('Registration not found for abandonment tracking', { orderId: razorpay_order_id });
      res.status(200).json({ success: true, message: 'Tracked' });
      return;
    }

    // Only track if payment is still pending
    if (registration.payment_status !== 'pending') {
      logger.info('Registration already processed, skipping abandonment tracking', {
        orderId: razorpay_order_id,
        status: registration.payment_status,
      });
      res.status(200).json({ success: true, message: 'Already processed' });
      return;
    }

    // Record the abandonment
    await abandonmentService.recordAbandonment(
      {
        registration_id: registration.id,
        razorpay_order_id,
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        business_name: registration.business_name || undefined,
        tier: registration.tier,
        amount: registration.amount_paid,
        abandonment_type: 'cancelled',
        abandonment_reason: reason || 'User cancelled payment modal',
        utm_source: registration.utm_source || undefined,
        utm_campaign: registration.utm_campaign || undefined,
      },
      {
        ip_address: req.ip || undefined,
        user_agent: req.get('User-Agent') || undefined,
      }
    );

    res.status(200).json({ success: true, message: 'Abandonment recorded' });
  } catch (error) {
    logger.error('Error tracking abandonment', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Return success anyway to not block the frontend
    res.status(200).json({ success: true });
  }
}

/**
 * Get all abandonments with filters (admin)
 * GET /api/admin/abandonments
 */
export async function getAbandonments(req: Request, res: Response): Promise<void> {
  try {
    const filters: AbandonmentFilters = {
      abandonment_type: req.query.abandonment_type as AbandonmentFilters['abandonment_type'],
      followup_status: req.query.followup_status as AbandonmentFilters['followup_status'],
      tier: req.query.tier as AbandonmentFilters['tier'],
      search: req.query.search as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sort_by: (req.query.sort_by as string) || 'abandoned_at',
      sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc',
    };

    const result = await abandonmentService.getAll(filters);

    res.status(200).json({
      success: true,
      data: {
        abandonments: result.abandonments,
        pagination: {
          total: result.total,
          page: filters.page,
          limit: filters.limit,
          total_pages: Math.ceil(result.total / (filters.limit || 20)),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching abandonments', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch abandonments',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Get abandonment statistics (admin)
 * GET /api/admin/abandonments/stats
 */
export async function getAbandonmentStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await abandonmentService.getStats();
    const pending = await abandonmentService.getPendingRegistrations();

    // Calculate pending revenue
    const pendingRevenue = pending.registrations.reduce((sum, r) => sum + r.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        pending_payments: pending.total,
        pending_revenue: pendingRevenue,
        pending_revenue_formatted: formatCurrency(pendingRevenue),
        lost_revenue_formatted: formatCurrency(stats.total_lost_revenue),
      },
    });
  } catch (error) {
    logger.error('Error fetching abandonment stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch statistics',
        code: 'STATS_ERROR',
      },
    });
  }
}

/**
 * Get pending registrations (held seats awaiting payment)
 * GET /api/admin/abandonments/pending
 */
export async function getPendingRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const result = await abandonmentService.getPendingRegistrations();

    res.status(200).json({
      success: true,
      data: {
        registrations: result.registrations,
        total: result.total,
      },
    });
  } catch (error) {
    logger.error('Error fetching pending registrations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch pending registrations',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Release expired registrations and free up seats
 * POST /api/admin/abandonments/cleanup
 */
export async function cleanupExpiredRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const result = await abandonmentService.releaseExpiredRegistrations();

    res.status(200).json({
      success: true,
      data: {
        released: result.released,
        registrations: result.releasedRegistrations,
      },
      message: `Released ${result.released} expired registration(s)`,
    });
  } catch (error) {
    logger.error('Error cleaning up expired registrations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to cleanup expired registrations',
        code: 'CLEANUP_ERROR',
      },
    });
  }
}

/**
 * Get single abandonment details (admin)
 * GET /api/admin/abandonments/:id
 */
export async function getAbandonmentDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const abandonment = await abandonmentService.getById(id);

    if (!abandonment) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Abandonment not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: abandonment,
    });
  } catch (error) {
    logger.error('Error fetching abandonment details', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch abandonment details',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Delete abandonment (admin)
 * DELETE /api/admin/abandonments/:id
 */
export async function deleteAbandonment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const abandonment = await abandonmentService.getById(id);
    if (!abandonment) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Abandonment not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    await abandonmentService.delete(id);

    logger.info('Admin deleted abandonment', {
      id,
      email: abandonment.email,
      tier: abandonment.tier,
    });

    res.status(200).json({
      success: true,
      message: 'Abandonment deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting abandonment', {
      id: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete abandonment',
        code: 'DELETE_ERROR',
      },
    });
  }
}

/**
 * Update follow-up status (admin)
 * PATCH /api/admin/abandonments/:id/status
 */
export async function updateFollowupStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, notes, assigned_to } = req.body as UpdateFollowupRequest;

    if (!status) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Status is required',
          code: 'MISSING_STATUS',
        },
      });
      return;
    }

    const abandonment = await abandonmentService.updateFollowupStatus(id, status, notes, assigned_to);

    res.status(200).json({
      success: true,
      data: abandonment,
      message: 'Follow-up status updated',
    });
  } catch (error) {
    logger.error('Error updating followup status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update follow-up status',
        code: 'UPDATE_ERROR',
      },
    });
  }
}

/**
 * Generate recovery link (admin)
 * POST /api/admin/abandonments/:id/recovery-link
 */
export async function generateRecoveryLink(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const abandonment = await abandonmentService.getById(id);
    if (!abandonment) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Abandonment not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    const recovery = await abandonmentService.generateRecoveryLink(id);

    res.status(200).json({
      success: true,
      data: {
        token: recovery.token,
        link: recovery.link,
        qr_code_data_url: recovery.qrCodeDataUrl,
        expires_at: recovery.expiresAt,
      },
    });
  } catch (error) {
    logger.error('Error generating recovery link', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to generate recovery link',
        code: 'RECOVERY_LINK_ERROR',
      },
    });
  }
}

/**
 * Send follow-up email (admin)
 * POST /api/admin/abandonments/:id/send-email
 */
export async function sendFollowupEmail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const success = await abandonmentService.sendFollowupEmail(id);

    if (success) {
      res.status(200).json({
        success: true,
        message: 'Follow-up email sent successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send email',
          code: 'EMAIL_SEND_FAILED',
        },
      });
    }
  } catch (error) {
    logger.error('Error sending followup email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to send follow-up email',
        code: 'EMAIL_ERROR',
      },
    });
  }
}

/**
 * Export abandonments to CSV (admin)
 * GET /api/admin/abandonments/export
 */
export async function exportAbandonments(req: Request, res: Response): Promise<void> {
  try {
    const filters: AbandonmentFilters = {
      abandonment_type: req.query.abandonment_type as AbandonmentFilters['abandonment_type'],
      followup_status: req.query.followup_status as AbandonmentFilters['followup_status'],
      tier: req.query.tier as AbandonmentFilters['tier'],
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
    };

    const csv = await abandonmentService.exportToCsv(filters);

    const filename = `abandonments_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting abandonments', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to export abandonments',
        code: 'EXPORT_ERROR',
      },
    });
  }
}

/**
 * Validate recovery token (public endpoint)
 * GET /api/recover/:token
 */
export async function validateRecoveryToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;

    const abandonment = await abandonmentService.validateRecoveryToken(token);

    if (!abandonment) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Invalid or expired recovery link',
          code: 'INVALID_TOKEN',
        },
      });
      return;
    }

    // Return the user data for pre-filling the form
    res.status(200).json({
      success: true,
      data: {
        name: abandonment.name,
        email: abandonment.email,
        phone: abandonment.phone,
        business_name: abandonment.business_name,
        tier: abandonment.tier,
        amount: abandonment.amount,
        abandonment_id: abandonment.id,
      },
    });
  } catch (error) {
    logger.error('Error validating recovery token', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to validate recovery link',
        code: 'VALIDATION_ERROR',
      },
    });
  }
}

/**
 * Create order from recovery token (public endpoint)
 * POST /api/recover/:token/order
 *
 * Reuses the existing pending/failed registration instead of creating a new one.
 * This prevents duplicate entries in the registrations table.
 */
export async function createRecoveryOrder(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;

    const abandonment = await abandonmentService.validateRecoveryToken(token);

    if (!abandonment) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Invalid or expired recovery link',
          code: 'INVALID_TOKEN',
        },
      });
      return;
    }

    // Find the existing registration from the abandonment
    let registration = null;
    if (abandonment.registration_id) {
      registration = await registrationService.getById(abandonment.registration_id);
    }
    // Fallback: look up by the original Razorpay order ID
    if (!registration && abandonment.razorpay_order_id) {
      registration = await registrationService.getByRazorpayOrderId(abandonment.razorpay_order_id);
    }

    if (!registration) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Original registration not found. Please register fresh.',
          code: 'REGISTRATION_NOT_FOUND',
        },
      });
      return;
    }

    // If already confirmed, don't allow re-payment
    if (registration.payment_status === 'confirmed') {
      res.status(400).json({
        success: false,
        error: {
          message: 'This registration is already confirmed.',
          code: 'ALREADY_CONFIRMED',
        },
      });
      return;
    }

    // If the seat was released (failed/cancelled), re-reserve it
    const needsSeatReservation = registration.payment_status === 'failed' ||
                                  registration.registration_status === 'cancelled';

    if (needsSeatReservation) {
      const reserveResult = await seatService.reserveSeat(registration.tier);
      if (!reserveResult.success) {
        res.status(400).json({
          success: false,
          error: {
            message: reserveResult.error || 'No seats available for this tier. Please register fresh.',
            code: 'TIER_SOLD_OUT',
          },
        });
        return;
      }
    }

    // Get current tier price
    const amount = getPriceInRupees(registration.tier);

    // Create a new Razorpay order
    const receiptId = `rcpt_rec_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const razorpayOrder = await createRazorpayOrder(amount, receiptId, {
      tier: registration.tier,
      email: registration.email,
      phone: registration.phone,
    });

    // Update the existing registration with the new order ID and reset to pending
    await registrationService.updateForRecovery(registration.id, razorpayOrder.id);

    // Create a pending order record for the new order
    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await supabase.from('pending_orders').insert({
        razorpay_order_id: razorpayOrder.id,
        tier: registration.tier,
        amount: amount,
        email: registration.email,
        phone: registration.phone,
        name: registration.name,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        metadata: {
          recovery: true,
          abandonment_id: abandonment.id,
          business_name: registration.business_name,
        },
      });
    } catch (err) {
      logger.error('Error creating pending order for recovery', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    logger.info('Recovery order created (reusing existing registration)', {
      abandonmentId: abandonment.id,
      registrationId: registration.id,
      oldOrderId: registration.razorpay_order_id,
      newOrderId: razorpayOrder.id,
      email: abandonment.email,
    });

    res.status(200).json({
      success: true,
      order_id: razorpayOrder.id,
      amount: amount,
      currency: 'INR',
      key_id: config.razorpay.keyId,
      prefill: {
        name: registration.name,
        email: registration.email,
        contact: registration.phone,
      },
      notes: {
        tier: registration.tier,
        registration_id: registration.id,
        recovery_token: token,
        abandonment_id: abandonment.id,
      },
    });
  } catch (error) {
    logger.error('Error creating recovery order', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create order',
        code: 'ORDER_ERROR',
      },
    });
  }
}

/**
 * Delete all abandonments (admin)
 * DELETE /api/admin/abandonments
 */
export async function deleteAllAbandonments(req: Request, res: Response): Promise<void> {
  try {
    const { count, error: countError } = await supabase
      .from('payment_abandonments')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      res.status(500).json({
        success: false,
        error: { message: 'Failed to count abandonments', code: 'FETCH_ERROR' },
      });
      return;
    }

    const total = count || 0;

    if (total === 0) {
      res.status(200).json({ success: true, message: 'No abandonments to delete', deleted: 0 });
      return;
    }

    const { error: deleteError } = await supabase
      .from('payment_abandonments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      logger.error('Error deleting all abandonments', { error: deleteError.message });
      res.status(500).json({
        success: false,
        error: { message: 'Failed to delete abandonments', code: 'DELETE_ERROR' },
      });
      return;
    }

    logger.info('Admin deleted all abandonments', { count: total });

    res.status(200).json({
      success: true,
      message: `Deleted ${total} abandonment(s)`,
      deleted: total,
    });
  } catch (error) {
    logger.error('Error deleting all abandonments', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete all abandonments', code: 'DELETE_ALL_ERROR' },
    });
  }
}

/**
 * Format currency in INR
 * Note: Database stores amounts in RUPEES (INR) directly
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
}
