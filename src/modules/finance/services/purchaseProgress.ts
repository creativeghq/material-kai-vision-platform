import { supabase } from '@/integrations/supabase/client';

export type DeliveryStage = 'draft' | 'ordered' | 'shipped' | 'part_delivered' | 'delivered' | 'cancelled';

export interface PurchaseProgress {
  order_id: string;
  delivery_stage: DeliveryStage;
  order_net: number;
  billed_net: number;
  billing_stage: 'not_billed' | 'part_billed' | 'billed';
}

export const DELIVERY_STAGE_LABEL: Record<DeliveryStage, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  shipped: 'Shipped',
  part_delivered: 'Part delivered',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Derived by `get_purchase_order_progress`: how far each purchase order has got, in delivery and in billing. */
export async function purchaseOrderProgress(orderIds: string[]): Promise<Map<string, PurchaseProgress>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await (supabase as any).rpc('get_purchase_order_progress', { p_order_ids: orderIds });
  if (error) throw error;
  return new Map(((data ?? []) as PurchaseProgress[]).map((p) => [p.order_id, p]));
}
