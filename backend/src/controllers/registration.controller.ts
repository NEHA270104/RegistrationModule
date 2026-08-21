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
 * Check registration status by email and/or phone
 * POST /api/registration/check
 */
export async function checkRegistration(req: Request, res: Response): Promise<void> {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Email or phone is required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const duplicates: { field: string; message: string; code: string }[] = [];

    // Check email if provided
    if (email) {
      const isEmailRegistered = await registrationService.isEmailRegistered(email);
      if (isEmailRegistered) {
        duplicates.push({
          field: 'email',
          message: 'This email address is already registered for the summit.',
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }
    }

    // Check phone if provided
    if (phone) {
      const isPhoneRegistered = await registrationService.isPhoneRegistered(phone);
      if (isPhoneRegistered) {
        duplicates.push({
          field: 'phone',
          message: 'This phone number is already registered for the summit.',
          code: 'PHONE_ALREADY_REGISTERED',
        });
      }
    }

    if (duplicates.length > 0) {
      res.status(200).json({
        success: true,
        data: {
          is_duplicate: true,
          duplicates: duplicates,
          message: duplicates[0].message,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        is_duplicate: false,
        message: 'No duplicates found',
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
 * Check for pending registrations by email
 * POST /api/registration/pending
 * Returns pending registration data so user can continue payment
 */
export async function checkPendingRegistration(req: Request, res: Response): Promise<void> {
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

    // Get all registrations for this email
    const registrations = await registrationService.getByEmail(email);

    // Find any pending registration
    const pendingRegistration = registrations.find((r) => r.payment_status === 'pending');

    if (!pendingRegistration) {
      res.status(200).json({
        success: true,
        data: {
          has_pending: false,
        },
      });
      return;
    }

    // Calculate time remaining (1 hour hold)
    const createdAt = new Date(pendingRegistration.created_at);
    const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000); // 1 hour
    const now = new Date();
    const timeRemainingMs = expiresAt.getTime() - now.getTime();
    const isExpired = timeRemainingMs <= 0;
    const timeRemainingMinutes = Math.max(0, Math.floor(timeRemainingMs / 60000));

    res.status(200).json({
      success: true,
      data: {
        has_pending: true,
        is_expired: isExpired,
        time_remaining_minutes: timeRemainingMinutes,
        registration: {
          name: pendingRegistration.name,
          email: pendingRegistration.email,
          phone: pendingRegistration.phone,
          business_name: pendingRegistration.business_name,
          industry: pendingRegistration.industry,
          tier: pendingRegistration.tier,
          amount: pendingRegistration.amount_paid,
          created_at: pendingRegistration.created_at,
          razorpay_order_id: pendingRegistration.razorpay_order_id,
        },
        message: isExpired
          ? 'Your previous payment session has expired. Please start a new registration.'
          : `Your seat is being held! You have ${timeRemainingMinutes} minutes to complete your payment.`,
      },
    });
  } catch (error) {
    logger.error('Error checking pending registration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to check pending registration',
        code: 'CHECK_ERROR',
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
