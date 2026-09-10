/** Who a workspace's anonymous work belongs to (#382 Phase 4). */
import type { DbClient } from './supabase-client.ts';

export async function resolveWorkspacePrincipal(
  supabase: DbClient,
  workspaceId: string,
): Promise<string | null> {
  const pick = async (role: 'owner' | 'admin'): Promise<string | null> => {
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, joined_at')
      .eq('workspace_id', workspaceId)
      .eq('role', role)
      .eq('status', 'active')
      // Stable across calls: without an order, "the admin" is whichever row the planner returned
      // first, and the same workspace could attribute two plans to two different people.
      .order('joined_at', { ascending: true })
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
