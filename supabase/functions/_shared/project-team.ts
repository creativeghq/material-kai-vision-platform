/** Edge twin of SQL `_user_is_project_team`: the owner, or a project member who is an ACTIVE member of its workspace. */
import type { DbClient } from './supabase-client.ts';
import { userHasWorkspaceCapability } from './auth.ts';

export async function userIsProjectTeam(
  supabase: DbClient,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data: p, error } = await supabase
    .from('projects').select('id, user_id, workspace_id').eq('id', projectId).maybeSingle();
  if (error || !p) return false;
  const project = p as { user_id: string | null; workspace_id: string };
  if (project.user_id === userId) return true;
  const [{ data: pm }, { data: wm }] = await Promise.all([
    supabase.from('project_members').select('user_id')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    supabase.from('workspace_members').select('user_id')
      .eq('workspace_id', project.workspace_id).eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  return !!pm && !!wm;
}

/** Edge twin of SQL `_user_sees_project_money`: a finance operator, or a manager of the project holding finance.manage. */
export async function userSeesProjectMoney(
  supabase: DbClient,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data: p, error } = await supabase
    .from('projects').select('id, user_id, workspace_id').eq('id', projectId).maybeSingle();
  if (error || !p) return false;
  const project = p as { user_id: string | null; workspace_id: string };
  if (await userHasWorkspaceCapability(supabase, userId, project.workspace_id, 'finance.operate')) return true;
  if (!(await userHasWorkspaceCapability(supabase, userId, project.workspace_id, 'finance.manage'))) return false;
  if (project.user_id === userId) return true;
  const [{ data: pm }, { data: wm }] = await Promise.all([
    supabase.from('project_members').select('user_id')
      .eq('project_id', projectId).eq('user_id', userId).eq('role', 'manager').maybeSingle(),
    supabase.from('workspace_members').select('user_id')
      .eq('workspace_id', project.workspace_id).eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  return !!pm && !!wm;
}
