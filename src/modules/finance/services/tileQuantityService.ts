/**
 * The tile counter's arithmetic, derived once (#436).
 *
 * The cut allowance and the rounding to whole boxes are one SQL derivation, so the quote line, the
 * order line and the picking list cannot give three answers about how much tile is coming.
 */
import { supabase } from '@/integrations/supabase/client';

import type { TileQuantity } from '@/modules/finance/approvalRules';

export type { TileQuantityStatus, TileQuantity } from '@/modules/finance/approvalRules';
export { hasVisibleUplift } from '@/modules/finance/approvalRules';

export const tileQuantityService = {
  /** What this line actually supplies once the allowance and the box size are applied. */
  async forLine(input: {
    productId: string;
    requested: number;
    wastagePercent?: number | null;
    allowBreakPack?: boolean | null;
  }): Promise<TileQuantity> {
    const { data, error } = await supabase.rpc('tile_line_quantity' as never, {
      p_product: input.productId,
      p_requested: input.requested,
      p_wastage_percent: input.wastagePercent ?? null,
      p_allow_break_pack: input.allowBreakPack ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as TileQuantity;
  },
};
