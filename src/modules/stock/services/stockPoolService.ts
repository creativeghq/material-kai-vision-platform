/**
 * The tile stock cube: lot × tone × calibre × grade × packaging (#420).
 *
 * "Available" is the largest single homogeneous pool, derived in SQL, never a sum over the SKU.
 */
import { supabase } from '@/integrations/supabase/client';

import type { HomogeneousAvailability } from '@/modules/stock/stockPoolRules';

export type { HomogeneousStatus, HomogeneousAvailability } from '@/modules/stock/stockPoolRules';
export { wouldMixPools, describePool, promisableQuantity } from '@/modules/stock/stockPoolRules';

export interface StockPool {
  id: string;
  item_id: string;
  lot_code: string;
  tone_code: string;
  calibre_code: string;
  grade: string;
  packaging: string;
  is_opened_pack: boolean;
  qty_on_hand: number;
  qty_reserved: number;
  first_received_at: string | null;
  item?: { name: string | null; sku: string | null; unit: string | null } | null;
}

export const stockPoolService = {
  /**
   * The same question from a quote line, which knows a product rather than a shelf.
   *
   * A product can be stocked in several warehouses and a pool lives in one of them, so the answer
   * is the biggest single pool anywhere — never the total across warehouses, which is the same
   * optimism one layer up.
   */
  async availabilityForProduct(
    workspaceId: string, productId: string, quantity?: number, allowOpened = false,
  ): Promise<HomogeneousAvailability> {
    const { data, error } = await supabase.rpc('available_homogeneous_for_product' as never, {
      p_workspace: workspaceId,
      p_product: productId,
      p_quantity: quantity ?? null,
      p_allow_opened: allowOpened,
    } as never);
    if (error) throw error;
    return data as unknown as HomogeneousAvailability;
  },

  /**
   * Every pool on the shelves, biggest first.
   *
   * The operator's question is "what lots do we actually hold", not "what lots does this SKU have"
   * — a SKU with one lot is not interesting and a SKU with five is where the trouble is.
   */
  async poolsForWorkspace(workspaceId: string): Promise<StockPool[]> {
    const { data, error } = await supabase
      .from('stock_pools')
      .select('*, item:warehouse_items(name, sku, unit)')
      .eq('workspace_id', workspaceId)
      .gt('qty_on_hand', 0)
      .order('qty_on_hand', { ascending: false });
    if (error) throw error;
    return (data ?? []) as StockPool[];
  },
};
