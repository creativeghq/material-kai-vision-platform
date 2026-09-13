/**
 * Inventory value and COGS (#421).
 *
 * Stock was a quantity and not a value, so neither figure could be derived at all and gross margin
 * read `price − products.cost` — today's cost, not the cost of the goods that actually left. Both
 * are one SQL derivation now; this formats them.
 */
import { supabase } from '@/integrations/supabase/client';

import type { InventoryValue, CogsResult, ValuationMethod } from '@/modules/stock/stockValuationRules';

export type { ValuationMethod, InventoryValue, CogsResult } from '@/modules/stock/stockValuationRules';
export {
  METHOD_LABEL, valuationIsPartial, formatValuation, methodChangeRewritesHistory,
} from '@/modules/stock/stockValuationRules';

export const stockValuationService = {
  /** What is on the shelves, and what could not be valued. */
  async inventoryValue(workspaceId: string, asOf?: string, warehouseId?: string | null): Promise<InventoryValue> {
    const { data, error } = await supabase.rpc('stock_inventory_value' as never, {
      p_workspace: workspaceId,
      p_as_of: asOf ?? null,
      p_warehouse: warehouseId ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as InventoryValue;
  },

  /** What left, at what it cost when it left. */
  async cogs(workspaceId: string, from: string, to?: string | null): Promise<CogsResult> {
    const { data, error } = await supabase.rpc('stock_cogs' as never, {
      p_workspace: workspaceId,
      p_from: from,
      p_to: to ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as CogsResult;
  },

  /** The method in force, and the dated trail of how it got there. */
  async methodHistory(workspaceId: string) {
    const { data, error } = await supabase
      .from('stock_valuation_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return (data ?? []) as {
      workspace_id: string; effective_from: string; method: ValuationMethod; note: string | null;
    }[];
  },

  /**
   * Record a method change, from a date.
   *
   * A row per change rather than a column somebody edits, because the method decides what every
   * past issue cost — "what were we using in March" has to have an answer.
   */
  async setMethod(workspaceId: string, method: ValuationMethod, effectiveFrom: string, note?: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('stock_valuation_settings').insert({
      workspace_id: workspaceId,
      method,
      effective_from: effectiveFrom,
      note: note ?? null,
      changed_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },
};
