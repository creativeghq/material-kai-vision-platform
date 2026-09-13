/**
 * One approval spine for credit holds, margin floors and till variances (#426, #435).
 *
 * They are the same three questions — is this allowed, who may wave it through, and who signed —
 * so they share one policy table, one request table and one set of verdicts. Every verdict is
 * derived in SQL and enforced at the write; this formats the answer and records the signature.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  ApprovalSubject, ApprovalAction, CreditVerdict, MarginVerdict,
} from '@/modules/finance/approvalRules';

export type {
  ApprovalSubject, ApprovalAction, ApprovalDecision, CreditVerdict, MarginVerdict,
} from '@/modules/finance/approvalRules';
export { verdictStops, verdictIsApprovable, SUBJECT_LABEL } from '@/modules/finance/approvalRules';

export interface ApprovalPolicy {
  id: string;
  workspace_id: string;
  subject: ApprovalSubject;
  workspace_role: string | null;
  band_from: number;
  band_to: number | null;
  action: ApprovalAction;
  approver_role: string | null;
  min_margin_percent: number | null;
  max_discount_percent: number | null;
  grace_days: number | null;
  grace_basis: 'calendar' | 'working' | null;
  is_active: boolean;
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  subject: ApprovalSubject;
  entity_table: string;
  entity_id: string;
  amount: number | null;
  context: Record<string, unknown>;
  requested_by: string | null;
  requested_at: string;
  request_reason: string | null;
  status: 'pending' | 'approved' | 'declined';
  approver_role: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

export const approvalService = {
  /** What credit control says about placing this amount on this account today. */
  async creditVerdict(input: {
    workspaceId: string;
    companyId?: string | null;
    contactId?: string | null;
    amount: number;
    role?: string | null;
  }): Promise<CreditVerdict> {
    const { data, error } = await supabase.rpc('credit_control_verdict' as never, {
      p_workspace: input.workspaceId,
      p_company: input.companyId ?? null,
      p_contact: input.contactId ?? null,
      p_amount: input.amount,
      p_role: input.role ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as CreditVerdict;
  },

  /** What this user's margin authority says about this line. */
  async marginVerdict(input: {
    workspaceId: string;
    role?: string | null;
    unitPrice: number;
    unitCost: number | null;
    quantity?: number;
    discountPct?: number;
    referenceMarginPercent?: number | null;
  }): Promise<MarginVerdict> {
    const { data, error } = await supabase.rpc('margin_floor_verdict' as never, {
      p_workspace: input.workspaceId,
      p_role: input.role ?? null,
      p_unit_price: input.unitPrice,
      p_unit_cost: input.unitCost,
      p_quantity: input.quantity ?? 1,
      p_discount_pct: input.discountPct ?? 0,
      p_reference_margin_percent: input.referenceMarginPercent ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as MarginVerdict;
  },

  async listPolicies(workspaceId: string): Promise<ApprovalPolicy[]> {
    const { data, error } = await supabase
      .from('approval_policies')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('subject')
      .order('band_from');
    if (error) throw error;
    return (data ?? []) as ApprovalPolicy[];
  },

  async savePolicy(p: Partial<ApprovalPolicy> & { workspace_id: string; subject: ApprovalSubject }) {
    const { error } = await supabase.from('approval_policies').upsert(p, { onConflict: 'id' });
    if (error) throw error;
  },

  async deletePolicy(id: string) {
    const { error } = await supabase.from('approval_policies').delete().eq('id', id);
    if (error) throw error;
  },

  async listRequests(workspaceId: string, status?: ApprovalRequest['status']): Promise<ApprovalRequest[]> {
    let q = supabase
      .from('approval_requests')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('requested_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ApprovalRequest[];
  },

  /** Raise one. The verdict that refused the write is carried as the context the approver reads. */
  async request(input: {
    workspaceId: string;
    subject: ApprovalSubject;
    entityTable: string;
    entityId: string;
    amount?: number | null;
    context?: Record<string, unknown>;
    reason?: string;
    approverRole?: string | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('approval_requests').insert({
      workspace_id: input.workspaceId,
      subject: input.subject,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      amount: input.amount ?? null,
      context: input.context ?? {},
      request_reason: input.reason ?? null,
      approver_role: input.approverRole ?? null,
      requested_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  /**
   * Sign one.
   *
   * `decided_by` and `decided_at` are written here and a CHECK refuses a decided row without
   * them — an override nobody signed is the finding, not the block.
   */
  async decide(id: string, approve: boolean, reason: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('approval_requests')
      .update({
        status: approve ? 'approved' : 'declined',
        decided_by: auth?.user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_reason: reason,
      })
      .eq('id', id);
    if (error) throw error;
  },
};
