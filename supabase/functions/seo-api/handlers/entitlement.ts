// seo-api entitlement gate (#212). The SEO toolkit is a paid module; every handler refuses
// BEFORE debiting credits or hitting DataForSEO/MIVAA when the caller's workspace doesn't own
// `seo-toolkit`. Handlers with no workspace of their own use resolveAndAssertSeoEntitled.
import { assertEntitled, resolveEntitledWorkspace } from '../../_shared/entitlement.ts';
import { userHasWorkspaceCapability } from '../../_shared/auth.ts';

export const SEO_MODULE = 'seo-toolkit';

export function resolveSeoWorkspace(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  return resolveEntitledWorkspace(supabase, userId, SEO_MODULE);
}

/** Returns `{ workspaceId, response: null }` when allowed, or a ready 402 response when not. */
export async function resolveAndAssertSeoEntitled(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  boundWorkspaceId?: string | null,
): Promise<{ workspaceId: string | null; response: Response | null }> {
  const workspaceId = boundWorkspaceId ?? await resolveSeoWorkspace(supabase, userId);
  if (!workspaceId) return { workspaceId: null, response: null };
  const ent = await assertEntitled(supabase, workspaceId, SEO_MODULE);
  return { workspaceId, response: ent.ok ? null : ent.response };
}

/** The workspace a named website bills to: `undefined` when none was named, `null` when the caller may not use it. */
export async function websiteWorkspaceFor(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  websiteId: unknown,
): Promise<string | null | undefined> {
  if (typeof websiteId !== 'string' || !websiteId) return undefined;
  const { data, error } = await supabase.from('user_websites').select('workspace_id').eq('id', websiteId).maybeSingle();
  if (error) throw new Error(`Could not read the website: ${error.message}`);
  const ws = (data as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!ws) return null;
  return (await userHasWorkspaceCapability(supabase, userId, ws, 'marketing.seo')) ? ws : null;
}
