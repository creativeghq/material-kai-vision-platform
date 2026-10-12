/** "May this workspace use this module?" — asked once, by every agent tool that needs it (#395). */

import { serviceClient as svcClient } from '../supabase-client.ts';

function refuse(error: string, moduleSlug: string): string {
  // `code` mirrors the 402 `not_entitled` shape the handlers use, so a card can offer the upsell
  // rather than printing a sentence about modules at somebody who cannot act on it.
  return JSON.stringify({ success: false, code: 'not_entitled', module: moduleSlug, error });
}

/**
 * @param workspaceId The workspace resolved from the verified JWT — never a model-supplied id.
 * @param moduleSlug  The `public.modules.slug` this tool's feature belongs to.
 * @returns `null` when the call may proceed, otherwise the JSON string to return.
 */
export async function moduleGate(
  workspaceId: string | null | undefined,
  moduleSlug: string,
): Promise<string | null> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb
      .from('modules')
      .select('enabled, name')
      .eq('slug', moduleSlug)
      .maybeSingle();
    const label = (mod as { name?: string } | null)?.name || moduleSlug;
    if (!mod?.enabled) {
      return refuse(`The ${label} module is not enabled on this platform.`, moduleSlug);
    }
    if (!workspaceId) {
      // No workspace = nothing to check entitlement against. Refusing is the only honest answer;
      // proceeding would be the "unresolved verdict serves the data" mistake.
      return refuse('No active workspace for the current user.', moduleSlug);
    }
    const { data: entitled, error } = await sb.rpc('is_workspace_entitled', {
      p_workspace_id: workspaceId,
      p_module_slug: moduleSlug,
    });
    if (error) {
      console.error(`[module-gate] is_workspace_entitled(${moduleSlug}) failed:`, error.message || error);
      return refuse(`Could not verify access to ${label}.`, moduleSlug);
    }
    if (entitled !== true) {
      return refuse(
        `This workspace has not activated ${label}. Enable it under Profile → Modules.`,
        moduleSlug,
      );
    }
    return null;
  } catch (e) {
    console.error(`[module-gate] ${moduleSlug} threw:`, e);
    return refuse(`Could not verify access to the ${moduleSlug} module.`, moduleSlug);
  }
}

export type WorkspaceRolePredicate = 'is_workspace_finance_viewer' | 'is_workspace_sell_side';

const REFUSAL: Record<WorkspaceRolePredicate, string> = {
  is_workspace_finance_viewer: 'These figures are finance data — only the workspace owner, an admin or the accountant can read them.',
  is_workspace_sell_side: 'Costs and margins are internal — a client or supplier account cannot read them.',
};

type RpcCapable = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function roleGate(
  db: RpcCapable,
  workspaceId: string,
  predicate: WorkspaceRolePredicate,
): Promise<string | null> {
  const { data, error } = await db.rpc(predicate, { p_workspace_id: workspaceId });
  if (error) return JSON.stringify({ success: false, error: `Could not check your role: ${error.message}` });
  return data === true ? null : JSON.stringify({ success: false, error: REFUSAL[predicate] });
}
