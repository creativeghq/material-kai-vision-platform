import { createClient } from '@supabase/supabase-js';

// Get environment variables from Vite (defined in vite.config.ts)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your Vercel Environment Variables.');
}

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
