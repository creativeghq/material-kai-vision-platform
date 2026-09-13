/**
 * Whether the INTRASTAT return is owed, and from when (#451).
 *
 * The verdict is derived in SQL over the SAME scope the declaration lines come from, so "have we
 * crossed" and "what do we declare" cannot answer from two different worlds.
 */
import { supabase } from '@/integrations/supabase/client';

import type { IntrastatObligation, IntrastatFlow } from '@/modules/finance/intrastatRules';

export type {
  IntrastatFlow, IntrastatStatus, IntrastatMonth, IntrastatFlowVerdict, IntrastatObligation,
} from '@/modules/finance/intrastatRules';
export {
  INTRASTAT_STATUS_LABEL, FLOW_LABEL, obligationIsUnknown, intrastatNeedsAttention, isObliged,
  SUGGESTED_THRESHOLD, THRESHOLD_SOURCE_NOTE, RELATED_OBLIGATIONS,
} from '@/modules/finance/intrastatRules';

export interface IntrastatThreshold {
  id: string;
  flow: IntrastatFlow;
  threshold_amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  source_note: string | null;
  confirmed_on: string | null;
}

export const intrastatObligationService = {
  async obligation(workspaceId: string, year?: number): Promise<IntrastatObligation> {
    const { data, error } = await supabase.rpc('intrastat_obligation' as never, {
      p_workspace_id: workspaceId, p_year: year ?? null, p_flow: null,
    } as never);
    if (error) throw error;
    return data as unknown as IntrastatObligation;
  },

  async thresholds(workspaceId: string): Promise<IntrastatThreshold[]> {
    const { data, error } = await supabase
      .from('intrastat_thresholds')
      .select('id, flow, threshold_amount, currency, effective_from, effective_to, source_note, confirmed_on')
      .eq('workspace_id', workspaceId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as IntrastatThreshold[];
  },

  /** Same rule as the depreciation rate: a revision closes the old row rather than editing it. */
  async recordThreshold(input: {
    workspaceId: string;
    flow: IntrastatFlow;
    amount: number;
    effectiveFrom: string;
    sourceNote?: string | null;
    confirmedOn?: string | null;
  }): Promise<void> {
    const { error: closeError } = await supabase
      .from('intrastat_thresholds')
      .update({ effective_to: input.effectiveFrom })
      .eq('workspace_id', input.workspaceId)
      .eq('flow', input.flow)
      .is('effective_to', null)
      .lt('effective_from', input.effectiveFrom);
    if (closeError) throw closeError;

    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('intrastat_thresholds').insert({
      workspace_id: input.workspaceId,
      flow: input.flow,
      threshold_amount: input.amount,
      effective_from: input.effectiveFrom,
      source_note: input.sourceNote ?? null,
      confirmed_on: input.confirmedOn ?? null,
      confirmed_by: input.confirmedOn ? (auth?.user?.id ?? null) : null,
    });
    if (error) throw error;
  },
};
