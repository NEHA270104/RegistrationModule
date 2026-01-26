import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { SeatInventory, SeatAvailability, TierType } from '../types/index.js';
import { AppError } from '../types/index.js';

export class SeatService {
  /**
   * Get all seat availability information
   */
  async getSeatsAvailability(): Promise<{
    seats: SeatAvailability[];
    allSoldOut: boolean;
    totalAvailable: number;
    waitlistMode: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('seat_inventory')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('Error fetching seat inventory', { error: error.message });
        throw new AppError('Failed to fetch seat availability', 500, 'SEAT_FETCH_ERROR');
      }

      const seats: SeatAvailability[] = (data as SeatInventory[])
        .filter((seat) => seat.tier_name !== 'waitlist')
        .map((seat) => ({
          tier_name: seat.tier_name,
          display_name: seat.display_name,
          total_seats: seat.total_seats,
          available_seats: seat.total_seats - seat.sold_seats - seat.held_seats,
          price_inr: seat.price_inr,
          price_display: this.formatPrice(seat.price_inr),
          is_active: seat.is_active,
          is_sold_out: seat.sold_seats + seat.held_seats >= seat.total_seats,
          benefits: seat.benefits || [],
        }));

      const totalAvailable = seats.reduce((sum, seat) => sum + seat.available_seats, 0);
      const allSoldOut = totalAvailable === 0;

      return {
        seats,
        allSoldOut,
        totalAvailable,
        waitlistMode: allSoldOut,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getSeatsAvailability', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get specific tier availability
   */
  async getTierAvailability(tier: TierType): Promise<SeatInventory | null> {
    try {
      const { data, error } = await supabase
        .from('seat_inventory')
        .select('*')
        .eq('tier_name', tier)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        logger.error('Error fetching tier availability', { tier, error: error.message });
        throw new AppError('Failed to fetch tier availability', 500, 'TIER_FETCH_ERROR');
      }

      return data as SeatInventory;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Reserve a seat atomically (prevents race conditions)
   */
  async reserveSeat(tier: TierType): Promise<{ success: boolean; available: number; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('reserve_seat', {
        p_tier: tier,
      });

      if (error) {
        logger.error('Error reserving seat', { tier, error: error.message });
        throw new AppError('Failed to reserve seat', 500, 'RESERVE_ERROR');
      }

      const result = data as { success: boolean; available?: number; error?: string };

      if (!result.success) {
        logger.warn('Seat reservation failed', { tier, reason: result.error });
        return {
          success: false,
          available: result.available || 0,
          error: result.error,
        };
      }

      logger.info('Seat reserved successfully', { tier, available: result.available });
      return {
        success: true,
        available: result.available || 0,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in reserveSeat', {
        tier,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Confirm a seat (move from held to sold)
   */
  async confirmSeat(tier: TierType): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('confirm_seat', {
        p_tier: tier,
      });

      if (error) {
        logger.error('Error confirming seat', { tier, error: error.message });
        throw new AppError('Failed to confirm seat', 500, 'CONFIRM_ERROR');
      }

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        logger.warn('Seat confirmation failed', { tier, reason: result.error });
        return false;
      }

      logger.info('Seat confirmed successfully', { tier });
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in confirmSeat', {
        tier,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Release a held seat (on payment timeout/failure)
   */
  async releaseHeldSeat(tier: TierType): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('release_held_seat', {
        p_tier: tier,
      });

      if (error) {
        logger.error('Error releasing held seat', { tier, error: error.message });
        return false;
      }

      const result = data as { success: boolean };
      logger.info('Held seat released', { tier, success: result.success });
      return result.success;
    } catch (error) {
      logger.error('Unexpected error in releaseHeldSeat', {
        tier,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Check if all seats are sold out
   */
  async checkAllSeatsSold(): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('check_all_seats_sold');

      if (error) {
        logger.error('Error checking seat status', { error: error.message });
        return false;
      }

      return data as boolean;
    } catch (error) {
      logger.error('Unexpected error in checkAllSeatsSold', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get tier price
   */
  async getTierPrice(tier: TierType): Promise<number> {
    const inventory = await this.getTierAvailability(tier);
    if (!inventory) {
      throw new AppError(`Tier ${tier} not found`, 404, 'TIER_NOT_FOUND');
    }
    return inventory.price_inr;
  }

  /**
   * Format price for display
   */
  private formatPrice(priceInPaise: number): string {
    const priceInRupees = priceInPaise / 100;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(priceInRupees);
  }
}

export const seatService = new SeatService();
