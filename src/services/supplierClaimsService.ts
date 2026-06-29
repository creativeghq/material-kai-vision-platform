import { supabase } from '@/integrations/supabase/client';

/**
 * #247 / Workstream F — supplier identity claim flow.
 * A workspace requests to claim a (VAT, country) global supplier identity;
 * ONLY the platform operator (owner/admin of the root workspace) approves.
 * Reads are RLS-gated (requester sees own; operator sees all).
 */
export interface SupplierClaimRequest {
  id: string;
  platform_supplier_id: string;
  vat_number: string;
  country_code: string;
  requesting_user_id: string;
  requesting_workspace_id: string;
  risk_flag: 'low' | 'needs_review';
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

export const supplierClaimsService = {
  /** Submit a claim for a (VAT, country) supplier identity on behalf of a workspace. */
  async requestClaim(workspaceId: string, vatNumber: string, countryCode: string, evidence?: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('request_supplier_claim', {
      p_workspace_id: workspaceId, p_vat: vatNumber, p_country: countryCode, p_evidence: evidence ?? {},
    });
    if (error) throw error;
    return data as string;
  },

  /** Operator-only: approve or reject a pending claim. */
  async decideClaim(requestId: string, approve: boolean, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('decide_supplier_claim', {
      p_request_id: requestId, p_approve: approve, p_reason: reason ?? null,
    });
    if (error) throw error;
  },

  /** List claim requests (RLS scopes to own / all-for-operator). */
  async listClaims(status?: 'pending' | 'approved' | 'rejected'): Promise<SupplierClaimRequest[]> {
    let q = supabase.from('supplier_claim_requests').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SupplierClaimRequest[];
  },

  /** Workspace names for the request rows (best-effort display). */
  async workspaceNames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const { data } = await supabase.from('workspaces').select('id, name').in('id', [...new Set(ids)]);
    return Object.fromEntries((data ?? []).map((w: any) => [w.id, w.name]));
  },

  // ── Supplier portal (F phase-3) ──────────────────────────────────────────
  /** Cross-workspace inbound PO feed for the caller's claimed supplier identity. */
  async getInboundOrders(workspaceId: string): Promise<SupplierInboundOrder[]> {
    const { data, error } = await supabase.rpc('get_supplier_inbound_orders', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as SupplierInboundOrder[];
  },

  /** Acknowledge / set ETA / mark shipped on a buyer's PO addressed to your claimed identity. */
  async updateInboundOrder(workspaceId: string, orderId: string, opts: { status?: 'acknowledged' | 'shipped'; eta?: string | null; note?: string | null }): Promise<void> {
    const { error } = await supabase.rpc('supplier_update_inbound_order', {
      p_workspace_id: workspaceId, p_order_id: orderId,
      p_status: opts.status ?? null, p_eta: opts.eta ?? null, p_note: opts.note ?? null,
    });
    if (error) throw error;
  },
};

export interface SupplierInboundOrderLine { description: string; quantity: number; unit_price: number; line_total: number; }
export interface SupplierInboundOrder {
  order_id: string;
  order_number: string;
  status: string;
  currency: string;
  total: number;
  created_at: string;
  buyer_name: string;
  supplier_status: 'acknowledged' | 'shipped' | null;
  supplier_acknowledged_at: string | null;
  supplier_eta: string | null;
  lines: SupplierInboundOrderLine[];
}
