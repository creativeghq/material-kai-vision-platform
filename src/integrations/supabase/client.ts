import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/environment';
import { logger } from '@/services/logger.service';

// Get environment variables from centralized config
const supabaseUrl = env.supabase.url;
const supabaseAnonKey = env.supabase.anonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('Missing Supabase configuration', undefined, {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    environment: env.nodeEnv,
  });
  throw new Error(
    'Missing Supabase environment variables. Please check your environment configuration.',
  );
}

logger.info('Initializing Supabase client', {
  environment: env.nodeEnv,
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
});

// Create and export the Supabase client
export const supabase = (createClient as any)(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
      heartbeatIntervalMs: 30000,
    },
  },
});

export default supabase;
