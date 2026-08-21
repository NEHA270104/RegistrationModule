import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './index.js';

/**
 * Supabase Admin client using service_role key.
 * Bypasses RLS — use only for super-admin operations and server-side auth management.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
