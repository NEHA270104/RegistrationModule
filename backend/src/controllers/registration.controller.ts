import { Request, Response } from 'express';
import { registrationService } from '../services/registration.service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

/**
 * Get registration by booking ID
 * GET /api/registration/:bookingId
 */
export async function getRegistration(req: Request, res: Response): Promise<void> {
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

    // Return limited data for public endpoint
    res.status(200).json({
      success: true,
      data: {
        booking_id: registration.booking_id,
        name: registration.name,
        email: maskEmail(registration.email),
        tier: registration.tier,
        amount_paid: registration.amount_paid,
        payment_status: registration.payment_status,
        registration_status: registration.registration_status,
        created_at: registration.created_at,
        payment_confirmed_at: registration.payment_confirmed_at,
      },
    });
  } catch (error) {
    logger.error('Error in getRegistration controller', {
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
 * Check registration status by email
 * POST /api/registration/check
 */
export async function checkRegistration(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Email is required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const registrations = await registrationService.getByEmail(email);
    const confirmedReg = registrations.find((r) => r.payment_status === 'confirmed');

    if (confirmedReg) {
      res.status(200).json({
        success: true,
        data: {
          is_registered: true,
          booking_id: confirmedReg.booking_id,
          tier: confirmedReg.tier,
          message: 'You are already registered for this event',
        },
      });
      return;
    }

    const pendingReg = registrations.find((r) => r.payment_status === 'pending');
    if (pendingReg) {
      res.status(200).json({
        success: true,
        data: {
          is_registered: false,
          has_pending_payment: true,
          order_id: pendingReg.razorpay_order_id,
          message: 'You have a pending payment',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        is_registered: false,
        has_pending_payment: false,
        message: 'Email not found in registrations',
      },
    });
  } catch (error) {
    logger.error('Error in checkRegistration controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to check registration',
        code: 'CHECK_ERROR',
      },
    });
  }
}

/**
 * Resend confirmation email
 * POST /api/registration/:bookingId/resend-email
 */
export async function resendConfirmationEmail(req: Request, res: Response): Promise<void> {
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

    if (registration.payment_status !== 'confirmed') {
      res.status(400).json({
        success: false,
        error: {
          message: 'Payment not confirmed',
          code: 'PAYMENT_NOT_CONFIRMED',
        },
      });
      return;
    }

    // Import and send email
    const { emailService } = await import('../services/email.service.js');
    const { seatService } = await import('../services/seat.service.js');
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

    res.status(200).json({
      success: true,
      message: 'Confirmation email sent successfully',
    });
  } catch (error) {
    logger.error('Error resending confirmation email', {
      bookingId: req.params.bookingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to resend email',
        code: 'EMAIL_ERROR',
      },
    });
  }
}

/**
 * Mask email for privacy
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}***@${domain}`;
}
