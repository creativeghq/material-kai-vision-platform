import { supabase } from '@/integrations/supabase/client';

export type PayoutStatus = 'draft' | 'reconciled' | 'discrepancy';

export interface StorePayout {
  id: string;
  connection_id: string;
  platform: string;
  external_payout_id: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_on: string | null;
  currency: string;
  gross: number;
  fees: number;
  net: number;
  status: PayoutStatus;
  notes: string | null;
  created_at: string;
}

export interface PayoutOrderLine {
  order_id: string;
  order_number: string | null;
  gross: number;
  invoice_number: string | null;
  issued: boolean;
}

export interface ReconcileResult {
  outcome: string;
  settled_orders?: number;
  unissued_orders?: number;
  allocated?: number;
  payout_gross?: number;
  notes?: string | null;
  reason?: string;
}

const COLUMNS = 'id, connection_id, platform, external_payout_id, period_start, period_end, paid_on, '
  + 'currency, gross, fees, net, status, notes, created_at';

export const storePayoutsService = {
  async list(workspaceId: string): Promise<StorePayout[]> {
    const { data, error } = await supabase.from('store_payouts').select(COLUMNS)
      .eq('workspace_id', workspaceId).order('paid_on', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as StorePayout[];
  },

  async create(workspaceId: string, input: {
    connection_id: string;
    platform: string;
    external_payout_id?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    paid_on?: string | null;
    currency?: string;
    gross: number;
    fees: number;
    net: number;
  }): Promise<string> {
    const { data, error } = await supabase.from('store_payouts').insert({
      workspace_id: workspaceId,
      connection_id: input.connection_id,
      platform: input.platform,
      external_payout_id: input.external_payout_id?.trim() || null,
      period_start: input.period_start || null,
      period_end: input.period_end || null,
      paid_on: input.paid_on || null,
      currency: input.currency ?? 'EUR',
      gross: input.gross,
      fees: input.fees,
      net: input.net,
    }).select('id').single();
    if (error) throw error;
    return (data as { id: string }).id;
  },

  async orders(payoutId: string): Promise<PayoutOrderLine[]> {
    const { data, error } = await supabase.rpc('list_store_payout_orders', { p_payout_id: payoutId });
    if (error) throw error;
    return (data ?? []) as PayoutOrderLine[];
  },

  async suggest(payoutId: string): Promise<{ added: number; covered_total: number; note: string | null }> {
    const { data, error } = await supabase.rpc('suggest_store_payout_orders', { p_payout_id: payoutId });
    if (error) throw error;
    return data as { added: number; covered_total: number; note: string | null };
  },

  async detach(payoutId: string, orderId: string): Promise<void> {
    const { error } = await supabase.rpc('detach_store_payout_order', {
      p_payout_id: payoutId, p_order_id: orderId,
    });
    if (error) throw error;
  },

  async reconcile(payoutId: string): Promise<ReconcileResult> {
    const { data, error } = await supabase.rpc('reconcile_store_payout', { p_payout_id: payoutId });
    if (error) throw error;
    return data as ReconcileResult;
  },

  async remove(payoutId: string): Promise<void> {
    const { error } = await supabase.from('store_payouts').delete().eq('id', payoutId);
    if (error) throw error;
  },
};
