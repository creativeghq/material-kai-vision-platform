/**
 * Pinterest OAuth Edge Function
 *
 * Handles Pinterest OAuth 2.0 flow for authenticated board/pin access.
 *
 * Actions:
 *   get_auth_url   - Generate Pinterest OAuth authorization URL
 *   callback       - Exchange auth code for tokens, store in social_accounts
 *   get_boards     - Fetch user's Pinterest boards
 *   get_board_pins - Fetch pins from a specific board
 *   disconnect     - Remove Pinterest connection
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PINTEREST_APP_ID = () => Deno.env.get('PINTEREST_APP_ID') || '';
const PINTEREST_APP_SECRET = () => Deno.env.get('PINTEREST_APP_SECRET') || '';
const PINTEREST_REDIRECT_URI = () => Deno.env.get('PINTEREST_REDIRECT_URI') || '';

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Base64 encode client credentials for Basic auth
 */
function getBasicAuthHeader(): string {
  const credentials = `${PINTEREST_APP_ID()}:${PINTEREST_APP_SECRET()}`;
  return `Basic ${btoa(credentials)}`;
}

/**
 * Refresh an expired Pinterest access token
 */
async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(`${PINTEREST_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token refresh failed ${res.status}: ${text}`);
  }

  const tokenData = await res.json();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Update stored tokens
  await supabase
    .from('social_accounts')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      token_expires_at: expiresAt,
    })
    .eq('user_id', userId)
    .eq('platform', 'pinterest');

  return tokenData.access_token;
}

/**
 * Get a valid access token for the user, refreshing if needed
 */
async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { data: account, error } = await supabase
    .from('social_accounts')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('platform', 'pinterest')
    .single();

  if (error || !account) {
    throw new Error('Pinterest account not connected. Please connect via OAuth first.');
  }

  // Check if token is expired (with 5 min buffer)
  const expiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();

  if (now >= expiresAt - 5 * 60 * 1000) {
    if (!account.refresh_token) {
      throw new Error('Pinterest token expired and no refresh token available. Please reconnect.');
    }
    return await refreshAccessToken(supabase, userId, account.refresh_token);
  }

  return account.access_token;
}

/**
 * Make an authenticated request to Pinterest API v5
 */
async function pinterestApiRequest(
  accessToken: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${PINTEREST_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest API error ${res.status}: ${text}`);
  }

  return await res.json();
}

// ── Main Handler ────────────────────────────────────────────────────────────────

Deno.serve(withApiLogging('pinterest-oauth', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);

  if (!auth.user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const userId = auth.user.id;

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const body = await req.json();
  const { action } = body;

  // ── get_auth_url ────────────────────────────────────────────────────────────
  if (action === 'get_auth_url') {
    if (!PINTEREST_APP_ID() || !PINTEREST_REDIRECT_URI()) {
      return jsonResponse({ success: false, error: 'Pinterest OAuth not configured' }, 500);
    }

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // Store state temporarily for verification on callback
    await supabase
      .from('social_accounts')
      .upsert({
        user_id: userId,
        platform: 'pinterest_oauth_state',
        platform_account_id: state,
        account_name: 'oauth_state',
        access_token: state,
        metadata: { created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
      }, {
        onConflict: 'user_id,platform',
      });

    const scopes = 'pins:read,boards:read,user_accounts:read';
    const authUrl = `https://api.pinterest.com/oauth/?response_type=code&client_id=${PINTEREST_APP_ID()}&redirect_uri=${encodeURIComponent(PINTEREST_REDIRECT_URI())}&scope=${scopes}&state=${state}`;

    return jsonResponse({ success: true, auth_url: authUrl, state });
  }

  // ── callback ────────────────────────────────────────────────────────────────
  if (action === 'callback') {
    const { code, state } = body;

    if (!code || !state) {
      return jsonResponse({ success: false, error: 'code and state are required' }, 400);
    }

    // Verify CSRF state
    const { data: storedState } = await supabase
      .from('social_accounts')
      .select('access_token, metadata')
      .eq('user_id', userId)
      .eq('platform', 'pinterest_oauth_state')
      .single();

    if (!storedState || storedState.access_token !== state) {
      return jsonResponse({ success: false, error: 'Invalid or expired OAuth state (CSRF check failed)' }, 400);
    }

    // Check state expiry
    const stateExpiry = storedState.metadata?.expires_at;
    if (stateExpiry && new Date(stateExpiry).getTime() < Date.now()) {
      return jsonResponse({ success: false, error: 'OAuth state expired. Please try again.' }, 400);
    }

    // Clean up state record
    await supabase
      .from('social_accounts')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'pinterest_oauth_state');

    // Exchange code for tokens
    const tokenRes = await fetch(`${PINTEREST_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: PINTEREST_REDIRECT_URI(),
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return jsonResponse({ success: false, error: `Token exchange failed: ${text}` }, 400);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Fetch user profile to get account info
    let accountId = 'unknown';
    let accountName = 'Pinterest User';
    try {
      const userInfo = await pinterestApiRequest(accessToken, '/user_account') as {
        username?: string;
        id?: string;
      };
      accountId = userInfo.username || userInfo.id || accountId;
      accountName = userInfo.username || accountName;
    } catch (err) {
      console.warn('[pinterest-oauth] Failed to fetch user profile:', err);
    }

    // Upsert into social_accounts
    const { error: upsertError } = await supabase
      .from('social_accounts')
      .upsert({
        user_id: userId,
        platform: 'pinterest',
        platform_account_id: accountId,
        account_name: accountName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        metadata: {
          scope: tokenData.scope,
          token_type: tokenData.token_type,
          connected_at: new Date().toISOString(),
        },
      }, {
        onConflict: 'user_id,platform',
      });

    if (upsertError) {
      return jsonResponse({ success: false, error: `Failed to store tokens: ${upsertError.message}` }, 500);
    }

    return jsonResponse({ success: true, connected: true, account_name: accountName });
  }

  // ── get_boards ──────────────────────────────────────────────────────────────
  if (action === 'get_boards') {
    try {
      const accessToken = await getValidAccessToken(supabase, userId);
      const data = await pinterestApiRequest(accessToken, '/boards') as {
        items?: unknown[];
      };

      return jsonResponse({ success: true, boards: data.items || [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ success: false, error: message }, 400);
    }
  }

  // ── get_board_pins ──────────────────────────────────────────────────────────
  if (action === 'get_board_pins') {
    const { board_id, bookmark } = body;

    if (!board_id) {
      return jsonResponse({ success: false, error: 'board_id is required' }, 400);
    }

    try {
      const accessToken = await getValidAccessToken(supabase, userId);
      const params = new URLSearchParams({ page_size: '25' });
      if (bookmark) {
        params.set('bookmark', bookmark);
      }

      const data = await pinterestApiRequest(
        accessToken,
        `/boards/${board_id}/pins?${params.toString()}`,
      ) as {
        items?: unknown[];
        bookmark?: string;
      };

      return jsonResponse({
        success: true,
        pins: data.items || [],
        bookmark: data.bookmark || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ success: false, error: message }, 400);
    }
  }

  // ── disconnect ──────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    const { error: deleteError } = await supabase
      .from('social_accounts')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'pinterest');

    if (deleteError) {
      return jsonResponse({ success: false, error: `Failed to disconnect: ${deleteError.message}` }, 500);
    }

    return jsonResponse({ success: true });
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
}));
