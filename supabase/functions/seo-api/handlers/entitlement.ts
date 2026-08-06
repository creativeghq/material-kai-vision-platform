// seo-api entitlement gate (#212). The SEO toolkit is a paid module; every handler refuses
// BEFORE debiting credits or hitting DataForSEO/MIVAA when the caller's workspace doesn't own
// `seo-toolkit`. Handlers that already resolve a workspace call assertEntitled directly;
// the rest use resolveAndAssertSeoEntitled, which derives the workspace from the acting
// user's most recent active membership (same resolution the persistence paths use).
// A user with no workspace membership passes through (nothing to be entitled) — the debit
// still applies, and such accounts are an operator anomaly, not a tenant.
import { assertEntitled } from '../../_shared/entitlement.ts';

export const SEO_MODULE = 'seo-toolkit';

export async function resolveSeoWorkspace(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(1);
  return data?.[0]?.workspace_id ?? null;
}

/** Returns `{ workspaceId, response: null }` when allowed, or a ready 402 response when not. */
export async function resolveAndAssertSeoEntitled(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ workspaceId: string | null; response: Response | null }> {
  const workspaceId = await resolveSeoWorkspace(supabase, userId);
  if (!workspaceId) return { workspaceId: null, response: null };
  const ent = await assertEntitled(supabase, workspaceId, SEO_MODULE);
  return { workspaceId, response: ent.ok ? null : ent.response };
}
