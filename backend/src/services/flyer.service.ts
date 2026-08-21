import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface Flyer {
  id: string;
  tenant_id: string;
  name: string;
  template_id: string;
  template_data: Record<string, unknown>;
  generated_image_url: string;
  format: string;
  dimensions: string;
  created_at: string;
}

export interface CreateFlyerRequest {
  name: string;
  template_id: string;
  template_data: Record<string, unknown>;
  image_base64: string;
  format?: string;
  dimensions?: string;
  tenant_id?: string;
}

export class FlyerService {
  private bucketReady = false;
  private defaultTenantId = '00000000-0000-0000-0000-000000000001';

  /**
   * Ensure the flyers storage bucket exists and is public
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;

    try {
      const { data: bucket, error: getBucketError } = await supabase.storage.getBucket('flyers');

      if (getBucketError || !bucket) {
        // Bucket doesn't exist, create it
        const { error } = await supabase.storage.createBucket('flyers', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
        });

        if (error) {
          logger.error('Failed to create flyers bucket', { error: error.message });
          throw new AppError('Storage not configured. Please create a "flyers" public bucket in Supabase.', 500, 'STORAGE_ERROR');
        }
        logger.info('Created flyers storage bucket');
      } else if (!bucket.public) {
        // Bucket exists but is not public - update it
        const { error: updateError } = await supabase.storage.updateBucket('flyers', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          fileSizeLimit: 10 * 1024 * 1024,
        });

        if (updateError) {
          logger.error('Failed to make flyers bucket public', { error: updateError.message });
          throw new AppError('Failed to configure flyers storage bucket as public.', 500, 'STORAGE_ERROR');
        }
        logger.info('Updated flyers bucket to public');
      }

      this.bucketReady = true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error checking flyers storage bucket', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Storage configuration error', 500, 'STORAGE_ERROR');
    }
  }

  /**
   * Get all generated flyers
   */
  async getAllFlyers(tenantId?: string): Promise<Flyer[]> {
    try {
      const targetTenantId = tenantId || this.defaultTenantId;
      const { data, error } = await supabase
        .from('flyers')
        .select('*')
        .eq('tenant_id', targetTenantId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching flyers', { error: error.message });
        throw new AppError('Failed to fetch flyers', 500, 'FLYERS_FETCH_ERROR');
      }

      return (data || []) as Flyer[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getAllFlyers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Upload flyer snapshot and create database record
   */
  async createFlyer(data: CreateFlyerRequest): Promise<Flyer> {
    try {
      await this.ensureBucket();

      const tenantId = data.tenant_id || this.defaultTenantId;
      const format = data.format || 'png';
      const dimensions = data.dimensions || '1080x1080';

      // Parse base64 data URL
      const matches = data.image_base64.match(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/s);
      if (!matches) {
        throw new AppError('Invalid image data URL format.', 400, 'VALIDATION_ERROR');
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const fileBuffer = Buffer.from(base64Data, 'base64');

      // Generate unique file path
      const ext = mimeType.includes('pdf') ? 'pdf' : 'png';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const storagePath = `${tenantId}/${fileName}`;

      // Upload to Supabase Storage
      logger.info('Uploading flyer to storage', { tenantId, storagePath, mimeType, size: fileBuffer.length });
      const { error: uploadError } = await supabase.storage
        .from('flyers')
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        logger.error('Error uploading flyer to storage', { error: uploadError.message });
        throw new AppError('Failed to upload flyer to storage', 500, 'STORAGE_UPLOAD_ERROR');
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('flyers')
        .getPublicUrl(storagePath);

      const generatedImageUrl = urlData.publicUrl;
      logger.info('Generated flyer public URL', { generatedImageUrl });

      // Save flyer details to database
      const { data: flyer, error: dbError } = await supabase
        .from('flyers')
        .insert({
          tenant_id: tenantId,
          name: data.name,
          template_id: data.template_id,
          template_data: data.template_data,
          generated_image_url: generatedImageUrl,
          format: format,
          dimensions: dimensions,
        })
        .select()
        .single();

      if (dbError) {
        logger.error('Error creating flyer DB record', { error: dbError.message });
        
        // Attempt to clean up storage if database insert fails
        await supabase.storage.from('flyers').remove([storagePath]);
        
        throw new AppError('Failed to save flyer details to database', 500, 'DATABASE_ERROR');
      }

      logger.info('Flyer generated and saved successfully', { id: flyer.id });
      return flyer as Flyer;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in createFlyer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Delete flyer from storage and database
   */
  async deleteFlyer(id: string, tenantId?: string): Promise<void> {
    try {
      const targetTenantId = tenantId || this.defaultTenantId;

      // Get flyer details
      const { data: flyer, error: fetchError } = await supabase
        .from('flyers')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', targetTenantId)
        .single();

      if (fetchError || !flyer) {
        throw new AppError('Flyer not found', 404, 'FLYER_NOT_FOUND');
      }

      // Extract storage path from public URL
      // publicUrl has format: .../storage/v1/object/public/flyers/[tenant_id]/[file_name]
      const urlParts = flyer.generated_image_url.split('/flyers/');
      if (urlParts.length > 1) {
        const storagePath = urlParts[1];
        logger.info('Removing flyer from storage', { storagePath });
        await supabase.storage.from('flyers').remove([storagePath]);
      }

      // Delete from DB
      const { error: dbError } = await supabase
        .from('flyers')
        .delete()
        .eq('id', id)
        .eq('tenant_id', targetTenantId);

      if (dbError) {
        logger.error('Error deleting flyer DB record', { error: dbError.message });
        throw new AppError('Failed to delete flyer record', 500, 'DATABASE_ERROR');
      }

      logger.info('Flyer deleted successfully', { id });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in deleteFlyer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get flyer config for a specific tenant
   */
  async getFlyerConfig(tenantId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('flyer_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching flyer config', { error: error.message, tenantId });
        throw new AppError('Failed to fetch flyer configuration', 500, 'DATABASE_ERROR');
      }

      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getFlyerConfig', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId,
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update or create flyer config for a specific tenant
   */
  async saveFlyerConfig(tenantId: string, configData: any): Promise<any> {
    try {
      // Check if config already exists
      const { data: existing, error: findError } = await supabase
        .from('flyer_config')
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (findError) {
        logger.error('Error looking up existing flyer config', { error: findError.message, tenantId });
        throw new AppError('Database error', 500, 'DATABASE_ERROR');
      }

      const payload = {
        tenant_id: tenantId,
        primary_color: configData.primary_color,
        secondary_color: configData.secondary_color,
        text_color: configData.text_color,
        title: configData.title,
        subtitle: configData.subtitle,
        event_date: configData.event_date,
        event_time: configData.event_time,
        venue: configData.venue,
        logo_url: configData.logo_url,
        bg_image_url: configData.bg_image_url,
        qr_x: configData.qr_x !== undefined && configData.qr_x !== null ? Number(configData.qr_x) : undefined,
        qr_y: configData.qr_y !== undefined && configData.qr_y !== null ? Number(configData.qr_y) : undefined,
        qr_size: configData.qr_size !== undefined && configData.qr_size !== null ? Number(configData.qr_size) : undefined,
        logo_x: configData.logo_x !== undefined && configData.logo_x !== null ? Number(configData.logo_x) : undefined,
        logo_y: configData.logo_y !== undefined && configData.logo_y !== null ? Number(configData.logo_y) : undefined,
        logo_width: configData.logo_width !== undefined && configData.logo_width !== null ? Number(configData.logo_width) : undefined,
        logo_height: configData.logo_height !== undefined && configData.logo_height !== null ? Number(configData.logo_height) : undefined,
        text_x: configData.text_x !== undefined && configData.text_x !== null ? Number(configData.text_x) : undefined,
        text_y: configData.text_y !== undefined && configData.text_y !== null ? Number(configData.text_y) : undefined,
        updated_at: new Date().toISOString()
      };

      let result;
      if (existing) {
        const { data, error } = await supabase
          .from('flyer_config')
          .update(payload)
          .eq('tenant_id', tenantId)
          .select()
          .single();

        if (error) {
          logger.error('Error updating flyer config', { error: error.message, tenantId });
          throw new AppError('Failed to update flyer configuration', 500, 'DATABASE_ERROR');
        }
        result = data;
      } else {
        const { data, error } = await supabase
          .from('flyer_config')
          .insert({
            ...payload,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error('Error inserting flyer config', { error: error.message, tenantId });
          throw new AppError('Failed to create flyer configuration', 500, 'DATABASE_ERROR');
        }
        result = data;
      }

      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in saveFlyerConfig', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId,
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }
}

export const flyerService = new FlyerService();
