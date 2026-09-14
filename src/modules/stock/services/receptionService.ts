/**
 * Back-to-back ordering and the reception report (#433).
 *
 * `receive_order_lines` moved the goods in and nothing decided whose they were. This is the half
 * that decides — oldest confirmed first, and per POOL on tile, because the pallet that landed is
 * one tone and one calibre.
 */
import { supabase } from '@/integrations/supabase/client';

import type { ReceptionReport } from '@/modules/stock/receptionRules';

export type {
  ReceptionStatus, ReceptionClaim, ReceptionLine, ReceptionReport,
} from '@/modules/stock/receptionRules';
export {
  hasClaims, claimsOldestFirst, claimedQuantity, linkIsSevered,
} from '@/modules/stock/receptionRules';

export const receptionService = {
  /** Who is waiting for what is arriving on this purchase order. */
  async report(purchaseOrderId: string): Promise<ReceptionReport> {
    const { data, error } = await supabase.rpc('reception_report' as never, {
      p_purchase_order: purchaseOrderId,
    } as never);
    if (error) throw error;
    return data as unknown as ReceptionReport;
  },

  /**
   * Assign a sales line to the purchase line it is waiting on — or release it WITH a reason.
   *
   * Passing no purchase line severs the link rather than deleting it, so the sales line still
   * reads as waiting on something instead of quietly looking satisfied.
   */
  async assign(salesItemId: string, purchaseItemId: string | null, reason?: string) {
    const { data, error } = await supabase.rpc('link_sales_line_to_purchase' as never, {
      p_sales_item: salesItemId,
      p_purchase_item: purchaseItemId,
      p_reason: reason ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as { status: string; reason: string };
  },
};
