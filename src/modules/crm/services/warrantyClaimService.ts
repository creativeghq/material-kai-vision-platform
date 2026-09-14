/**
 * Warranty claims, their money outcome, and the rework rate behind them (#437).
 *
 * Every verdict is derived in SQL. The cause is what decides the money, and it is never inferred:
 * a claim nobody has classified reports `unclassified`, because defaulting it to our own cost
 * writes off the supplier recoveries.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  WarrantyClaim, ClaimPosition, ReworkRate, TaskGate, ClaimCause, ClaimStatus, Urgency,
  WorkerCertification,
} from '@/modules/crm/warrantyClaimRules';

export type {
  ClaimCause, MoneyOutcome, CallbackWindow, ClaimStatus, Urgency, ReworkRateStatus,
  WarrantyClaim, ClaimPosition, ReworkRow, ReworkRate, TaskGate, WorkerCertification,
} from '@/modules/crm/warrantyClaimRules';
export {
  CAUSE_LABEL, OUTCOME_LABEL, WINDOW_LABEL, URGENCY_LABEL, CLAIM_STATUS_LABEL,
  causeIsDecided, outcomeIsUnknown, claimNeedsWork, supplierPackIsComplete, isInsideWindow,
  reworkRateIsTrustworthy, taskGateBlocks, SERVICE_CALLBACK_DAYS, INSTALLATION_CALLBACK_DAYS,
  REASON_IS_AN_ANSWER, RETROSPECTIVE_ATTACH, certificationState, CERTIFICATION_STATE_LABEL,
} from '@/modules/crm/warrantyClaimRules';

const CLAIM_COLUMNS =
  'id, reference, description, reported_on, installed_on, serviced_on, urgency, cause, status, '
  + 'order_item_id, stock_pool_id, installer_employee_id, trade_partner_company_id, rework_hours, '
  + 'chargeable_amount, supplier_claim_id';

export const warrantyClaimService = {
  async listForCompany(workspaceId: string, companyId: string): Promise<WarrantyClaim[]> {
    const { data, error } = await supabase
      .from('warranty_claims')
      .select(CLAIM_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('customer_company_id', companyId)
      .order('reported_on', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as WarrantyClaim[];
  },

  async position(claimId: string): Promise<ClaimPosition> {
    const { data, error } = await supabase.rpc('warranty_claim_position' as never, {
      p_claim: claimId,
    } as never);
    if (error) throw error;
    return data as unknown as ClaimPosition;
  },

  async reworkRate(workspaceId: string, from?: string, to?: string): Promise<ReworkRate> {
    const { data, error } = await supabase.rpc('installer_rework_rate' as never, {
      p_workspace: workspaceId, p_from: from ?? null, p_to: to ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as ReworkRate;
  },

  async taskGate(taskId: string): Promise<TaskGate> {
    const { data, error } = await supabase.rpc('project_task_completion_gate' as never, {
      p_task: taskId,
    } as never);
    if (error) throw error;
    return data as unknown as TaskGate;
  },

  async create(input: {
    workspaceId: string;
    customerCompanyId?: string | null;
    description: string;
    urgency?: Urgency;
    orderId?: string | null;
    orderItemId?: string | null;
    productId?: string | null;
    installedOn?: string | null;
    servicedOn?: string | null;
  }): Promise<string> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('warranty_claims').insert({
      workspace_id: input.workspaceId,
      customer_company_id: input.customerCompanyId ?? null,
      description: input.description,
      urgency: input.urgency ?? 'normal',
      order_id: input.orderId ?? null,
      order_item_id: input.orderItemId ?? null,
      product_id: input.productId ?? null,
      // Retrospective on purpose: a claim raised six months later still attaches to the job it
      // came from, which is the only way the rework rate stays true.
      installed_on: input.installedOn ?? null,
      serviced_on: input.servicedOn ?? null,
      created_by: auth?.user?.id ?? null,
    }).select('id').single();
    if (error) throw error;
    return data.id as string;
  },

  /** The cause is a DECISION, so recording it stamps who decided and when. */
  async setCause(claimId: string, cause: ClaimCause): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('warranty_claims').update({
      cause,
      cause_decided_by: auth?.user?.id ?? null,
      cause_decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', claimId);
    if (error) throw error;
  },

  async assign(claimId: string, to: {
    installerEmployeeId?: string | null; tradePartnerCompanyId?: string | null;
  }): Promise<void> {
    const { error } = await supabase.from('warranty_claims').update({
      installer_employee_id: to.installerEmployeeId ?? null,
      trade_partner_company_id: to.tradePartnerCompanyId ?? null,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    }).eq('id', claimId);
    if (error) throw error;
  },

  /** Certification and insurance expiry on the people who fit (#437). Verified market gap: no
   *  FSM vendor tracks it, and Klipboard's "licence checks" are DRIVING licences. */
  async certifications(workspaceId: string): Promise<WorkerCertification[]> {
    const { data, error } = await supabase
      .from('worker_certifications')
      .select('id, employee_id, company_id, kind, reference, issued_on, expires_on, remind_days_before')
      .eq('workspace_id', workspaceId)
      .order('expires_on', { nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as unknown as WorkerCertification[];
  },

  async saveCertification(input: {
    workspaceId: string;
    employeeId?: string | null;
    companyId?: string | null;
    kind: string;
    reference?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    remindDaysBefore?: number;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('worker_certifications').insert({
      workspace_id: input.workspaceId,
      employee_id: input.employeeId ?? null,
      company_id: input.companyId ?? null,
      kind: input.kind,
      reference: input.reference ?? null,
      issued_on: input.issuedOn ?? null,
      expires_on: input.expiresOn ?? null,
      remind_days_before: input.remindDaysBefore ?? 30,
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  async setStatus(claimId: string, status: ClaimStatus, resolution?: string | null): Promise<void> {
    const { error } = await supabase.from('warranty_claims').update({
      status, resolution: resolution ?? null, updated_at: new Date().toISOString(),
    }).eq('id', claimId);
    if (error) throw error;
  },
};
