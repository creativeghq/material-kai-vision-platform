/**
 * #206 — received (inbound) myDATA documents: the expenses Inbox. The live pull is
 * wired in the finance-inbound-sync poller (activates with per-tenant AADE creds); this
 * client reads what's been pulled and turns a doc into a supplier bill / warehouse intake.
 */
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

export interface InboundDocLine {
  line_number: number | null;
  /** Supplier's own article code (myDATA `itemCode`). Authoritative — never guessed. */
  item_code: string | null;
  item_description: string | null;
  quantity: number | null;
  /** AADE measurement-unit code: 1 pcs · 2 kg · 3 lt · 4 m · 5 m² · 6 m³. Authoritative. */
  measurement_unit: number | null;
  net_value: number | null;
  /** AADE VAT category code (1 = 24%, 2 = 13%, 3 = 6%, …). */
  vat_category: number | null;
  vat_amount: number | null;
  comments: string | null;
}

export interface InboundAddress {
  street: string | null;
  number: string | null;
  postal_code: string | null;
  city: string | null;
}

export interface InboundDocument {
  id: string;
  workspace_id: string;
  mark: string;
  issuer_vat: string | null;
  issuer_name: string | null;
  issue_date: string | null;
  doc_type: string | null;
  /** Issuer's own document number, e.g. series 'ΤΔΑ' + aa '5160'. */
  series: string | null;
  aa: string | null;
  // ── Full myDATA payload (parsed 2026-07-28; previously discarded) ──
  uid: string | null;
  authentication_code: string | null;
  qr_code_url: string | null;
  /** The issuer's own rendered document, when their provider publishes one. */
  download_url: string | null;
  issuer_country: string | null;
  issuer_branch: string | null;
  issuer_address: InboundAddress | null;
  counterpart_vat: string | null;
  counterpart_name: string | null;
  counterpart_address: InboundAddress | null;
  /** ΕΙΝΑΙ & ΔΑ — the document doubles as a delivery note. */
  is_delivery_note: boolean | null;
  move_purpose: string | null;
  vat_payment_suspension: boolean | null;
  delivery_addresses: { loading: InboundAddress | null; delivery: InboundAddress | null } | null;
  payment_methods: { type: number | null; amount: number | null; info: string | null }[] | null;
  total_withheld: number | null;
  total_fees: number | null;
  total_stamp_duty: number | null;
  total_other_taxes: number | null;
  total_deductions: number | null;
  currency: string;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  lines: InboundDocLine[];
  status: 'new' | 'classified' | 'received' | 'dismissed';
  created_supplier_bill_id: string | null;
  category_id: string | null;
  created_at: string;
}

export const inboundService = {
  async list(workspaceId: string): Promise<InboundDocument[]> {
    const { data, error } = await supabase
      .from('inbound_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as InboundDocument[];
  },

  async toSupplierBill(docId: string): Promise<string> {
    const { data, error } = await supabase.rpc('inbound_doc_to_supplier_bill', { p_doc_id: docId });
    if (error) throw error;
    return data as string;
  },

  /** Manually trigger the myDATA RequestDocs pull (finance-manager).
   *  Pass an ISO `yyyy-mm-dd` window to bound the pull to those issue dates — without it the
   *  pull runs from the stored MARK watermark, which on a first sync means all of history. */
  async syncNow(range?: { dateFrom: string; dateTo: string }): Promise<any> {
    const body = range ? { date_from: range.dateFrom, date_to: range.dateTo } : {};
    const { data, error } = await supabase.functions.invoke('finance-inbound-sync', { body });
    if (error) throw await edgeError(error);
    return data;
  },

  /** Receive an inbound doc's lines into the warehouse. mappings: [{item_id, quantity}].
   *  Records an 'in' stock movement per mapping (server-side, finance-manager-gated) and
   *  marks the doc 'received'. Returns the number of movements recorded. */
  async receiveToWarehouse(docId: string, mappings: { item_id: string; quantity: number }[]): Promise<number> {
    const { data, error } = await supabase.rpc('inbound_doc_receive_to_warehouse', { p_doc_id: docId, p_mappings: mappings });
    if (error) throw error;
    return (data as number) ?? 0;
  },

  async dismiss(docId: string): Promise<void> {
    const { error } = await supabase.from('inbound_documents').update({ status: 'dismissed', updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) throw error;
  },

  /** Assign / clear the internal finance category on an inbound (myDATA) document. */
  async setCategory(docId: string, categoryId: string | null): Promise<void> {
    const { error } = await supabase.from('inbound_documents').update({ category_id: categoryId, updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) throw error;
  },

  /** Per-workspace myDATA received-docs credential STATUS (manager-only). Never returns the
   *  secret subscription key to the browser — only whether one is set (`has_key`). */
  async getCreds(workspaceId: string): Promise<{ aade_user_id: string | null; base_url: string | null; enabled: boolean; has_key: boolean } | null> {
    const { data, error } = await supabase.rpc('get_inbound_creds_status', { p_workspace_id: workspaceId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      aade_user_id: row.aade_user_id ?? null,
      base_url: row.base_url ?? null,
      enabled: row.enabled ?? true,
      has_key: !!row.has_key,
    };
  },

  /** Save inbound credentials. The subscription key is only written when a new value is
   *  provided — saving with a blank key preserves the existing one (so the masked form never
   *  wipes a stored secret). */
  async saveCreds(workspaceId: string, input: { aadeUserId: string; subscriptionKey?: string; baseUrl?: string; enabled: boolean }): Promise<void> {
    const payload: Record<string, any> = {
      workspace_id: workspaceId,
      aade_user_id: input.aadeUserId || null,
      base_url: input.baseUrl || null,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    };
    // Only touch the secret column when the user actually entered a new key — on an
    // ON CONFLICT update, omitting the column leaves the stored key intact.
    if (input.subscriptionKey && input.subscriptionKey.trim()) {
      payload.subscription_key = input.subscriptionKey.trim();
    }
    const { error } = await supabase.from('workspace_inbound_credentials').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
  },
};
