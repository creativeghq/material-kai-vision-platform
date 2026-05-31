/**
 * Zernio OAuth handler
 *
 * Connects / disconnects social media accounts via Zernio.
 * Zernio is the OAuth broker — we ask it for an authUrl, the user authorises on
 * the platform, then Zernio redirects back to our app with the connected
 * accountId. The frontend then calls `action: 'callback'` to persist the account.
 *
 * Zernio groups accounts under a per-workspace "profile" (resolved lazily).
 *
 * Actions:
 *   POST { action: 'connect', platform, workspace_id, redirect_url? }
 *     → Returns a Zernio OAuth authUrl for the user to visit
 *   POST { action: 'callback', zernio_account_id, platform, workspace_id }
 *     → Called after OAuth completes; fetches account details and upserts social_accounts
 *   POST { action: 'disconnect', social_account_id }
 *     → Marks account inactive, revokes the Zernio connection
 *   GET  { action: 'list', workspace_id }
 *     → Returns all connected accounts for the workspace (from our DB)
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { zernioApi, zernioKey, publicAppUrl, resolveWorkspaceProfile } from '../zernio.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Platforms we surface in the UI — all supported by Zernio.
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

export async function handleZernioOauth(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);

  if (!auth.user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const userId = auth.user.id;

  // Handle GET (list accounts) — reads our own DB, no Zernio call.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

    if (!workspaceId) {
      return jsonResponse({ success: false, error: 'workspace_id required' }, 400);
    }

    // Verify caller belongs to the requested workspace
    if (userId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) {
        return jsonResponse({ success: false, error: 'Not a member of this workspace' }, 403);
      }
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

  if (!zernioKey()) {
    return jsonResponse({ success: false, error: 'Social accounts integration is not configured (missing ZERNIO_API_KEY)' }, 503);
  }

  const { action } = body ?? {};

  // ── CONNECT: get Zernio OAuth URL ────────────────────────────────
  if (action === 'connect') {
    const { platform, workspace_id, redirect_url } = body;

    if (!platform || !workspace_id) {
      return jsonResponse({ success: false, error: 'platform and workspace_id required' }, 400);
    }

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      return jsonResponse({
        success: false,
        error: `Unsupported platform. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`,
      }, 400);
    }

    try {
      // Resolve (find-or-create) the workspace's Zernio profile.
      const profileId = await resolveWorkspaceProfile(supabase, workspace_id);

      // Where Zernio sends the browser after OAuth completes. Default to the app's
      // profile page; the frontend passes its own URL so it can process the callback.
      const appRedirect = redirect_url || `${publicAppUrl()}/profile`;

      // Zernio: GET /v1/connect/{platform}?profileId=&redirect_url= → { authUrl, state }
      const qs = new URLSearchParams({ profileId, redirect_url: appRedirect });
      const data = await zernioApi('GET', `/connect/${platform}?${qs.toString()}`);

      return jsonResponse({
        success: true,
        oauth_url: data.authUrl,
        platform,
        profile_id: profileId,
      });
    } catch (err) {
      console.error('[zernio-oauth] connect error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  // ── CALLBACK: store account after OAuth completes ─────────────────
  if (action === 'callback') {
    const { zernio_account_id, platform, workspace_id } = body;

    if (!zernio_account_id || !platform || !workspace_id) {
      return jsonResponse({ success: false, error: 'zernio_account_id, platform, workspace_id required' }, 400);
    }

    // Verify caller belongs to the workspace before writing.
    if (userId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspace_id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) {
        return jsonResponse({ success: false, error: 'Not a member of this workspace' }, 403);
      }
    }

    try {
      // Zernio: GET /v1/accounts/{accountId} → { account: SocialAccount }
      const accountData = await zernioApi('GET', `/accounts/${zernio_account_id}`);
      const account = (accountData.account ?? accountData) as {
        username?: string;
        displayName?: string;
        profilePicture?: string | null;
        followersCount?: number;
        metadata?: Record<string, unknown>;
      };

      const { data: savedAccount, error: upsertErr } = await supabase
        .from('social_accounts')
        .upsert({
          workspace_id,
          user_id: userId,
          platform,
          zernio_account_id,
          handle: account.username,
          display_name: account.displayName,
          avatar_url: account.profilePicture,
          followers_count: account.followersCount ?? 0,
          is_active: true,
          last_synced_at: new Date().toISOString(),
          metadata: account.metadata ?? {},
        }, {
          onConflict: 'workspace_id,platform,zernio_account_id',
        })
        .select()
        .single();

      if (upsertErr) {
        return jsonResponse({ success: false, error: upsertErr.message }, 500);
      }

      return jsonResponse({ success: true, account: savedAccount });
    } catch (err) {
      console.error('[zernio-oauth] callback error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  // ── DISCONNECT: revoke on Zernio and mark inactive ────────────────
  if (action === 'disconnect') {
    const { social_account_id } = body;

    if (!social_account_id) {
      return jsonResponse({ success: false, error: 'social_account_id required' }, 400);
    }

    const { data: account, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('zernio_account_id, platform, workspace_id')
      .eq('id', social_account_id)
      .single();

    if (fetchErr || !account) {
      return jsonResponse({ success: false, error: 'Account not found' }, 404);
    }

    // Verify caller belongs to the account's workspace
    if (userId && account.workspace_id) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', account.workspace_id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership) {
        return jsonResponse({ success: false, error: 'Not authorized to disconnect this account' }, 403);
      }
    }

    // Revoke via Zernio (non-fatal: mark inactive regardless of Zernio response).
    try {
      await zernioApi('DELETE', `/accounts/${account.zernio_account_id}`);
    } catch (err) {
      console.warn('[zernio-oauth] disconnect revoke failed (continuing):', err);
    }

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
}
