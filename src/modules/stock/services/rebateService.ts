/**
 * Supplier rebates (#425).
 *
 * You buy at list and accrue an expected retrospective claim per supplier per period. Reported
 * margin is wrong on every line where one exists — pessimistic, predictably, which is why the
 * sales team prices off it and nothing raises.
 */
import { supabase } from '@/integrations/supabase/client';

import type { RebatePosition, ClaimStatus } from '@/modules/stock/rebateRules';

export type { RebateStatus, ClaimStatus, RebatePosition } from '@/modules/stock/rebateRules';
export {
  CLAIM_LABEL, rebateIsBanked, crossingIsWorth, rebateNeedsAttention,
} from '@/modules/stock/rebateRules';

export interface RebateAgreement {
  id: string;
  workspace_id: string;
  supplier_company_id: string;
  name: string;
  basis: 'value' | 'quantity';
  period_start: string;
  period_end: string;
  is_retrospective: boolean;
  is_active: boolean;
  supplier?: { name: string | null } | null;
}

export interface RebateBand {
  id: string;
  agreement_id: string;
  threshold_from: number;
  threshold_to: number | null;
  percent: number | null;
  per_unit_amount: number | null;
}

export interface RebateClaim {
  id: string;
  agreement_id: string;
  period_start: string;
  period_end: string;
  status: ClaimStatus;
  expected_amount: number | null;
  settled_amount: number | null;
  claimed_on: string | null;
  settled_on: string | null;
  reference: string | null;
}

export const rebateService = {
  async listAgreements(workspaceId: string): Promise<RebateAgreement[]> {
    const { data, error } = await supabase
      .from('supplier_rebate_agreements')
      .select('*, supplier:crm_companies(name)')
      .eq('workspace_id', workspaceId)
      .order('period_start', { ascending: false });
    if (error) throw error;
    return (data ?? []) as RebateAgreement[];
  },

  async bandsFor(agreementId: string): Promise<RebateBand[]> {
    const { data, error } = await supabase
      .from('supplier_rebate_bands')
      .select('*')
      .eq('agreement_id', agreementId)
      .order('threshold_from');
    if (error) throw error;
    return (data ?? []) as RebateBand[];
  },

  /** The accrual to date, including the retrospective uplift when a band is crossed. */
  async position(agreementId: string, asOf?: string): Promise<RebatePosition> {
    const { data, error } = await supabase.rpc('supplier_rebate_position' as never, {
      p_agreement: agreementId,
      p_as_of: asOf ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as RebatePosition;
  },

  async listClaims(workspaceId: string): Promise<RebateClaim[]> {
    const { data, error } = await supabase
      .from('supplier_rebate_claims')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('period_end', { ascending: false });
    if (error) throw error;
    return (data ?? []) as RebateClaim[];
  },

  /**
   * Raise or advance a claim.
   *
   * The four states are one quantity, so the claim carries the accrual it was raised on rather
   * than re-deriving it later against a period that has since moved on.
   */
  async saveClaim(c: Partial<RebateClaim> & { workspace_id: string; agreement_id: string }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('supplier_rebate_claims')
      .upsert({ ...c, created_by: auth?.user?.id ?? null }, { onConflict: 'id' });
    if (error) throw error;
  },
};
