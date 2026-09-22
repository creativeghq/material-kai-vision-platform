/**
 * The απογραφή and the pre-filled VAT reconciliation (#452, #445).
 *
 * Both are asymmetric rules with an expensive direction. The stocktake is a legal record AND a
 * myDATA submission; the VAT pre-fill forfeits the deduction on a breach rather than warning.
 */
import { supabase } from '@/integrations/supabase/client';

import type { RollForward, PrefillVerdict, MeasurementMethod } from '@/modules/finance/greekComplianceRules';
import type { VatReturnSnapshot } from '@/modules/finance/vatReturn';

export type {
  RollForwardStatus, RollForward, MeasurementMethod,
  SideStatus, PrefillStatus, PrefillVerdict,
} from '@/modules/finance/greekComplianceRules';
export {
  MEASUREMENT_LABEL, thirdPartyLineMayBeValued, rollForwardIncomplete,
  incomeBreaches, expenseBreaches, deviationIsDeclared, DEVIATION_DOCUMENT, prefillBlocks,
} from '@/modules/finance/greekComplianceRules';

export interface ApografiRecord {
  id: string;
  workspace_id: string;
  counted_on: string;
  reference_date: string;
  fiscal_year: number;
  kind: 'opening' | 'closing';
  status: 'draft' | 'final' | 'transmitted';
  transmitted_at: string | null;
}

export interface ApografiLine {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  is_third_party: boolean;
  unit_value: number | null;
  total_value: number | null;
  measurement_method: MeasurementMethod;
  secondary_quantity: number | null;
  secondary_unit: string | null;
}

export interface VatPrefillPeriod {
  id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  mydata_income: number | null;
  mydata_expenses: number | null;
  declared_income: number | null;
  declared_expenses: number | null;
  status: 'draft' | 'reconciled' | 'submitted';
  submitted_at?: string | null;
}

export interface PrefillDeviation {
  id: string;
  side: 'income' | 'expense';
  amount: number;
  document_type: string;
  characterisation: string;
  mydata_mark: string | null;
  emitted_at: string | null;
}

export const greekComplianceService = {
  async apografiRecords(workspaceId: string): Promise<ApografiRecord[]> {
    const { data, error } = await supabase
      .from('apografi_records')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('reference_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ApografiRecord[];
  },

  async apografiLines(recordId: string): Promise<ApografiLine[]> {
    const { data, error } = await supabase
      .from('apografi_lines')
      .select('*')
      .eq('record_id', recordId)
      .order('description');
    if (error) throw error;
    return (data ?? []) as ApografiLine[];
  },

  /**
   * Open a stocktake with its two dates apart.
   *
   * Άρθρο 6 §2 replaced the old fixed ΚΒΣ deadline with a standard of reliability, and keeping the
   * count date separate from the reference date is what makes cycle counting legal.
   */
  async openApografi(input: {
    workspaceId: string; countedOn: string; referenceDate: string;
    fiscalYear: number; kind?: 'opening' | 'closing';
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('apografi_records').insert({
      workspace_id: input.workspaceId,
      counted_on: input.countedOn,
      reference_date: input.referenceDate,
      fiscal_year: input.fiscalYear,
      kind: input.kind ?? 'closing',
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  /** What moved between the count and the reference date. */
  async rollForward(recordId: string): Promise<RollForward> {
    const { data, error } = await supabase.rpc('apografi_roll_forward' as never, {
      p_record: recordId,
    } as never);
    if (error) throw error;
    return data as unknown as RollForward;
  },

  async vatReturn(workspaceId: string, from: string, to: string): Promise<VatReturnSnapshot> {
    const { data, error } = await supabase.rpc('get_vat_return_period' as never, {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    } as never);
    if (error) throw error;
    return data as unknown as VatReturnSnapshot;
  },

  async openVatReturn(workspaceId: string, from: string, to: string, refreshDeclared = true): Promise<string> {
    const { data, error } = await supabase.rpc('open_vat_return_period' as never, {
      p_workspace_id: workspaceId, p_from: from, p_to: to, p_refresh_declared: refreshDeclared,
    } as never);
    if (error) throw error;
    return data as unknown as string;
  },

  async setVatReturnStatus(periodId: string, status: 'draft' | 'reconciled' | 'submitted') {
    const { data, error } = await supabase.rpc('set_vat_return_status' as never, {
      p_period: periodId, p_status: status,
    } as never);
    if (error) throw error;
    return data as unknown as { outcome: string; submitted_at?: string };
  },

  async vatPeriods(workspaceId: string): Promise<VatPrefillPeriod[]> {
    const { data, error } = await supabase
      .from('vat_prefill_periods')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('period_start', { ascending: false });
    if (error) throw error;
    return (data ?? []) as VatPrefillPeriod[];
  },

  /** Floor on income, ceiling on expenses, and what a breach actually costs. */
  async vatVerdict(periodId: string): Promise<PrefillVerdict> {
    const { data, error } = await supabase.rpc('vat_prefill_verdict' as never, {
      p_period: periodId,
    } as never);
    if (error) throw error;
    return data as unknown as PrefillVerdict;
  },

  async deviations(periodId: string): Promise<PrefillDeviation[]> {
    const { data, error } = await supabase
      .from('vat_prefill_deviations')
      .select('*')
      .eq('period_id', periodId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as PrefillDeviation[];
  },

  /**
   * Record a deviation to be declared.
   *
   * It is NOT declared until it carries a MARK: the escape hatch is an emitted document, so a row
   * with no mark is a difference somebody wrote down and the deduction is still forfeit.
   */
  async recordDeviation(input: {
    workspaceId: string; periodId: string; side: 'income' | 'expense';
    amount: number; notes?: string;
  }) {
    const doc = input.side === 'income'
      ? { type: '11.4', characterisation: '1.95' }
      : { type: '14.30', characterisation: '2.4' };
    const { error } = await supabase.from('vat_prefill_deviations').insert({
      workspace_id: input.workspaceId,
      period_id: input.periodId,
      side: input.side,
      amount: input.amount,
      document_type: doc.type,
      characterisation: doc.characterisation,
      series_note: 'par. 2 ar.15A KFD',
      notes: input.notes ?? null,
    });
    if (error) throw error;
  },
};
