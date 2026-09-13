/**
 * EU Deforestation Regulation (#449) — Reg. (EU) 2023/1115, applying 30 December 2026.
 *
 * The role is PER GOODS LINE PER MOVEMENT, not per company: the same business can be an operator on
 * a Turkish MDF panel, a trader on an Italian kitchen unit, and a downstream operator on the unit it
 * builds out of the panel. Derived from the CN code and the origin, never hand-set.
 */
import { supabase } from '@/integrations/supabase/client';

import type { EudrOrderLine } from '@/modules/finance/offerSafetyRules';

export type { EudrRole, EudrRoleVerdict, EudrOrderLine } from '@/modules/finance/offerSafetyRules';
export {
  EUDR_APPLIES_FROM, EUDR_OBLIGATIONS, eudrLineNeedsAttention, eudrCollectsCustomerIdentity,
} from '@/modules/finance/offerSafetyRules';

export interface EudrOrderPosition {
  status: 'ok' | 'not_found';
  operator_lines?: number;
  downstream_lines?: number;
  trader_lines?: number;
  unknown_origin_lines?: number;
  lines_without_statement?: number;
  lines?: EudrOrderLine[];
  applies_from?: string;
  reason: string;
}

export interface EudrStatement {
  id: string;
  workspace_id: string;
  origin_of_statement: 'ours' | 'supplier';
  reference_number: string;
  declaration_identifier: string | null;
  /**
   * TRACES issues this alongside the reference. It is NOT a legal artefact — the Regulation names
   * only the reference number and the declaration identifier — so it is named for what it is.
   */
  traces_retrieval_code: string | null;
  submitted_at: string | null;
  hs_code: string | null;
  net_mass_kg: number | null;
  /** The CN supplementary unit. Our stock UoM in m² or pieces is not a substitute for it. */
  supplementary_unit: number | null;
  supplementary_unit_code: string | null;
  order_item_id: string | null;
  product_id: string | null;
  retain_until: string;
}

export const eudrService = {
  /**
   * Where an order stands, line by line.
   *
   * The per-line role comes back with each line, so there is no second single-line reader: two
   * ways to ask "what are we here" is two answers waiting to differ.
   */
  async orderPosition(orderId: string): Promise<EudrOrderPosition> {
    const { data, error } = await supabase.rpc('eudr_order_position' as never, {
      p_order: orderId,
    } as never);
    if (error) throw error;
    return data as unknown as EudrOrderPosition;
  },

  async listStatements(workspaceId: string, orderId?: string): Promise<EudrStatement[]> {
    let q = supabase
      .from('eudr_statements')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (orderId) q = q.eq('order_id', orderId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EudrStatement[];
  },

  async recordStatement(s: Partial<EudrStatement> & { workspace_id: string; reference_number: string }) {
    const { error } = await supabase.from('eudr_statements').insert(s);
    if (error) throw error;
  },
};
