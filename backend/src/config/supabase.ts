import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

// Create Supabase client with service role key (full access)
export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
);

// Create Supabase client with anon key (for public queries)
export const supabasePublic: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.anonKey || config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('seat_inventory')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Database connection failed', { error: error.message });
      return false;
    }

    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// Realtime subscription helper
export function subscribeToSeatUpdates(
  callback: (payload: unknown) => void
): () => void {
  const channel = supabase
    .channel('seat_updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'seat_inventory',
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
