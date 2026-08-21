import { Request, Response } from 'express';
import { waitlistService } from '../services/waitlist.service.js';
import { logger } from '../utils/logger.js';
import type { WaitlistRequest } from '../types/index.js';
import { AppError } from '../types/index.js';

/**
 * Add user to waitlist
 * POST /api/waitlist
 */
export async function joinWaitlist(req: Request, res: Response): Promise<void> {
  try {
    const waitlistData: WaitlistRequest = req.body;

    const metadata = {
      ip_address: req.ip || req.socket.remoteAddress,
      utm_source: req.body.utm_source || req.query.utm_source as string,
    };

    const result = await waitlistService.addToWaitlist(waitlistData, metadata);

    res.status(200).json(result);
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

    logger.error('Error in joinWaitlist controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to join waitlist',
        code: 'WAITLIST_ERROR',
      },
    });
  }
}

/**
 * Check waitlist status by email
 * GET /api/waitlist/status
 */
export async function getWaitlistStatus(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          message: 'Email is required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const entry = await waitlistService.getByEmail(email);

    if (!entry) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Email not found on waitlist',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        position: entry.position,
        preferred_tier: entry.preferred_tier,
        has_livestream_access: entry.has_livestream_access,
        is_notified: entry.is_notified,
        joined_at: entry.created_at,
      },
    });
  } catch (error) {
    logger.error('Error in getWaitlistStatus controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch waitlist status',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Get waitlist count
 * GET /api/waitlist/count
 */
export async function getWaitlistCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await waitlistService.getCount();

    res.status(200).json({
      success: true,
      data: {
        count,
      },
    });
  } catch (error) {
    logger.error('Error in getWaitlistCount controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch waitlist count',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Verify waitlist livestream payment
 * POST /api/waitlist/verify-livestream
 */
export async function verifyLivestreamPayment(req: Request, res: Response): Promise<void> {
  try {
    const { email, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!email || !razorpay_payment_id) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Email and payment ID are required',
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    // Verify payment signature
    const { verifyPaymentSignature } = await import('../config/razorpay.js');
    const isValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid payment signature',
          code: 'INVALID_SIGNATURE',
        },
      });
      return;
    }

    const result = await waitlistService.confirmLivestreamPayment(email, razorpay_payment_id);

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.error('Error verifying livestream payment', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to verify payment',
        code: 'VERIFY_ERROR',
      },
    });
  }
}
