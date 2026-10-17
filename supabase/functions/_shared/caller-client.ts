import { createClient } from '@supabase/supabase-js';
import type { DbClient } from './supabase-client.ts';
import { actingClient } from './auth.ts';

/**
 * The database as the CALLER: their session JWT through RLS, or — for a kai_ API key, which
 * PostgREST cannot read — the same identity through actingClient. A missing token reads as anon.
 */
export function callerDbClient(token: string | null | undefined, userId: string, workspaceId?: string | null): DbClient {
  if (token?.startsWith('kai_')) {
    if (!userId) throw new Error('A kai_ key caller reads the database only as a named user');
    return actingClient(userId, workspaceId);
  }
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
}

/** Headers for a raw PostgREST fetch as the caller (same rule as callerDbClient). */
export function callerRestHeaders(token: string | null | undefined, userId: string): Record<string, string> {
  if (token?.startsWith('kai_')) {
    if (!userId) throw new Error('A kai_ key caller reads the database only as a named user');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    return { apikey: key, Authorization: `Bearer ${key}`, 'x-acting-user': userId };
  }
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  return { apikey: anon, Authorization: `Bearer ${token ?? anon}` };
}
