/**
 * Master requests: a child workspace submits a procurement quote to its parent
 * node; the parent prices it or escalates upward. All writes go through SECURITY DEFINER
 * RPCs (the table is RLS write-locked); reads are visible to requester + target members.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MasterRequest {
  id: string;
  quote_id: string;
  requester_workspace_id: string;
  parent_workspace_id: string;
  status: 'new' | 'in_review' | 'priced' | 'escalated' | 'cancelled';
  note: string | null;
  amount: number | null;
  currency: string | null;
  priced_at: string | null;
  escalated_from: string | null;
  created_at: string;
  requester?: { name: string | null } | null;
  quote?: { name: string | null; quote_number: string | null } | null;
}

/** A single unpriced quote line routed upstream for pricing. */
export interface MasterRequestLine {
  id: string;
  master_request_id: string;
  quote_item_id: string;
  product_id: string | null;
  quantity: number;
  status: 'pending' | 'priced' | 'declined';
  priced_unit_cost: number | null;
  priced_currency: string;
  decline_reason: string | null;
  priced_at: string | null;
  created_at: string;
  product?: { name: string | null; sku: string | null } | null;
}

export const masterRequestsService = {
  /** Child action — route an accepted/draft procurement quote to the parent node. */
  async submit(quoteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('submit_procurement_request', { p_quote_id: quoteId });
    if (error) throw error;
    return data as string;
  },

  /** Parent inbox — requests targeting this workspace. */
  async listInbox(parentWorkspaceId: string): Promise<MasterRequest[]> {
    const { data, error } = await supabase
      .from('master_requests')
      .select('*, requester:workspaces!master_requests_requester_workspace_id_fkey(name), quote:quotes(name, quote_number)')
      .eq('parent_workspace_id', parentWorkspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as any;
  },

  /** Requester view — requests this workspace has sent upward. */
  async listMine(requesterWorkspaceId: string): Promise<MasterRequest[]> {
    const { data, error } = await supabase
      .from('master_requests')
      .select('*, quote:quotes(name, quote_number)')
      .eq('requester_workspace_id', requesterWorkspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async returnPriced(id: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('return_priced_request', { p_request_id: id, p_note: note ?? null });
    if (error) throw error;
  },

  async escalate(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('escalate_request', { p_request_id: id });
    if (error) throw error;
    return data as string;
  },

  // ── #237 Phase 4.4 — line-level upstream RFQ ──

  /** Requester — route selected "call for price" lines of a quote upstream. Returns request id. */
  async submitLineRfq(quoteId: string, quoteItemIds: string[]): Promise<string> {
    const { data, error } = await supabase.rpc('submit_line_rfq', {
      p_quote_id: quoteId,
      p_quote_item_ids: quoteItemIds,
    });
    if (error) throw error;
    return data as string;
  },

  /** Line rows of a request (requester or owner side). */
  async listLines(masterRequestId: string): Promise<MasterRequestLine[]> {
    const { data, error } = await supabase
      .from('master_request_lines')
      .select('*, product:products(name, sku)')
      .eq('master_request_id', masterRequestId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  },

  /** Owner — price one line at the requester's cost. */
  async priceLine(lineId: string, unitCost: number): Promise<void> {
    const { error } = await supabase.rpc('price_rfq_line', { p_line_id: lineId, p_unit_cost: unitCost });
    if (error) throw error;
  },

  /** Owner — decline to supply one line. */
  async declineLine(lineId: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('decline_rfq_line', { p_line_id: lineId, p_reason: reason ?? null });
    if (error) throw error;
  },

  /** Requester — fold returned costs back into the quote (optionally save to catalog). Returns count applied. */
  async applyPrices(masterRequestId: string, saveBack = false): Promise<number> {
    const { data, error } = await supabase.rpc('apply_rfq_prices_to_quote', {
      p_master_request_id: masterRequestId,
      p_save_back: saveBack,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  },

  /** Requester — the open RFQ (if any) for a given quote, with its lines. */
  async getOpenForQuote(quoteId: string): Promise<{ request: MasterRequest; lines: MasterRequestLine[] } | null> {
    const { data, error } = await supabase
      .from('master_requests')
      .select('*, quote:quotes(name, quote_number)')
      .eq('quote_id', quoteId)
      .in('status', ['new', 'in_review', 'priced'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const request = (data ?? [])[0] as any;
    if (!request) return null;
    const lines = await this.listLines(request.id);
    return { request, lines };
  },
};
