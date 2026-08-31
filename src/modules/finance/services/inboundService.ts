/**
 * Received (inbound) myDATA documents: the expenses Inbox. The live pull is
 * wired in the finance-inbound-sync poller (activates with per-tenant AADE creds); this
 * client reads what's been pulled and turns a doc into a supplier bill / warehouse intake.
 */
import { supabase } from '@/integrations/supabase/client';
// One normalised VAT key (#353 CRM-4).
import { normalizeVat, CRM_VAT_COLUMN } from '@/components/business/crm/companyIdentity';
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

/**
 * How many documents the Expenses inbox holds in memory. It filters and pages client-side, so
 * this is the whole world as far as that surface is concerned — anything past it is unreachable,
 * not merely on a later page. Sized to cover years of daily polling for a real workspace (1,857
 * documents over 29 months here); when a workspace outgrows it the UI says so out loud rather
 * than quietly showing a prefix.
 */
export const INBOUND_LIST_LIMIT = 2000;

/**
 * One expense supplier, from `inbound_issuers_summary`. Every figure here is DERIVED in SQL —
 * the client formats them and never re-counts a pile it can only see one page of.
 */
export interface ExpenseIssuerRow {
  issuer_vat: string;
  issuer_name: string | null;
  /** Every document this ΑΦΜ has ever filed against us. */
  docs: number;
  /** Still `new` AND still in the generic system bucket — i.e. what filing this row would move. */
  unfiled: number;
  /** How many became a supplier bill, so they actually reach Payables and the P&L. */
  in_books: number;
  total_net: number | null;
  total_gross: number | null;
  currency: string | null;
  first_issue_date: string | null;
  last_issue_date: string | null;
  /** Set once this supplier has been filed before — the next arrival lands here on its own. */
  learned_category_id: string | null;
  learned_category_name: string | null;
  /** The CRM company this ΑΦΜ resolves to, matched on the normalised VAT key. Null = not in CRM. */
  crm_company_id: string | null;
  crm_company_name: string | null;
  crm_is_supplier: boolean | null;
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

