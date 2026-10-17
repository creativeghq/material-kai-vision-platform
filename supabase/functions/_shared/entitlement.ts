// Module entitlement enforcement at the API boundary (the real security line; nav + route
// guards are UX only). A paid-module edge function calls assertEntitled() after it resolves the
// target workspace and refuses with a 402 when the workspace doesn't own the module.
import { corsHeaders } from './cors.ts';
import { keyWorkspaceFence } from './request-context.ts';

export async function isWorkspaceEntitled(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workspaceId: string,
  moduleSlug: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_workspace_entitled', {
      p_workspace_id: workspaceId,
      p_module_slug: moduleSlug,
    });
    if (error) {
      console.error(`[entitlement] is_workspace_entitled(${moduleSlug}) failed:`, error.message || error);
      return false; // fail closed
    }
    return data === true;
  } catch (e) {
    console.error(`[entitlement] is_workspace_entitled(${moduleSlug}) threw:`, e);
    return false; // fail closed
  }
}

/** Canonical 402 the frontend can route to an upsell (mirrors the `not_entitled` shape #181 uses). */
export function notEntitledResponse(moduleSlug: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      code: 'not_entitled',
      module: moduleSlug,
      error: `This workspace isn't entitled to the "${moduleSlug}" module. Purchase it to use this feature.`,
    }),
    { status: 402, headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' } },
  );
}

/**
 * A kai_ key's bound workspace; otherwise the user's most recently joined active workspace that owns `moduleSlug`, else the most recent one
 * (so the caller's gate still refuses). Never a bare "newest membership": joining a second workspace
 * would silently move every module call there.
 */
export async function resolveEntitledWorkspace(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  moduleSlug: string,
): Promise<string | null> {
  const fenced = keyWorkspaceFence();
  if (fenced) return fenced;
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });
  const ids: string[] = (data ?? []).map((m: { workspace_id: string }) => m.workspace_id);
  for (const id of ids) {
    if (await isWorkspaceEntitled(supabase, id, moduleSlug)) return id;
  }
  return ids[0] ?? null;
}

/** Convenience: returns `{ ok: true }` or `{ ok: false, response }` ready to return from the handler. */
export async function assertEntitled(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workspaceId: string,
  moduleSlug: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const entitled = await isWorkspaceEntitled(supabase, workspaceId, moduleSlug);
  return entitled ? { ok: true } : { ok: false, response: notEntitledResponse(moduleSlug) };
}
