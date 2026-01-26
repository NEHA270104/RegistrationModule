import { Request, Response } from 'express';
import { registrationService } from '../services/registration.service.js';
import { seatService } from '../services/seat.service.js';
import { waitlistService } from '../services/waitlist.service.js';
import { logger } from '../utils/logger.js';
import type { AdminRegistrationFilters } from '../types/index.js';
import { AppError } from '../types/index.js';

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
        event_date: config.event.date,
        event_time: config.event.time,
        venue: config.event.venue,
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
 * Format currency for display
 */
function formatCurrency(amountInPaise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amountInPaise / 100);
}