  /**
   * Ordered by ISSUE DATE, which is the date the table shows and the only one the operator has
   * any reason to think in. It used to order by `created_at` — when WE happened to poll the row
   * — and the two agreed by accident for as long as there was a single inlet fetching daily.
   *
   * Backfilling history broke the accident on the first run: 87 self-transmitted documents
   * spanning 2024-02 to 2026-06 were all inserted within the same second, so they took the top 87
   * places and buried every supplier invoice under four and a half pages of them. The documents
   * were not misfiled — the list was answering "most recently fetched" to a question nobody asked.
   *
   * Returns the total as well as the page, because the cap below is otherwise invisible: a list
   * that stops at 500 of 1,857 looks exactly like a list of 500.
   */
  async list(workspaceId: string, limit = INBOUND_LIST_LIMIT): Promise<{ rows: InboundDocument[]; total: number }> {
    const { data, error, count } = await supabase
      .from('inbound_documents')
      .select(this.LIST_COLUMNS, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      // Nulls last: a document with no issue date is not the newest thing that ever happened.
      .order('issue_date', { ascending: false, nullsFirst: false })
      // Same-day documents fall back to arrival order, so the sort is total and paging is stable.
      .order('created_at', { ascending: false })
      // Bounded. The list had no LIMIT at all, so it grew linearly with inbound myDATA volume.
      .limit(limit);
    if (error) throw error;
    // The heavy columns are absent by design — `lines` defaults to [] so a consumer that reads it
    // before hydrating renders empty rather than crashing.
    const rows = (data ?? []).map((d: any) => ({ lines: [], ...d })) as InboundDocument[];
    return { rows, total: count ?? rows.length };
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
   *
   * Returns the TOTAL alongside the page for the same reason [[list]] does: the biggest issuer
   * on this workspace has 206 documents and the old cap was 200, so its history rendered as a
   * complete list that was quietly missing its oldest six.
   */
  async listForIssuerVat(
    workspaceId: string,
    vat: string,
    opts: {
      /** Inclusive ISO `yyyy-mm-dd` bounds on the ISSUE date — the date the table shows. */
      from?: string | null;
      to?: string | null;
      limit?: number;
    } = {},
  ): Promise<{ rows: InboundDocument[]; total: number }> {
    const digits = (vat ?? '').replace(/\D/g, '');
    if (!digits) return { rows: [], total: 0 };
    const forms = Array.from(new Set([vat.trim(), digits, `EL${digits}`].filter(Boolean)));
    let q = supabase
      .from('inbound_documents')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .in('issuer_vat', forms);
    // Bounded SERVER-side, not on the loaded page: a window narrower than the cap must be able
    // to reach documents the cap would otherwise have cut off, or "no invoices in 2024" would
    // mean "none in the most recent 500".
    if (opts.from) q = q.gte('issue_date', opts.from);
    if (opts.to) q = q.lte('issue_date', opts.to);
    const { data, error, count } = await q
      .order('issue_date', { ascending: false, nullsFirst: false })
      .limit(opts.limit ?? 500);
    if (error) throw error;
    const rows = (data ?? []) as InboundDocument[];
    return { rows, total: count ?? rows.length };
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
   * Matched on the NORMALISED VAT key (#353 CRM-4), not the three spellings it used to guess
   * at — a row stored as `GR 800 370 260` was none of them. Returns null when the issuer isn't
   * in CRM.
   */
  async issuerProfile(workspaceId: string, vat: string | null): Promise<IssuerProfile | null> {
    const vatKey = normalizeVat(vat);
    if (!vatKey) return null;
    const { data, error } = await supabase
      .from('crm_companies')
      .select('id, name, tax_office, gemi_number, gemi_legal_form, gemi_status, legal_status, kad_primary, kad_primary_description, profession, phone, email, website, street, street_number, postal_code, city')
      .eq('workspace_id', workspaceId)
      .eq(CRM_VAT_COLUMN, vatKey)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as IssuerProfile | null) ?? null;
  },

  /**
   * Record what was actually on a document that arrived with value-only lines (issue #377,
   * Phase 1b). The RPC is the authority: it refuses a document whose lines came under a MARK,
   * and refuses any set that does not foot to `total_net`. Once this returns, the whole existing
   * chain — warehouse receive, product extraction, catalog, the markup ladder — works unchanged,
   * because all of it keys on `lines[].item_description` and nothing else.
   */
  async setLines(
    docId: string,
    lines: {
      item_description: string;
      item_code: string | null;
      quantity: number | null;
      measurement_unit: number | null;
      net_value: number | null;
      vat_category: number | null;
      vat_amount: number | null;
    }[],
  ): Promise<{ lines: number; lines_total: number; document_total_net: number }> {
    const { data, error } = await supabase.rpc('inbound_doc_set_lines' as never, {
      p_doc_id: docId, p_lines: lines,
    } as never);
    if (error) throw error;
    return data as unknown as { lines: number; lines_total: number; document_total_net: number };
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

  /**
   * The expenses inbox grouped by SUPPLIER — because that is the unit of every decision made
   * about it.
   *
   * 1,866 myDATA documents arrived and every one sits in the generic myAADE bucket that
   * `finance-inbound-sync` stamps on arrival. Filing them one at a time is 1,866 decisions;
   * grouped by issuer it is 241, and the top 45 issuers carry 1,324 of the documents — 71%.
   * A supplier's invoices almost always belong in one category, so this is the queue that
   * actually clears.
   *
   * Returns EVERY issuer, not only the ones with something outstanding: this is the surface a
   * supplier's history is read from, and a list that empties itself as the backlog clears would
   * answer "who do we buy from?" with a blank page.
   */
  async issuersSummary(workspaceId: string): Promise<ExpenseIssuerRow[]> {
    const { data, error } = await (supabase as any).rpc('inbound_issuers_summary', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return (data ?? []) as ExpenseIssuerRow[];
  },

  /**
   * File every one of a supplier's still-unfiled documents at once.
   *
   * Returns how many moved. Only documents still sitting in a SYSTEM bucket are touched — one
   * the operator filed deliberately is never re-filed by a bulk action.
   *
   * Filing an issuer also teaches the platform: `remember_inbound_issuer_category` records the
   * default and `finance-inbound-sync` applies it to everything that arrives afterwards, so the
   * same supplier never needs filing twice. That is why the RPC refuses a system category as the
   * target — it would move the documents and teach nothing.
   */
  async fileIssuer(workspaceId: string, issuerVat: string, categoryId: string): Promise<number> {
    const { data, error } = await (supabase as any).rpc('inbound_file_issuer', {
      p_workspace_id: workspaceId,
      p_issuer_vat: issuerVat,
      p_category_id: categoryId,
    });
    if (error) throw error;
    return Number(data ?? 0);
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
