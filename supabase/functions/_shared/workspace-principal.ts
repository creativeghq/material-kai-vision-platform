/**
 * Who a workspace's anonymous work belongs to (#382 Phase 4).
 *
 * THE PROBLEM. Two paths on the embed surface act on a workspace with nobody signed in — an AI
 * impression has to be billed to somebody's credit pool, and a plan created from a visitor's
 * configuration has to satisfy `project_plans.user_id NOT NULL`. Neither has a caller to
 * attribute it to, so both have to derive one.
 *
 * WHY IT IS A LADDER AND NOT `role = 'owner'`. That was the first version, in both places, and it
 * fails silently on a workspace that has no owner ROW — which is not hypothetical: measured
 * 2026-08-23, one of this platform's four workspaces has exactly one member, an `admin`, and no
 * owner at all. `visualize` had been answering `no_billable_owner` there since it shipped, which
 * reads to a merchant as "the AI impression feature does not work" and to us as nothing, because
 * a 200 with `available:false` is a successful response.
 *
 * WHY IT IS ONE FUNCTION. The two callers were about to hold two opinions about the same
 * question, which is the shape this platform keeps paying for. Anything else needing "whose
 * workspace is this, for something a stranger triggered" reads it here.
 *
 * ORDER MATTERS AND IS DELIBERATE:
 *   1. an active OWNER — the person whose workspace it is;
 *   2. else the earliest active ADMIN — they can already spend and administer the workspace, so
 *      attributing to them grants nothing they did not have;
 *   3. else `workspaces.created_by` — the last resort, and the only answer that survives a
 *      workspace whose membership rows were never written.
 *
 * Returns null only when all three are empty, which means the workspace has no human at all. The
 * caller must treat that as "do not proceed", never as "proceed anonymously".
 */
import type { DbClient } from './supabase-client.ts';

export async function resolveWorkspacePrincipal(
  supabase: DbClient,
  workspaceId: string,
): Promise<string | null> {
  const pick = async (role: 'owner' | 'admin'): Promise<string | null> => {
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('role', role)
      .eq('status', 'active')
      // Stable across calls: without an order, "the admin" is whichever row the planner returned
      // first, and the same workspace could attribute two plans to two different people.
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  };

  const owner = await pick('owner');
  if (owner) return owner;

  const admin = await pick('admin');
  if (admin) return admin;

  const { data: ws } = await supabase
    .from('workspaces')
    .select('created_by')
    .eq('id', workspaceId)
    .maybeSingle();
  return (ws?.created_by as string | undefined) ?? null;
}
