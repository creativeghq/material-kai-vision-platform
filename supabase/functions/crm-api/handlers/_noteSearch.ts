import type { SupabaseClient } from '@supabase/supabase-js';

import type { CrmScope } from './_scope.ts';

/** Ids of the companies/contacts whose CRM notes match an already folded + LIKE-escaped term. */
export async function noteMatchedTargetIds(
  supabase: SupabaseClient,
  kind: 'company' | 'contact',
  safe: string,
  scope: CrmScope,
  limit: number,
): Promise<string[]> {
  let q = supabase
    .from('crm_notes')
    .select('target_id')
    .eq('target_kind', kind)
    .ilike('body_fold', `%${safe}%`)
    .limit(limit);
  if (!scope.isGlobalOperator) q = q.in('workspace_id', scope.workspaceIds);
  const { data } = await q;
  return [...new Set((data ?? []).map((n: { target_id: string }) => n.target_id).filter(Boolean))];
}
