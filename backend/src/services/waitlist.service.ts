import { supabase } from '../config/supabase.js';
import { createRazorpayOrder } from '../config/razorpay.js';
import { logger } from '../utils/logger.js';
import { emailService } from './email.service.js';
import type { Waitlist, WaitlistRequest, WaitlistResponse, TierType } from '../types/index.js';
import { AppError } from '../types/index.js';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

export class WaitlistService {
  /**
   * Add user to waitlist
   */
  async addToWaitlist(
    data: WaitlistRequest,
    metadata?: { ip_address?: string; utm_source?: string }
  ): Promise<WaitlistResponse> {
    try {
      // Check if already on waitlist
      const existing = await this.getByEmail(data.email);
      if (existing) {
        return {
          success: true,
          position: existing.position,
          message: 'You are already on the waitlist',
        };
      }

      // Get next position
      const { data: positionData, error: posError } = await supabase.rpc(
        'get_next_waitlist_position'
      );

      if (posError) {
        logger.error('Error getting waitlist position', { error: posError.message });
        throw new AppError('Failed to join waitlist', 500, 'WAITLIST_ERROR');
      }

      const position = positionData as number;

      // If user wants to purchase livestream access
      let livestreamOrder;
      if (data.purchase_livestream) {
        const receiptId = `wl_${Date.now()}_${uuidv4().slice(0, 8)}`;
        const order = await createRazorpayOrder(config.pricing.waitlist, receiptId, {
          type: 'waitlist_livestream',
          email: data.email,
          position: position.toString(),
        });

        livestreamOrder = {
          order_id: order.id,
          amount: config.pricing.waitlist,
          key_id: config.razorpay.keyId,
        };
      }

      // Insert waitlist entry
      const { data: waitlistEntry, error } = await supabase
        .from('waitlist')
        .insert({
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone,
          business_name: data.business_name || null,
          industry: data.industry || null,
          preferred_tier: data.preferred_tier,
          position: position,
          has_livestream_access: false,
          ip_address: metadata?.ip_address || null,
          utm_source: metadata?.utm_source || null,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error adding to waitlist', { error: error.message });
        throw new AppError('Failed to join waitlist', 500, 'WAITLIST_ERROR');
      }

      logger.info('Added to waitlist', { email: data.email, position });

      // Send waitlist confirmation email
      emailService
        .sendWaitlistEmail(data.email, data.name, position, false)
        .catch((err) => logger.error('Error sending waitlist email', { error: err.message }));

      return {
        success: true,
        position: position,
        message: 'Successfully added to waitlist',
        livestream_order: livestreamOrder,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in addToWaitlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Confirm livestream payment
   */
  async confirmLivestreamPayment(
    email: string,
    paymentId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .update({
          has_livestream_access: true,
          livestream_payment_id: paymentId,
        })
        .eq('email', email.toLowerCase())
        .select()
        .single();

      if (error) {
        logger.error('Error confirming livestream payment', { email, error: error.message });
        return { success: false, message: 'Failed to confirm livestream access' };
      }

      // Send updated confirmation email
      emailService
        .sendWaitlistEmail(data.email, data.name, data.position, true)
        .catch((err) =>
          logger.error('Error sending livestream confirmation email', { error: err.message })
        );

      logger.info('Livestream payment confirmed', { email, paymentId });
      return { success: true, message: 'Livestream access confirmed' };
    } catch (error) {
      logger.error('Unexpected error confirming livestream', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { success: false, message: 'Internal error' };
    }
  }

  /**
   * Get waitlist entry by email
   */
  async getByEmail(email: string): Promise<Waitlist | null> {
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .eq('email', email.toLowerCase())
        .is('converted_to_registration_id', null)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        return null;
      }

      return data as Waitlist;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all waitlist entries
   */
  async getAll(
    page: number = 1,
    limit: number = 50
  ): Promise<{ entries: Waitlist[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact' })
        .is('converted_to_registration_id', null)
        .order('position', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new AppError('Failed to fetch waitlist', 500, 'FETCH_ERROR');
      }

      return {
        entries: data as Waitlist[],
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get waitlist count
   */
  async getCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .is('converted_to_registration_id', null);

      if (error) {
        return 0;
      }

      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Notify waitlist users when seat becomes available
   */
  async notifyNextInLine(tier: TierType): Promise<void> {
    try {
      // Get next unnotified person on waitlist who prefers this tier
      const { data, error } = await supabase
        .from('waitlist')
        .select('*')
        .eq('preferred_tier', tier)
        .is('converted_to_registration_id', null)
        .eq('is_notified', false)
        .order('position', { ascending: true })
        .limit(1)
        .single();

      if (error || !data) {
        // No one in waitlist for this tier
        return;
      }

      // Mark as notified
      await supabase
        .from('waitlist')
        .update({
          is_notified: true,
          notified_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      // Send notification email (implement in emailService)
      logger.info('Notified waitlist user about available seat', {
        email: data.email,
        tier,
        position: data.position,
      });
    } catch (error) {
      logger.error('Error notifying waitlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Convert waitlist entry to registration
   */
  async convertToRegistration(
    waitlistId: string,
    registrationId: string
  ): Promise<void> {
    try {
      await supabase
        .from('waitlist')
        .update({
          converted_to_registration_id: registrationId,
          converted_at: new Date().toISOString(),
        })
        .eq('id', waitlistId);

      logger.info('Waitlist entry converted to registration', {
        waitlistId,
        registrationId,
      });
    } catch (error) {
      logger.error('Error converting waitlist entry', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const waitlistService = new WaitlistService();
