import { Request, Response } from 'express';
import { seatService } from '../services/seat.service.js';
import { logger } from '../utils/logger.js';
import type { SeatsResponse } from '../types/index.js';

/**
 * Get current seat availability
 * GET /api/seats
 */
export async function getSeats(req: Request, res: Response): Promise<void> {
  try {
    const result = await seatService.getSeatsAvailability();

    const response: SeatsResponse = {
      success: true,
      seats: result.seats,
      all_sold_out: result.allSoldOut,
      total_available: result.totalAvailable,
      waitlist_mode: result.waitlistMode,
    };

    // Add cache headers for public caching (short duration)
    res.set('Cache-Control', 'public, max-age=5');

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in getSeats controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch seat availability',
        code: 'FETCH_ERROR',
      },
    });
  }
}

/**
 * Get specific tier availability
 * GET /api/seats/:tier
 */
export async function getTierAvailability(req: Request, res: Response): Promise<void> {
  try {
    const { tier } = req.params;
    const validTiers = ['vip', 'standard', 'basic', 'waitlist'];

    if (!validTiers.includes(tier)) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid tier specified',
          code: 'INVALID_TIER',
        },
      });
      return;
    }

    const inventory = await seatService.getTierAvailability(tier as 'vip' | 'standard' | 'basic' | 'waitlist');

    if (!inventory) {
      res.status(404).json({
        success: false,
        error: {
          message: 'Tier not found',
          code: 'NOT_FOUND',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        tier_name: inventory.tier_name,
        display_name: inventory.display_name,
        total_seats: inventory.total_seats,
        available_seats: inventory.total_seats - inventory.sold_seats - inventory.held_seats,
        sold_seats: inventory.sold_seats,
        price_inr: inventory.price_inr,
        is_active: inventory.is_active,
        is_sold_out: inventory.sold_seats + inventory.held_seats >= inventory.total_seats,
        benefits: inventory.benefits,
      },
    });
  } catch (error) {
    logger.error('Error in getTierAvailability controller', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tier: req.params.tier,
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch tier availability',
        code: 'FETCH_ERROR',
      },
    });
  }
}
