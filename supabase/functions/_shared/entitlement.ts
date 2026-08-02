// Module entitlement enforcement at the API boundary (the real security line; nav + route
// guards are UX only). A paid-module edge function calls assertEntitled() after it resolves the
// target workspace and refuses with a 402 when the workspace doesn't own the module.
//   const ent = await assertEntitled(supabase, workspaceId, 'sales-finance');
//   if (!ent.ok) return ent.response;
// is_workspace_entitled(workspace, slug) returns true for the operator root (gets everything) OR
// when a workspace_module_entitlements grant exists. Fails CLOSED on error — this is a security
// gate, and a DB error that breaks this check would break the operation anyway.
import { corsHeaders } from './cors.ts';

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
