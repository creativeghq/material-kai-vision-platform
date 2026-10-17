// seo-api entitlement gate (#212). The SEO toolkit is a paid module; every handler refuses
// BEFORE debiting credits or hitting DataForSEO/MIVAA when the caller's workspace doesn't own
// `seo-toolkit`. Handlers with no workspace of their own use resolveAndAssertSeoEntitled.
import { assertEntitled, resolveEntitledWorkspace } from '../../_shared/entitlement.ts';

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
): Promise<{ workspaceId: string | null; response: Response | null }> {
  const workspaceId = await resolveSeoWorkspace(supabase, userId);
  if (!workspaceId) return { workspaceId: null, response: null };
  const ent = await assertEntitled(supabase, workspaceId, SEO_MODULE);
  return { workspaceId, response: ent.ok ? null : ent.response };
}
