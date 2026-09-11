/** Zernio OAuth handler */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { checkChannelSeat } from '../../_shared/channel-seats.ts';
import { zernioApi, zernioKey, ensureZernioSecrets, publicAppUrl, resolveWorkspaceProfile, fetchZernioAccount } from '../zernio.ts';
import { CONNECTABLE_PLATFORM_IDS } from '../../_shared/socialPlatforms.generated.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Platforms we surface in the UI — READ from the shared vocabulary rather than re-typed. The
 * hand-written copy that used to sit here listed `googlebusiness` and the connect grid did not,
 * so this function accepted a platform no button in the app could ask for.
 */
const SUPPORTED_PLATFORMS = CONNECTABLE_PLATFORM_IDS;

/**
 * The public facts about a connected Google Business location: its name, its Maps page and the
 * "write a review" URL Google mints for it. Stored at connect time because a review is about a
 * PLACE, and a profile that prints reviews has to be able to name and link the place they are
 * about. Failure is non-fatal — an account with no details is still a connected account, so this
 * returns null rather than failing the connection that already succeeded.
 */
async function fetchGmbLocation(zernioAccountId: string): Promise<Record<string, unknown> | null> {
  try {
    const data = await zernioApi('GET', `/accounts/${encodeURIComponent(zernioAccountId)}/gmb-location-details`);
    const loc = (data?.location ?? null) as Record<string, unknown> | null;
    if (!loc) return null;
    return {
      gbp_location_id: data?.locationId ?? null,
      gbp_location_name: loc.name ?? null,
      gbp_place_id: loc.placeId ?? null,
      gbp_maps_url: loc.mapsUri ?? null,
      gbp_review_url: loc.reviewUrl ?? null,
      // Google withholds placeId/reviewUrl/mapsUri until a location is verified, so an
      // unverified location legitimately has nulls above — recorded, not inferred from them.
      gbp_is_verified: loc.isVerified === true,
    };
  } catch (err) {
    console.warn('[zernio-oauth] gmb-location-details failed (continuing):', err);
    return null;
  }
}


export async function handleZernioOauth(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // env → platform_secrets, before any zernioKey() / zernioApi() read.
  await ensureZernioSecrets(supabase);
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

  // Is the integration configured at all? Answered BEFORE the 503 below, because the whole point
  // is to let the connect UI say so up front instead of rendering eight platform buttons that all
  // fail on click. Returns a boolean and nothing else — never the key, never its length.
  if (body?.action === 'config_status') {
    return jsonResponse({ success: true, configured: Boolean(zernioKey()) });
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

    // workspace_id comes from the body — bind it to the caller before touching Zernio
    // (resolveWorkspaceProfile find-or-creates a Zernio profile for the workspace, so an
    // unchecked id let any user attach OAuth flows to another tenant).
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

    // Connecting an account consumes the platform's Zernio subscription — paid module (#212).
    const connectEnt = await assertEntitled(supabase, workspace_id, 'social-media');
    if (!connectEnt.ok) return connectEnt.response;


    // ...and it consumes a per-account monthly fee Zernio charges us for the third onward. This
    // is checked BEFORE the OAuth URL is minted, not after the callback: sending someone through
    // an authorisation flow and refusing the result is the worst place to say no.
    const seat = await checkChannelSeat(supabase, workspace_id);
    if (!seat.ok) {
      return jsonResponse({ success: false, code: 'channel_seat_required', error: seat.message, usage: seat.usage }, 402);
    }

    try {
      // Resolve (find-or-create) the workspace's Zernio profile.
      const profileId = await resolveWorkspaceProfile(supabase, workspace_id);

      // Where Zernio sends the browser after OAuth completes. Default to the app's
      // profile page; the frontend passes its own URL so it can process the callback.
      // A caller-supplied redirect_url is an open-redirect/phishing vector —
      // require it to be same-origin as the app before forwarding it to Zernio.
      let appRedirect = `${publicAppUrl()}/profile`;
      if (redirect_url) {
        try {
          if (new URL(redirect_url).origin === new URL(publicAppUrl()).origin) {
            appRedirect = redirect_url;
          } else {
            return jsonResponse({ success: false, error: 'redirect_url must be same-origin as the app' }, 400);
          }
        } catch {
          return jsonResponse({ success: false, error: 'invalid redirect_url' }, 400);
        }
      }

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

    const callbackEnt = await assertEntitled(supabase, workspace_id, 'social-media');
    if (!callbackEnt.ok) return callbackEnt.response;

    try {
      // Same workspace→profile mapping the connect step used, so the list read below is
      // narrowed to this tenant's accounts rather than every account on the Zernio key.
      const profileId = await resolveWorkspaceProfile(supabase, workspace_id);

      // There is NO GET /v1/accounts/{accountId} — only PUT/PATCH/DELETE live on that path,
      // so this step 404'd on every connect. Read it off the list endpoint instead.
      const found = await fetchZernioAccount(zernio_account_id, { profileId, platform });
      if (!found) {
        return jsonResponse({ success: false, error: 'Zernio has no such connected account' }, 404);
      }
      const account = found as {
        username?: string;
        displayName?: string;
        profilePicture?: string | null;
        followersCount?: number;
        metadata?: Record<string, unknown>;
      };

      // Google Business is the one platform whose account is really a PLACE. Zernio hosts the
      // location picker in the standard flow, so by the time we get here one is already chosen —
      // what is missing is its name and public URLs, which nothing else would ever fetch.
      const gmb = platform === 'googlebusiness' ? await fetchGmbLocation(zernio_account_id) : null;

      // The upsert REPLACES metadata, and the enrichment above is deliberately non-fatal — so a
      // reconnect where Google was briefly unreachable would erase the stored location name and
      // both public links, permanently and with only a console warning. Merge onto what is
      // already there: a failed fetch must leave the last good answer standing.
      const { data: existing } = await supabase
        .from('social_accounts')
        .select('metadata')
        .eq('workspace_id', workspace_id)
        .eq('platform', platform)
        .eq('zernio_account_id', zernio_account_id)
        .maybeSingle();
      const priorMeta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {});

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
          metadata: { ...priorMeta, ...(account.metadata ?? {}), ...(gmb ?? {}) },
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
