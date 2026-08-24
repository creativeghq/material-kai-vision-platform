/**
 * Received (inbound) myDATA documents: the expenses Inbox. The live pull is
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

/**
 * The registry-sourced identity of an issuer, read off their CRM company record. Every field
 * here is one myDATA never sends — see [[inboundService.issuerProfile]].
 */
export interface IssuerProfile {
  id: string;
  name: string | null;
  tax_office: string | null;
  gemi_number: string | null;
  gemi_legal_form: string | null;
  gemi_status: string | null;
  legal_status: string | null;
  kad_primary: string | null;
  kad_primary_description: string | null;
  profession: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
}

/** Which inlet delivered the document. The axis is the CHANNEL, never the country. */
export type InboundSource = 'mydata' | 'mydata_self' | 'email' | 'upload' | 'peppol' | 'api';

/** Where the line detail came from — a different fact from where the money record came from. */
export type InboundLinesSource = 'mydata' | 'user' | 'document' | 'none';

export interface InboundDocument {
  id: string;
  workspace_id: string;
  mark: string;
  /**
   * `mydata` — the supplier filed it against us (myDATA `RequestDocs`).
   * `mydata_self` — WE transmitted it, typed into myAADE. Every foreign purchase is one of these:
   * a Bulgarian supplier is not a myDATA obligor, so nobody files it for us. Also rent (16.1) and
   * payroll (17.x), which follow the identical pattern.
   */
  source: InboundSource;
  /** `none` = value-only lines, nothing nameable. Gates the line editor and warehouse receive. */
  lines_source: InboundLinesSource;
  lines_reconciled: boolean;
  /** The MARK under which WE registered this in myDATA. NULL when the supplier filed it. */
  mydata_mark: string | null;
  /** Derived in SQL from `mydata_mark` — never stored twice. */
  reported_to_mydata: boolean;
  issuer_vat: string | null;
  issuer_name: string | null;
  issue_date: string | null;
  /** When the goods left — myDATA `dispatchDate`, distinct from the issue date. */
  dispatch_date: string | null;
  /** Plate of the vehicle that carried them (delivery notes). */
  vehicle_number: string | null;
  doc_type: string | null;
  /** Issuer's own document number, e.g. series 'ΤΔΑ' + aa '5160'. */
  series: string | null;
  aa: string | null;
  // ── Full myDATA payload ──
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
  /**
   * Columns the LIST needs. Deliberately not `*`.
   *
   * `raw` (535 B avg), `lines` (238 B) and `delivery_addresses` (292 B) are TOASTed, and
   * `select('*')` detoasted all of them for every row just to paint a table that shows none of
   * them — 1,424 kB of TOAST per list render, measured at 982 ms mean against 2.7 ms with RLS
   * bypassed. They are fetched by `getFull()` when a row is actually opened.
   */
  LIST_COLUMNS: [
    'id', 'workspace_id', 'mark', 'source', 'lines_source', 'lines_reconciled', 'mydata_mark',
    'reported_to_mydata',
    'issuer_vat', 'issuer_name', 'issue_date', 'dispatch_date',
    'vehicle_number', 'doc_type', 'series', 'aa', 'uid', 'authentication_code', 'download_url',
    'issuer_country', 'issuer_branch', 'counterpart_vat', 'counterpart_name', 'is_delivery_note',
    'move_purpose', 'vat_payment_suspension', 'total_withheld', 'total_fees', 'total_stamp_duty',
    'total_other_taxes', 'total_deductions', 'currency', 'total_net', 'total_vat', 'total_gross',
    'status', 'created_supplier_bill_id', 'category_id', 'created_at', 'updated_at',
  ].join(', '),

  async list(workspaceId: string, limit = 500): Promise<InboundDocument[]> {
    const { data, error } = await supabase
      .from('inbound_documents')
      .select(this.LIST_COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      // Bounded. The list had no LIMIT at all, so it grew linearly with inbound myDATA volume.
      .limit(limit);
    if (error) throw error;
    // The heavy columns are absent by design — `lines` defaults to [] so a consumer that reads it
    // before hydrating renders empty rather than crashing.
    return (data ?? []).map((d: any) => ({ lines: [], ...d })) as InboundDocument[];
  },

  /**
   * The FULL row, including the TOASTed columns the list omits. Call this when a document is
   * actually OPENED (preview, receive-to-warehouse) rather than paying for it on every list paint.
   */
  async getFull(id: string): Promise<InboundDocument | null> {
    const { data, error } = await supabase
      .from('inbound_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as InboundDocument | null;
  },


  /**
   * Every received document issued by one ΑΦΜ — the supplier's documents on their CRM record.
   *
   * The link is a LIVE match on the VAT number: `inbound_documents` stores no company id, so a
   * CRM company created today instantly claims documents polled months ago, and nothing ever
   * needs backfilling. Matched on the raw string, the digits-only form and the EL-prefixed form,
   * because myDATA sends '099430615' where a CRM row may hold 'EL099430615'.
   */
  async listForIssuerVat(workspaceId: string, vat: string, limit = 200): Promise<InboundDocument[]> {
    const digits = (vat ?? '').replace(/\D/g, '');
    if (!digits) return [];
    const forms = Array.from(new Set([vat.trim(), digits, `EL${digits}`].filter(Boolean)));
    const { data, error } = await supabase
      .from('inbound_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('issuer_vat', forms)
      .order('issue_date', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as InboundDocument[];
  },

  /**
   * The issuer's business identity, which myDATA does NOT transmit.
   *
   * `RequestDocs` sends the issuer as ΑΦΜ + country + branch, sometimes a name and address, and
   * nothing else — measured on live data, 1,147 of 1,732 issuer blocks carry no address at all.
   * Δ.Ο.Υ., Γ.Ε.ΜΗ. number, activity (ΚΑΔ), phone, email and website are the supplier's own
   * letterhead; on our side they come from the registries via [[researchCompany]] and live on the
   * CRM company row. So the preview reads them from there rather than pretending AADE sent them.
   *
   * Matched on the VAT number in all three forms it gets written in (raw / digits / EL-prefixed),
   * the same live-match rule as `listForIssuerVat`. Returns null when the issuer isn't in CRM.
   */
  async issuerProfile(workspaceId: string, vat: string | null): Promise<IssuerProfile | null> {
    const digits = (vat ?? '').replace(/\D/g, '');
    if (!digits) return null;
    const forms = Array.from(new Set([(vat ?? '').trim(), digits, `EL${digits}`].filter(Boolean)));
    const { data, error } = await supabase
      .from('crm_companies')
      .select('id, name, tax_office, gemi_number, gemi_legal_form, gemi_status, legal_status, kad_primary, kad_primary_description, profession, phone, email, website, street, street_number, postal_code, city')
      .eq('workspace_id', workspaceId)
      .in('vat_number', forms)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as IssuerProfile | null) ?? null;
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

  /** Mark the AI-extracted pending rows for this document as handled, so the pending queue
   *  and the intake modal cannot both receive the same supplier line. */
  async settlePendingForDocument(docId: string, descriptions: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('settle_pending_items_for_document', {
      p_document_id: docId, p_descriptions: descriptions,
    });
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
