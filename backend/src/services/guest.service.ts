import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import type { Guest, CreateGuestRequest, UpdateGuestRequest } from '../types/index.js';

export class GuestService {
  private bucketReady = false;

  /**
   * Ensure the guest-photos storage bucket exists
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;

    try {
      const { data: bucket, error: getBucketError } = await supabase.storage.getBucket('guest-photos');

      if (getBucketError || !bucket) {
        // Bucket doesn't exist, create it
        const { error } = await supabase.storage.createBucket('guest-photos', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 2 * 1024 * 1024, // 2MB
        });

        if (error) {
          logger.error('Failed to create guest-photos bucket', { error: error.message });
          throw new AppError('Storage not configured. Please create a "guest-photos" public bucket in Supabase.', 500, 'STORAGE_ERROR');
        }
        logger.info('Created guest-photos storage bucket');
      } else if (!bucket.public) {
        // Bucket exists but is not public - update it
        const { error: updateError } = await supabase.storage.updateBucket('guest-photos', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 2 * 1024 * 1024,
        });

        if (updateError) {
          logger.error('Failed to make guest-photos bucket public', { error: updateError.message });
          throw new AppError('Failed to configure storage bucket as public.', 500, 'STORAGE_ERROR');
        }
        logger.info('Updated guest-photos bucket to public');
      }

      this.bucketReady = true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error checking storage bucket', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Storage configuration error', 500, 'STORAGE_ERROR');
    }
  }

  /**
   * Get all active guests for public display (ordered by sort_order)
   */
  async getActiveGuests(): Promise<Guest[]> {
    try {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error fetching active guests', { error: error.message });
        throw new AppError('Failed to fetch guests', 500, 'GUESTS_FETCH_ERROR');
      }

      return (data || []) as Guest[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getActiveGuests', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all guests for admin (including inactive)
   */
  async getAllGuests(): Promise<Guest[]> {
    try {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error fetching all guests', { error: error.message });
        throw new AppError('Failed to fetch guests', 500, 'GUESTS_FETCH_ERROR');
      }

      return (data || []) as Guest[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in getAllGuests', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get single guest by ID
   */
  async getGuestById(id: string): Promise<Guest> {
    try {
      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
        }
        logger.error('Error fetching guest', { id, error: error.message });
        throw new AppError('Failed to fetch guest', 500, 'GUEST_FETCH_ERROR');
      }

      return data as Guest;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Create a new guest
   */
  async createGuest(data: CreateGuestRequest): Promise<Guest> {
    try {
      // If no sort_order provided, get max + 1
      let sortOrder = data.sort_order;
      if (sortOrder === undefined || sortOrder === null) {
        const { data: maxData } = await supabase
          .from('guests')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1);

        sortOrder = (maxData && maxData.length > 0) ? (maxData[0].sort_order + 1) : 0;
      }

      const { data: guest, error } = await supabase
        .from('guests')
        .insert({
          name: data.name,
          title: data.title,
          bio: data.bio,
          session_heading: data.session_heading || 'In this session, you\'ll learn:',
          session_points: data.session_points,
          sort_order: sortOrder,
          is_active: data.is_active !== undefined ? data.is_active : true,
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating guest', { error: error.message });
        throw new AppError('Failed to create guest', 500, 'GUEST_CREATE_ERROR');
      }

      logger.info('Guest created', { id: guest.id, name: data.name });
      return guest as Guest;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in createGuest', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Update an existing guest
   */
  async updateGuest(id: string, data: UpdateGuestRequest): Promise<Guest> {
    try {
      // Verify guest exists
      await this.getGuestById(id);

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.bio !== undefined) updateData.bio = data.bio;
      if (data.session_heading !== undefined) updateData.session_heading = data.session_heading;
      if (data.session_points !== undefined) updateData.session_points = data.session_points;
      if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: guest, error } = await supabase
        .from('guests')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating guest', { id, error: error.message });
        throw new AppError('Failed to update guest', 500, 'GUEST_UPDATE_ERROR');
      }

      logger.info('Guest updated', { id });
      return guest as Guest;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in updateGuest', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Delete a guest (and their photo from storage)
   */
  async deleteGuest(id: string): Promise<void> {
    try {
      const guest = await this.getGuestById(id);

      // Delete photo from storage if exists
      if (guest.photo_storage_path) {
        await this.deletePhotoFromStorage(guest.photo_storage_path);
      }

      const { error } = await supabase
        .from('guests')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Error deleting guest', { id, error: error.message });
        throw new AppError('Failed to delete guest', 500, 'GUEST_DELETE_ERROR');
      }

      logger.info('Guest deleted', { id, name: guest.name });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in deleteGuest', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Upload guest photo to Supabase Storage
   */
  async uploadPhoto(
    guestId: string,
    fileBuffer: Buffer,
    mimeType: string,
    originalName: string
  ): Promise<{ publicUrl: string; storagePath: string }> {
    try {
      // Ensure storage bucket exists
      await this.ensureBucket();

      const guest = await this.getGuestById(guestId);

      // Delete old photo if exists
      if (guest.photo_storage_path) {
        await this.deletePhotoFromStorage(guest.photo_storage_path);
      }

      // Generate unique storage path
      const ext = originalName.split('.').pop() || 'jpg';
      const storagePath = `${guestId}/${Date.now()}.${ext}`;

      // Upload to Supabase Storage
      logger.info('Uploading photo to storage', { guestId, storagePath, mimeType, bufferSize: fileBuffer.length });
      const { error: uploadError } = await supabase.storage
        .from('guest-photos')
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        logger.error('Error uploading photo to storage', { guestId, error: uploadError.message });
        throw new AppError('Failed to upload photo', 500, 'PHOTO_UPLOAD_ERROR');
      }
      logger.info('Photo uploaded to storage successfully', { guestId, storagePath });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('guest-photos')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;
      logger.info('Generated public URL', { guestId, publicUrl });

      // Update guest record with photo URL
      const { data: updatedData, error: updateError } = await supabase
        .from('guests')
        .update({
          photo_url: publicUrl,
          photo_storage_path: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', guestId)
        .select('id, photo_url, photo_storage_path');

      if (updateError) {
        logger.error('Error updating guest photo URL', { guestId, error: updateError.message });
        throw new AppError('Failed to update guest photo', 500, 'GUEST_UPDATE_ERROR');
      }

      logger.info('Guest photo DB record updated', { guestId, storagePath, publicUrl, updatedData });
      return { publicUrl, storagePath };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Unexpected error in uploadPhoto', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Delete guest photo
   */
  async deletePhoto(guestId: string): Promise<void> {
    try {
      const guest = await this.getGuestById(guestId);

      if (guest.photo_storage_path) {
        await this.deletePhotoFromStorage(guest.photo_storage_path);
      }

      const { error } = await supabase
        .from('guests')
        .update({
          photo_url: null,
          photo_storage_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', guestId);

      if (error) {
        logger.error('Error clearing guest photo', { guestId, error: error.message });
        throw new AppError('Failed to delete photo', 500, 'PHOTO_DELETE_ERROR');
      }

      logger.info('Guest photo deleted', { guestId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Reorder guests (batch update sort_order)
   */
  async reorderGuests(orderedIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('guests')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', orderedIds[i]);

        if (error) {
          logger.error('Error reordering guest', { id: orderedIds[i], error: error.message });
          throw new AppError('Failed to reorder guests', 500, 'GUEST_REORDER_ERROR');
        }
      }

      logger.info('Guests reordered', { count: orderedIds.length });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Internal server error', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Helper: Delete photo file from Supabase Storage
   */
  private async deletePhotoFromStorage(storagePath: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from('guest-photos')
        .remove([storagePath]);

      if (error) {
        logger.warn('Failed to delete photo from storage', { storagePath, error: error.message });
      }
    } catch (error) {
      logger.warn('Error deleting photo from storage', {
        storagePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const guestService = new GuestService();
