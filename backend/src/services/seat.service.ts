import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { SeatInventory, SeatAvailability, TierType } from '../types/index.js';
import { AppError } from '../types/index.js';

// Import dynamically to avoid circular dependency
let abandonmentService: { releaseOldestHeldSeat: (tier: TierType) => Promise<{ success: boolean }> } | null = null;
const getAbandonmentService = async () => {
  if (!abandonmentService) {
    const module = await import('./abandonment.service.js');
    abandonmentService = module.abandonmentService;
  }
  return abandonmentService;
};

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
          sold_seats: seat.sold_seats,
          held_seats: seat.held_seats,
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
   * If all seats are held (not sold), tries to release the oldest held seat (FIFO)
   */
  async reserveSeat(tier: TierType): Promise<{ success: boolean; available: number; error?: string; fifoReleased?: boolean }> {
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
        // Check if we can release an old held seat (FIFO)
        const inventory = await this.getTierAvailability(tier);
        if (inventory && inventory.held_seats > 0) {
          logger.info('Attempting FIFO release for new booking', { tier, heldSeats: inventory.held_seats });

          try {
            const abandonment = await getAbandonmentService();
            const releaseResult = await abandonment.releaseOldestHeldSeat(tier);

            if (releaseResult.success) {
              // Try reserving again after FIFO release
              const retryResult = await supabase.rpc('reserve_seat', { p_tier: tier });
              if (!retryResult.error) {
                const retryData = retryResult.data as { success: boolean; available?: number };
                if (retryData.success) {
                  logger.info('Seat reserved after FIFO release', { tier });
                  return {
                    success: true,
                    available: retryData.available || 0,
                    fifoReleased: true,
                  };
                }
              }
            }
          } catch (fifoError) {
            logger.error('FIFO release failed', {
              tier,
              error: fifoError instanceof Error ? fifoError.message : 'Unknown error',
            });
          }
        }

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
   * Release a sold seat (for admin delete)
   */
  async releaseSoldSeat(tier: TierType): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('seat_inventory')
        .update({ sold_seats: supabase.rpc('decrement_sold_seats') })
        .eq('tier_name', tier);

      // Direct update as fallback
      const { data: inventory } = await supabase
        .from('seat_inventory')
        .select('sold_seats')
        .eq('tier_name', tier)
        .single();

      if (inventory && inventory.sold_seats > 0) {
        await supabase
          .from('seat_inventory')
          .update({ sold_seats: inventory.sold_seats - 1 })
          .eq('tier_name', tier);
      }

      logger.info('Sold seat released', { tier });
      return true;
    } catch (error) {
      logger.error('Error releasing sold seat', {
        tier,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Increment sold seat count (for admin manual registration)
   */
  async incrementSoldSeat(tier: TierType): Promise<boolean> {
    try {
      const { data: inventory } = await supabase
        .from('seat_inventory')
        .select('sold_seats')
        .eq('tier_name', tier)
        .single();

      if (inventory) {
        await supabase
          .from('seat_inventory')
          .update({ sold_seats: inventory.sold_seats + 1 })
          .eq('tier_name', tier);
      }

      logger.info('Sold seat incremented', { tier });
      return true;
    } catch (error) {
      logger.error('Error incrementing sold seat', {
        tier,
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
   * Update tier price in seat_inventory
   * This is the actual price that gets charged via Razorpay
   */
  async updateTierPrice(tier: TierType, priceInr: number): Promise<boolean> {
    try {
      if (priceInr < 0) {
        throw new AppError('Price cannot be negative', 400, 'INVALID_PRICE');
      }

      const { error } = await supabase
        .from('seat_inventory')
        .update({ price_inr: priceInr })
        .eq('tier_name', tier);

      if (error) {
        logger.error('Error updating tier price', { tier, priceInr, error: error.message });
        throw new AppError('Failed to update tier price', 500, 'PRICE_UPDATE_ERROR');
      }

      logger.info('Tier price updated', { tier, priceInr });
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in updateTierPrice', {
        tier,
        priceInr,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Resync seat counts from registrations table
   * This fixes any discrepancy between seat_inventory and registrations tables
   */
  async resyncFromRegistrations(): Promise<{
    changes: Array<{
      tier: string;
      field: string;
      before: number;
      after: number;
    }>;
    summary: {
      tiersChecked: number;
      tiersUpdated: number;
    };
  }> {
    const changes: Array<{ tier: string; field: string; before: number; after: number }> = [];
    const tiers: TierType[] = ['vip', 'standard', 'basic'];

    try {
      for (const tier of tiers) {
        // Get current seat inventory
        const { data: inventory } = await supabase
          .from('seat_inventory')
          .select('sold_seats, held_seats')
          .eq('tier_name', tier)
          .single();

        if (!inventory) continue;

        // Count confirmed registrations for this tier
        const { count: confirmedCount } = await supabase
          .from('registrations')
          .select('*', { count: 'exact', head: true })
          .eq('tier', tier)
          .eq('payment_status', 'confirmed');

        // Count pending registrations for this tier
        const { count: pendingCount } = await supabase
          .from('registrations')
          .select('*', { count: 'exact', head: true })
          .eq('tier', tier)
          .eq('payment_status', 'pending');

        const actualSold = confirmedCount || 0;
        const actualHeld = pendingCount || 0;

        // Check if update needed
        const needsUpdate =
          inventory.sold_seats !== actualSold || inventory.held_seats !== actualHeld;

        if (needsUpdate) {
          // Track changes
          if (inventory.sold_seats !== actualSold) {
            changes.push({
              tier,
              field: 'sold_seats',
              before: inventory.sold_seats,
              after: actualSold,
            });
          }
          if (inventory.held_seats !== actualHeld) {
            changes.push({
              tier,
              field: 'held_seats',
              before: inventory.held_seats,
              after: actualHeld,
            });
          }

          // Update seat inventory
          await supabase
            .from('seat_inventory')
            .update({
              sold_seats: actualSold,
              held_seats: actualHeld,
            })
            .eq('tier_name', tier);

          logger.info('Resynced seat counts for tier', {
            tier,
            sold: { before: inventory.sold_seats, after: actualSold },
            held: { before: inventory.held_seats, after: actualHeld },
          });
        }
      }

      const tiersUpdated = new Set(changes.map((c) => c.tier)).size;

      logger.info('Seat resync completed', {
        tiersChecked: tiers.length,
        tiersUpdated,
        totalChanges: changes.length,
      });

      return {
        changes,
        summary: {
          tiersChecked: tiers.length,
          tiersUpdated,
        },
      };
    } catch (error) {
      logger.error('Error resyncing seat counts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Failed to resync seat counts', 500, 'RESYNC_ERROR');
    }
  }

  /**
   * Update total seats for a tier
   */
  async updateTotalSeats(tier: TierType, totalSeats: number): Promise<boolean> {
    try {
      if (totalSeats < 0) {
        throw new AppError('Total seats cannot be negative', 400, 'INVALID_SEATS');
      }

      // Verify new total isn't less than already sold + held
      const inventory = await this.getTierAvailability(tier);
      if (inventory) {
        const occupied = inventory.sold_seats + inventory.held_seats;
        if (totalSeats < occupied) {
          throw new AppError(
            `Cannot set total seats to ${totalSeats}. Already ${occupied} seats are sold/held for ${tier}.`,
            400,
            'SEATS_BELOW_OCCUPIED',
          );
        }
      }

      const { error } = await supabase
        .from('seat_inventory')
        .update({ total_seats: totalSeats })
        .eq('tier_name', tier);

      if (error) {
        logger.error('Error updating total seats', { tier, totalSeats, error: error.message });
        throw new AppError('Failed to update total seats', 500, 'SEATS_UPDATE_ERROR');
      }

      logger.info('Total seats updated', { tier, totalSeats });
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in updateTotalSeats', {
        tier,
        totalSeats,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Format price for display
   * Note: Database stores prices in RUPEES (INR) directly
   */
  private formatPrice(price: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  }
}

export const seatService = new SeatService();
