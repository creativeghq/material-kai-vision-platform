/**
 * Late.dev OAuth Edge Function
 *
 * Handles connecting and disconnecting social media accounts via Late.dev.
 * Late.dev acts as the OAuth broker — we redirect users to Late.dev which
 * handles the platform OAuth (Instagram, Facebook, LinkedIn, TikTok, etc.)
 * and returns an account_id we store in social_accounts.
 *
 * Actions:
 *   POST { action: 'connect', platform, workspace_id }
 *     → Returns Late.dev OAuth URL for the user to visit
 *   POST { action: 'callback', late_account_id, platform, workspace_id }
 *     → Called after OAuth completes; fetches account details and upserts social_accounts
 *   POST { action: 'disconnect', social_account_id }
 *     → Marks account inactive, revokes Late.dev connection
 *   GET  { action: 'list', workspace_id }
 *     → Returns all connected accounts for the workspace
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LATE_API_KEY = Deno.env.get('LATE_API_KEY') || '';
const LATE_BASE_URL = 'https://api.late.dev/v1';

// Supported platforms and their Late.dev identifiers
const SUPPORTED_PLATFORMS = [
  'instagram', 'facebook', 'linkedin', 'tiktok',
  'pinterest', 'youtube', 'twitter', 'threads',
];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function lateApiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const res = await fetch(`${LATE_BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${LATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      return { data: null, error: `Late.dev API error ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);

  if (!auth.user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const userId = auth.user.id;

  // Handle GET (list accounts)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

    if (!workspaceId) {
      return jsonResponse({ success: false, error: 'workspace_id required' }, 400);
    }

    let query = supabase
      .from('social_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('platform');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: accounts, error } = await query;
    if (error) return jsonResponse({ success: false, error: error.message }, 500);

    return jsonResponse({ success: true, accounts });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const body = await req.json();
  const { action } = body;

  // ── CONNECT: get Late.dev OAuth URL ──────────────────────────────
  if (action === 'connect') {
    const { platform, workspace_id } = body;

    if (!platform || !workspace_id) {
      return jsonResponse({ success: false, error: 'platform and workspace_id required' }, 400);
    }

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return jsonResponse({
        success: false,
        error: `Unsupported platform. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`,
      }, 400);
    }

    // Generate OAuth URL via Late.dev
    const { data, error } = await lateApiRequest('POST', '/oauth/connect', {
      platform,
      redirect_uri: `${supabaseUrl}/functions/v1/late-oauth?action=callback`,
      state: JSON.stringify({ workspace_id, user_id: userId, platform }),
    });

    if (error) {
      return jsonResponse({ success: false, error }, 500);
    }

    const result = data as { oauth_url?: string; connect_url?: string };
    return jsonResponse({
      success: true,
      oauth_url: result.oauth_url || result.connect_url,
      platform,
    });
  }

  // ── CALLBACK: store account after OAuth completes ─────────────────
  if (action === 'callback') {
    const { late_account_id, platform, workspace_id } = body;

    if (!late_account_id || !platform || !workspace_id) {
      return jsonResponse({ success: false, error: 'late_account_id, platform, workspace_id required' }, 400);
    }

    // Fetch account details from Late.dev
    const { data: accountData, error: fetchErr } = await lateApiRequest(
      'GET',
      `/accounts/${late_account_id}`,
    );

    if (fetchErr) {
      return jsonResponse({ success: false, error: fetchErr }, 500);
    }

    const account = accountData as {
      id?: string;
      handle?: string;
      name?: string;
      avatar_url?: string;
      followers_count?: number;
      following_count?: number;
      metadata?: Record<string, unknown>;
    };

    // Upsert into social_accounts
    const { data: savedAccount, error: upsertErr } = await supabase
      .from('social_accounts')
      .upsert({
        workspace_id,
        user_id: userId,
        platform,
        late_account_id,
        handle: account.handle,
        display_name: account.name,
        avatar_url: account.avatar_url,
        followers_count: account.followers_count ?? 0,
        following_count: account.following_count ?? 0,
        is_active: true,
        last_synced_at: new Date().toISOString(),
        metadata: account.metadata ?? {},
      }, {
        onConflict: 'workspace_id,platform,late_account_id',
      })
      .select()
      .single();

    if (upsertErr) {
      return jsonResponse({ success: false, error: upsertErr.message }, 500);
    }

    return jsonResponse({ success: true, account: savedAccount });
  }

  // ── DISCONNECT: revoke Late.dev and mark inactive ─────────────────
  if (action === 'disconnect') {
    const { social_account_id } = body;

    if (!social_account_id) {
      return jsonResponse({ success: false, error: 'social_account_id required' }, 400);
    }

    // Fetch the account to get late_account_id
    const { data: account, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('late_account_id, platform, workspace_id')
      .eq('id', social_account_id)
      .single();

    if (fetchErr || !account) {
      return jsonResponse({ success: false, error: 'Account not found' }, 404);
    }

    // Revoke via Late.dev
    await lateApiRequest('DELETE', `/accounts/${account.late_account_id}`);
    // Non-fatal: mark inactive in DB regardless of Late.dev response

    const { error: updateErr } = await supabase
      .from('social_accounts')
      .update({ is_active: false })
      .eq('id', social_account_id);

    if (updateErr) {
      return jsonResponse({ success: false, error: updateErr.message }, 500);
    }

    return jsonResponse({ success: true, disconnected: true });
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
});
