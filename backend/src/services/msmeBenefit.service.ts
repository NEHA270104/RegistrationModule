import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import type { MsmeBenefit, CreateMsmeBenefitRequest, UpdateMsmeBenefitRequest } from '../types/index.js';

export class MsmeBenefitService {
  /**
   * Get all active benefits for public display (ordered by sort_order)
   */
  async getActiveBenefits(): Promise<MsmeBenefit[]> {
    try {
      const { data, error } = await supabase
        .from('msme_benefits')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error fetching active benefits', { error: error.message });
        throw new AppError('Failed to fetch benefits', 500, 'BENEFITS_FETCH_ERROR');
      }

      return (data || []) as MsmeBenefit[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getActiveBenefits', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all benefits for admin (including inactive)
   */
  async getAllBenefits(): Promise<MsmeBenefit[]> {
    try {
      const { data, error } = await supabase
        .from('msme_benefits')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error fetching all benefits', { error: error.message });
        throw new AppError('Failed to fetch benefits', 500, 'BENEFITS_FETCH_ERROR');
      }

      return (data || []) as MsmeBenefit[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getAllBenefits', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get single benefit by ID
   */
  async getBenefitById(id: string): Promise<MsmeBenefit> {
    try {
      const { data, error } = await supabase
        .from('msme_benefits')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AppError('Benefit not found', 404, 'BENEFIT_NOT_FOUND');
        }
        logger.error('Error fetching benefit', { id, error: error.message });
        throw new AppError('Failed to fetch benefit', 500, 'BENEFIT_FETCH_ERROR');
      }

      return data as MsmeBenefit;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Create a new benefit
   */
  async createBenefit(data: CreateMsmeBenefitRequest): Promise<MsmeBenefit> {
    try {
      let sortOrder = data.sort_order;
      if (sortOrder === undefined || sortOrder === null) {
        const { data: maxData } = await supabase
          .from('msme_benefits')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1);

        sortOrder = (maxData && maxData.length > 0) ? (maxData[0].sort_order + 1) : 0;
      }

      const { data: benefit, error } = await supabase
        .from('msme_benefits')
        .insert({
          title: data.title,
          description: data.description || '',
          icon: data.icon || null,
          sort_order: sortOrder,
          is_active: data.is_active !== undefined ? data.is_active : true,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating benefit', { error: error.message });
        throw new AppError('Failed to create benefit', 500, 'BENEFIT_CREATE_ERROR');
      }

      logger.info('Benefit created', { id: benefit.id, title: data.title });
      return benefit as MsmeBenefit;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in createBenefit', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Bulk create benefits (for CSV upload and AI suggestions)
   */
  async bulkCreateBenefits(items: CreateMsmeBenefitRequest[]): Promise<MsmeBenefit[]> {
    try {
      // Get current max sort_order
      const { data: maxData } = await supabase
        .from('msme_benefits')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);

      let startOrder = (maxData && maxData.length > 0) ? (maxData[0].sort_order + 1) : 0;

      const insertData = items.map((item, index) => ({
        title: item.title,
        description: item.description || '',
        icon: item.icon || null,
        sort_order: item.sort_order !== undefined ? item.sort_order + startOrder : startOrder + index,
        is_active: item.is_active !== undefined ? item.is_active : true,
      }));

      const { data: benefits, error } = await supabase
        .from('msme_benefits')
        .insert(insertData)
        .select();

      if (error) {
        logger.error('Error bulk creating benefits', { error: error.message });
        throw new AppError('Failed to bulk create benefits', 500, 'BENEFIT_BULK_CREATE_ERROR');
      }

      logger.info('Benefits bulk created', { count: benefits?.length || 0 });
      return (benefits || []) as MsmeBenefit[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in bulkCreateBenefits', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update an existing benefit
   */
  async updateBenefit(id: string, data: UpdateMsmeBenefitRequest): Promise<MsmeBenefit> {
    try {
      await this.getBenefitById(id);

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.icon !== undefined) updateData.icon = data.icon;
      if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: benefit, error } = await supabase
        .from('msme_benefits')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating benefit', { id, error: error.message });
        throw new AppError('Failed to update benefit', 500, 'BENEFIT_UPDATE_ERROR');
      }

      logger.info('Benefit updated', { id });
      return benefit as MsmeBenefit;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in updateBenefit', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Delete a benefit
   */
  async deleteBenefit(id: string): Promise<void> {
    try {
      await this.getBenefitById(id);

      const { error } = await supabase
        .from('msme_benefits')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting benefit', { id, error: error.message });
        throw new AppError('Failed to delete benefit', 500, 'BENEFIT_DELETE_ERROR');
      }

      logger.info('Benefit deleted', { id });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in deleteBenefit', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Reorder benefits (batch update sort_order)
   */
  async reorderBenefits(orderedIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('msme_benefits')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', orderedIds[i]);

        if (error) {
          logger.error('Error reordering benefit', { id: orderedIds[i], error: error.message });
          throw new AppError('Failed to reorder benefits', 500, 'BENEFIT_REORDER_ERROR');
        }
      }

      logger.info('Benefits reordered', { count: orderedIds.length });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }
}

export const msmeBenefitService = new MsmeBenefitService();
