import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** The Supabase client type that `createClient(url, key)` actually produces here. */
export type DbClient = SupabaseClient<any, 'public', 'public', any, any>;

/** A service-role client, built fresh on each call. */
export function serviceClient(): DbClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  ) as DbClient;
}
