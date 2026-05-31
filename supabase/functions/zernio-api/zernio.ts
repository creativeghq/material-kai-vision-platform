/**
 * Shared Zernio client + helpers.
 *
 * Zernio (formerly Late) is the social publishing / OAuth / analytics backbone.
 * Base URL: https://zernio.com/api/v1 — Bearer-auth with the workspace's Zernio API key.
 *
 * Secret resolution is env-first / DB-fallback (see _shared/secrets-bootstrap.ts):
 * we read ZERNIO_API_KEY first and fall back to the legacy LATE_API_KEY so existing
 * deployments keep working until the new key is pasted in.
 */

export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

/** Resolve the Zernio API key, falling back to the legacy LATE_API_KEY. */
export function zernioKey(): string {
  return Deno.env.get('ZERNIO_API_KEY') || Deno.env.get('LATE_API_KEY') || '';
}

/** Public app URL used to build OAuth redirect targets. */
export function publicAppUrl(): string {
  return (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
}

/** Call the Zernio REST API. Throws on non-2xx. Returns parsed JSON (or {} for empty bodies). */
export async function zernioApi(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${zernioKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zernio ${method} ${path} → ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Find-or-create exactly one Zernio profile per workspace and cache its id in
 * social_zernio_profiles. Zernio requires a profileId on every connect call;
 * a profile is just a container that holds many connected accounts, so this
 * preserves "multiple social accounts per workspace" with clean per-workspace
 * separation.
 *
 * If profile creation hits Zernio's plan ceiling (402/403), we fall back to the
 * account's default profile so connecting still succeeds.
 */
export async function resolveWorkspaceProfile(
  supabase: any,
  workspaceId: string,
): Promise<string> {
  // 1. Cached mapping
  const { data: existing } = await supabase
    .from('social_zernio_profiles')
    .select('zernio_profile_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (existing?.zernio_profile_id) return existing.zernio_profile_id;

  const desiredName = `ws:${workspaceId}`;
  let profileId: string | undefined;

  // 2. Reuse a previously-created profile with the same name (idempotent across retries)
  try {
    const list = await zernioApi('GET', '/profiles?includeOverLimit=true');
    const match = (list.profiles || []).find((p: any) => p.name === desiredName);
    if (match?._id) profileId = match._id;
  } catch (_) { /* listing is best-effort */ }

  // 3. Create a fresh profile for this workspace
  if (!profileId) {
    try {
      const created = await zernioApi('POST', '/profiles', {
        name: desiredName,
        description: `Material KAI workspace ${workspaceId}`,
      });
      profileId = created.profile?._id;
    } catch (err) {
      // Plan ceiling / payment gate → fall back to the default profile.
      try {
        const list = await zernioApi('GET', '/profiles?includeOverLimit=true');
        const profiles = (list.profiles || []) as any[];
        profileId = (profiles.find((p) => p.isDefault) || profiles[0])?._id;
      } catch (_) { /* ignore */ }
      if (!profileId) throw err;
    }
  }

  if (!profileId) {
    throw new Error('Could not resolve a Zernio profile for this workspace');
  }

  // 4. Cache the mapping (service-role write)
  await supabase
    .from('social_zernio_profiles')
    .upsert({ workspace_id: workspaceId, zernio_profile_id: profileId }, { onConflict: 'workspace_id' });

  return profileId;
}
