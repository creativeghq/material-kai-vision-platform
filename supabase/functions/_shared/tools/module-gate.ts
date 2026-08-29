/**
 * "May this workspace use this module?" — asked once, by every agent tool that needs it (#395).
 *
 * `_shared/entitlement.ts` states the doctrine for edge handlers: *module entitlement enforcement
 * at the API boundary is the real security line; nav and route guards are UX only.* Agent tools
 * are an API boundary — a tool call reaches the same tables the page does, without passing the
 * page's `EntitlementGuard` — and half of them were not asking.
 *
 * MEASURED 2026-08-29: of the 19 tool files whose catalog entry declares a paid `moduleSlug`, 9
 * checked entitlement and 10 did not. Five of the unchecked ones asked only `modules.enabled` —
 * the PLATFORM-WIDE publish flag, which is true for everyone — so they read like a gate and
 * refuse nobody. At that moment three of the four non-root workspaces were not entitled to
 * Catalogs, Deals, Expenses, Job Research, Mention Monitoring or Price Monitoring, and could use
 * every one of them by asking the agent. The nav tile was hidden the whole time, which is exactly
 * why nothing looked wrong.
 *
 * BOTH HALVES OR NEITHER. `modules.enabled` is the operator's kill switch for a feature nobody
 * should be using yet; `is_workspace_entitled` is whether THIS tenant bought it. Checking only
 * the first is the shape described above. Checking only the second lets a workspace keep using a
 * module the operator has pulled.
 *
 * Returns the refusal STRING a tool returns verbatim, or `null` to proceed — so a call site is
 * two lines and cannot accidentally continue:
 *
 *     const denied = await moduleGate(workspaceId, 'presentation-catalogs');
 *     if (denied) return denied;
 *
 * FAILS CLOSED. A DB error here means we cannot establish entitlement, and serving on a maybe is
 * how a paid module leaks.
 */

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
