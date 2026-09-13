/**
 * The order-line timeline, the work queue and the counter's lost sales (#432, #434).
 *
 * The value is in what is LATE, so the queue is derived grouped by urgency rather than listed and
 * sorted in a component.
 */
import { supabase } from '@/integrations/supabase/client';

import type { WorkQueue, LineStatus, FulfilmentType, LineDateKey } from '@/modules/finance/orderLineRules';

export type {
  LineStatus, FulfilmentType, LineDateKey, QueueBucket, QueueRow, WorkQueue,
} from '@/modules/finance/orderLineRules';
export {
  LINE_LADDER, LINE_STATUS_LABEL, FULFILMENT_LABEL, LINE_DATE_FIELDS, BUCKET_LABEL,
  lineIsUndated, isTerminalStatus, needsSupplierClaim, ladderPosition,
} from '@/modules/finance/orderLineRules';

export interface LostSale {
  id: string;
  workspace_id: string;
  asked_on: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  outcome: 'not_stocked' | 'out_of_stock' | 'price' | 'lead_time' | 'wrong_spec' | 'other';
  notes: string | null;
}

export interface SpendDecline {
  company_id: string;
  customer_name: string | null;
  recent_total: number;
  prior_total: number;
  drop_ratio: number | null;
  last_order_at: string | null;
}

export const orderLineService = {
  /** Open lines, grouped by how late they are. */
  async workQueue(workspaceId: string, asOf?: string): Promise<WorkQueue> {
    const { data, error } = await supabase.rpc('order_line_work_queue' as never, {
      p_workspace: workspaceId,
      p_as_of: asOf ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as WorkQueue;
  },

  /** Set the rung, or record an outcome. */
  async setStatus(orderItemId: string, status: LineStatus | null) {
    const { error } = await supabase
      .from('order_items')
      .update({ line_status: status })
      .eq('id', orderItemId);
    if (error) throw error;
  },

  /** One of the eight dates. Each means "this happened on" — never a derived guess. */
  async setDate(orderItemId: string, key: LineDateKey, value: string | null) {
    const { error } = await supabase
      .from('order_items')
      .update({ [key]: value })
      .eq('id', orderItemId);
    if (error) throw error;
  },

  async setFulfilment(orderItemId: string, type: FulfilmentType | null) {
    const { error } = await supabase
      .from('order_items')
      .update({ fulfilment_type: type })
      .eq('id', orderItemId);
    if (error) throw error;
  },

  /**
   * Clear a line from the queue while KEEPING the date it was late against.
   *
   * Programa's "Mark Complete to clear from Overdue while retaining the date for audit" — deleting
   * the date instead would make the lateness disappear along with the work.
   */
  async markComplete(orderItemId: string) {
    const { error } = await supabase
      .from('order_items')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', orderItemId);
    if (error) throw error;
  },

  async listLostSales(workspaceId: string): Promise<LostSale[]> {
    const { data, error } = await supabase
      .from('lost_sales')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('asked_on', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as LostSale[];
  },

  async recordLostSale(l: Partial<LostSale> & { workspace_id: string; description: string }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('lost_sales')
      .insert({ ...l, recorded_by: auth?.user?.id ?? null });
    if (error) throw error;
  },

  /**
   * Customers whose spend has fallen away.
   *
   * A customer who quietly stops buying leaves no defective record anywhere, so nothing raises —
   * the silent-zero shape at the customer level.
   */
  async spendDecline(workspaceId: string, windowDays = 90, dropRatio = 0.5): Promise<SpendDecline[]> {
    const { data, error } = await supabase.rpc('customer_spend_decline' as never, {
      p_workspace: workspaceId,
      p_window_days: windowDays,
      p_drop_ratio: dropRatio,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as SpendDecline[];
  },
};
