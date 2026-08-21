import { Request, Response } from 'express';
import { registrationService } from '../services/registration.service.js';
import { seatService } from '../services/seat.service.js';
import { waitlistService } from '../services/waitlist.service.js';
import { emailService } from '../services/email.service.js';
import { abandonmentService } from '../services/abandonment.service.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';
import type { AdminRegistrationFilters, TierType } from '../types/index.js';
import { AppError } from '../types/index.js';
import { authService } from '../services/auth.service.js';

/**
 * Get admin dashboard statistics
 * GET /api/admin/stats
 */
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await registrationService.getStats();
    const waitlistCount = await waitlistService.getCount();

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        waitlist_count: waitlistCount,
        revenue_formatted: formatCurrency(stats.totalRevenue),
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats', {
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
 * Get all registrations with filters
 * GET /api/admin/registrations
 */
export async function getAllRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const filters: AdminRegistrationFilters = {
      tier: req.query.tier as AdminRegistrationFilters['tier'],
      payment_status: req.query.payment_status as AdminRegistrationFilters['payment_status'],
      search: req.query.search as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      sort_by: (req.query.sort_by as string) || 'created_at',
      sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc',
    };

    const result = await registrationService.getAll(filters);

    res.status(200).json({
      success: true,
      data: {
        registrations: result.registrations,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          total_pages: Math.ceil(result.total / result.limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching registrations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch registrations',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Get single registration details (admin - full details)
 * GET /api/admin/registrations/:bookingId
 */
export async function getRegistrationDetails(req: Request, res: Response): Promise<void> {
  try {
    const { bookingId } = req.params;

    const registration = await registrationService.getByBookingId(bookingId);

    if (!registration) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Registration not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    // Return full details for admin
    res.status(200).json({
      success: true,
      data: registration,
    });
  } catch (error) {
    logger.error('Error fetching registration details', {
      bookingId: req.params.bookingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch registration',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Export registrations as CSV
 * GET /api/admin/export
 */
export async function exportRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const filters: AdminRegistrationFilters = {
      tier: req.query.tier as AdminRegistrationFilters['tier'],
      payment_status: req.query.payment_status as AdminRegistrationFilters['payment_status'],
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
    };

    const csvContent = await registrationService.exportAsCSV(filters);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `registrations_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);

    logger.info('Registration data exported', {
      filename,
      filters,
    });
  } catch (error) {
    logger.error('Error exporting registrations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to export registrations',
        code: 'EXPORT_ERROR',
      },
    });
  }
}

/**
 * Get all waitlist entries
 * GET /api/admin/waitlist
 */
export async function getWaitlistEntries(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await waitlistService.getAll(page, limit);

    res.status(200).json({
      success: true,
      data: {
        entries: result.entries,
        pagination: {
          total: result.total,
          page,
          limit,
          total_pages: Math.ceil(result.total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching waitlist entries', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch waitlist',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Get seat inventory status
 * GET /api/admin/seats
 */
export async function getSeatInventory(req: Request, res: Response): Promise<void> {
  try {
    const availability = await seatService.getSeatsAvailability();

    res.status(200).json({
      success: true,
      data: {
        seats: availability.seats,
        summary: {
          total_available: availability.totalAvailable,
          all_sold_out: availability.allSoldOut,
          waitlist_mode: availability.waitlistMode,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching seat inventory', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch seat inventory',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Manual seat adjustment (admin override)
 * POST /api/admin/seats/adjust
 */
export async function adjustSeats(req: Request, res: Response): Promise<void> {
  try {
    const { tier, adjustment, reason } = req.body;

    if (!tier || adjustment === undefined || !reason) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Tier, adjustment, and reason are required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    // This would require a direct database update
    // For safety, this is logged and should be implemented with caution
    logger.warn('Manual seat adjustment requested', {
      tier,
      adjustment,
      reason,
      admin: req.headers['x-api-key']?.toString().slice(0, 8),
    });

    res.status(501).json({
      success: false,
      error: {
        message: 'Manual seat adjustment not implemented for safety. Use database directly.',
        code: 'NOT_IMPLEMENTED',
      },
    });
  } catch (error) {
    logger.error('Error adjusting seats', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to adjust seats',
        code: 'ADJUST_ERROR',
      },
    });
  }
}

/**
 * Resend confirmation to a registration
 * POST /api/admin/registrations/:bookingId/resend
 */
export async function resendConfirmation(req: Request, res: Response): Promise<void> {
  try {
    const { bookingId } = req.params;
    const { type } = req.body; // 'email' or 'whatsapp'

    const registration = await registrationService.getByBookingId(bookingId);

    if (!registration) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Registration not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    if (registration.payment_status !== 'confirmed') {
      res.status(400).json({
        success: false,
        error: {
          message: 'Can only resend for confirmed registrations',
          code: 'NOT_CONFIRMED',
        },
      });
      return;
    }

    if (type === 'email' || !type) {
      const { emailService } = await import('../services/email.service.js');
      const { config } = await import('../config/index.js');
      const tierInventory = await seatService.getTierAvailability(registration.tier);

      await emailService.sendConfirmationEmail({
        to: registration.email,
        name: registration.name,
        booking_id: registration.booking_id,
        tier: registration.tier,
        tier_display: tierInventory?.display_name || registration.tier,
        amount: registration.amount_paid,
        benefits: tierInventory?.benefits || [],
      });

      logger.info('Admin resent confirmation email', {
        bookingId,
        email: registration.email,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Confirmation sent successfully',
    });
  } catch (error) {
    logger.error('Error resending confirmation', {
      bookingId: req.params.bookingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to resend confirmation',
        code: 'RESEND_ERROR',
      },
    });
  }
}

/**
 * Delete a registration
 * DELETE /api/admin/registrations/:bookingId
 */
export async function deleteRegistration(req: Request, res: Response): Promise<void> {
  try {
    const { bookingId } = req.params;

    const registration = await registrationService.getByBookingId(bookingId);

    if (!registration) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Registration not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    // If payment was confirmed, release the seat
    if (registration.payment_status === 'confirmed') {
      await seatService.releaseSoldSeat(registration.tier);
    } else if (registration.payment_status === 'pending') {
      await seatService.releaseHeldSeat(registration.tier);
    }

    // Clean up pending_orders if razorpay_order_id exists
    if (registration.razorpay_order_id) {
      try {
        const { supabase } = await import('../config/supabase.js');
        await supabase
          .from('pending_orders')
          .delete()
          .eq('razorpay_order_id', registration.razorpay_order_id);
        logger.info('Cleaned up pending_order', { orderId: registration.razorpay_order_id });
      } catch (cleanupError) {
        logger.warn('Failed to cleanup pending_order', {
          orderId: registration.razorpay_order_id,
          error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
        });
      }
    }

    // Delete the registration
    await registrationService.deleteRegistration(bookingId);

    logger.info('Admin deleted registration', {
      bookingId,
      tier: registration.tier,
      admin: req.headers['x-api-key']?.toString().slice(0, 8),
    });

    res.status(200).json({
      success: true,
      message: 'Registration deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting registration', {
      bookingId: req.params.bookingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete registration',
        code: 'DELETE_ERROR',
      },
    });
  }
}

/**
 * Create a manual registration (admin bypass)
 * POST /api/admin/registrations
 */
export async function createManualRegistration(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, business_name, industry, tier, amount_paid, payment_status } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !tier) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Name, email, phone, and tier are required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    // Create the registration
    // Note: Database stores amounts in RUPEES (INR) directly
    const registration = await registrationService.createManualRegistration({
      name,
      email: email.toLowerCase(),
      phone,
      business_name,
      industry,
      tier,
      amount_paid: amount_paid || 0,
      payment_status: payment_status || 'confirmed',
    });

    // Update seat count if confirmed
    if (payment_status === 'confirmed' || !payment_status) {
      await seatService.incrementSoldSeat(tier);
    }

    logger.info('Admin created manual registration', {
      bookingId: registration.booking_id,
      tier,
      admin: req.headers['x-api-key']?.toString().slice(0, 8),
    });

    res.status(201).json({
      success: true,
      data: registration,
      message: 'Registration created successfully',
    });
  } catch (error) {
    logger.error('Error creating manual registration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create registration',
        code: 'CREATE_ERROR',
      },
    });
  }
}

/**
 * Resync seat counts from registrations table
 * POST /api/admin/seats/resync
 * This fixes any discrepancy between seat_inventory and registrations tables
 */
export async function resyncSeatCounts(req: Request, res: Response): Promise<void> {
  try {
    const result = await seatService.resyncFromRegistrations();

    logger.info('Admin resynced seat counts', {
      admin: req.headers['x-api-key']?.toString().slice(0, 8),
      changes: result.changes,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: result.changes.length > 0
        ? `Resynced ${result.changes.length} tier(s) successfully`
        : 'Seat counts are already in sync',
    });
  } catch (error) {
    logger.error('Error resyncing seat counts', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to resync seat counts',
        code: 'RESYNC_ERROR',
      },
    });
  }
}

/**
 * Send payment reminder email
 * POST /api/admin/registrations/:registrationId/remind
 */
export async function sendPaymentReminder(req: Request, res: Response): Promise<void> {
  try {
    const { registrationId } = req.params;
    const { email, name, tier } = req.body;

    if (!email || !name || !tier) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Email, name, and tier are required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    // Get registration to find order ID
    const registration = await registrationService.getById(registrationId);
    if (!registration) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Registration not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    const orderId = registration.razorpay_order_id || registrationId;

    // Find or create abandonment record to get recovery link
    let abandonment = registration.razorpay_order_id
      ? await abandonmentService.getByOrderId(registration.razorpay_order_id)
      : null;

    if (!abandonment) {
      // Create abandonment record for this pending registration
      abandonment = await abandonmentService.recordAbandonment(
        {
          registration_id: registrationId,
          razorpay_order_id: registration.razorpay_order_id || undefined,
          name: registration.name,
          email: registration.email,
          phone: registration.phone,
          business_name: registration.business_name || undefined,
          tier: registration.tier as TierType,
          amount: registration.amount_paid,
          abandonment_type: 'cancelled',
          abandonment_reason: 'Admin-triggered payment reminder',
        },
        {}
      );
    }

    // Generate recovery link
    const recovery = await abandonmentService.generateRecoveryLink(abandonment.id);

    // Send reminder with recovery link
    const success = await emailService.sendPaymentReminder(
      email,
      name,
      orderId,
      tier as TierType,
      recovery.link,
      registration.amount_paid
    );

    if (success) {
      logger.info('Admin sent payment reminder', {
        registrationId,
        email,
        tier,
        recoveryLink: recovery.link,
        admin: req.headers['x-api-key']?.toString().slice(0, 8),
      });

      res.status(200).json({
        success: true,
        message: 'Payment reminder sent successfully',
        data: {
          recovery_link: recovery.link,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send reminder. Email service may not be configured.',
          code: 'EMAIL_SEND_ERROR',
        },
      });
    }
  } catch (error) {
    logger.error('Error sending payment reminder', {
      registrationId: req.params.registrationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to send payment reminder',
        code: 'REMINDER_ERROR',
      },
    });
  }
}

/**
 * Delete all registrations
 * DELETE /api/admin/registrations
 */
export async function deleteAllRegistrations(req: Request, res: Response): Promise<void> {
  try {
    // Get all registrations to release seats properly
    const { data: allRegs, error: fetchError } = await supabase
      .from('registrations')
      .select('id, tier, payment_status, razorpay_order_id');

    if (fetchError) {
      throw new AppError('Failed to fetch registrations', 500, 'FETCH_ERROR');
    }

    const count = allRegs?.length || 0;

    if (count === 0) {
      res.status(200).json({ success: true, message: 'No registrations to delete', deleted: 0 });
      return;
    }

    // Release seats for each registration
    for (const reg of allRegs || []) {
      try {
        if (reg.payment_status === 'confirmed') {
          await seatService.releaseSoldSeat(reg.tier);
        } else if (reg.payment_status === 'pending') {
          await seatService.releaseHeldSeat(reg.tier);
        }
      } catch (err) {
        logger.warn('Failed to release seat during bulk delete', { id: reg.id, tier: reg.tier });
      }
    }

    // Delete all pending_orders
    await supabase.from('pending_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Delete all registrations
    const { error: deleteError } = await supabase
      .from('registrations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      throw new AppError('Failed to delete registrations', 500, 'DELETE_ERROR');
    }

    logger.info('Admin deleted all registrations', { count });

    res.status(200).json({
      success: true,
      message: `Deleted ${count} registration(s)`,
      deleted: count,
    });
  } catch (error) {
    logger.error('Error deleting all registrations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, error: { message: error.message, code: error.code } });
      return;
    }

    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete all registrations', code: 'DELETE_ALL_ERROR' },
    });
  }
}

/**
 * Format currency for display
 * Note: Database stores amounts in RUPEES (INR) directly
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Super Admin Login
 * POST /api/admin/login
 */
export async function adminLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Email and password are required',
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  try {
    const result = await authService.loginAdmin({ email, password });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'SERVER_ERROR',
      },
    });
  }
}

