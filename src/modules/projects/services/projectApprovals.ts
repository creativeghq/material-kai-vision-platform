import { supabase } from '@/integrations/supabase/client';
import { approvalService } from '@/modules/finance/services/approvalService';

export const isApprovalRefusal = (e: unknown): boolean =>
  /needs a signed approval/i.test((e as Error | undefined)?.message ?? '');

/** Raises one pending request for the item unless one is already waiting. */
export async function raiseProjectApproval(input: {
  workspaceId: string;
  subject: 'project_variation' | 'project_application';
  table: 'project_variations' | 'project_applications';
  id: string;
  amount: number;
  reason: string;
}): Promise<'raised' | 'already_pending'> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('subject', input.subject)
    .eq('entity_table', input.table)
    .eq('entity_id', input.id)
    .eq('status', 'pending')
    .limit(1);
  if (error) throw error;
  if ((data ?? []).length > 0) return 'already_pending';
  await approvalService.request({
    workspaceId: input.workspaceId,
    subject: input.subject,
    entityTable: input.table,
    entityId: input.id,
    amount: Math.abs(input.amount),
    reason: input.reason,
  });
  return 'raised';
}
