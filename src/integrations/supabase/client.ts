import { createClient } from '@supabase/supabase-js';
import { getRequestWorkspaceId } from '@/utils/activeWorkspace';

// Get environment variables directly from process.env (injected by Vite)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
  });
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file.',
  );
}

// REST only: edge functions declare their own CORS header lists and would refuse the preflight.
const fetchWithWorkspace: typeof fetch = (input, init) => {
  const workspaceId = getRequestWorkspaceId();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!workspaceId || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('x-workspace-id', workspaceId);
  return fetch(input, { ...init, headers });
};

export const supabase = (createClient as any)(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithWorkspace },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
      heartbeatIntervalMs: 30000,
    },
  },
});

export default supabase;
