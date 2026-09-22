/**
 * Received (inbound) myDATA documents: the expenses Inbox. The live pull is
 * wired in the finance-inbound-sync poller (activates with per-tenant AADE creds); this
 * client reads what's been pulled and turns a doc into a supplier bill / warehouse intake.
 */
import { supabase } from '@/integrations/supabase/client';
// One normalised VAT key (#353 CRM-4).
import { normalizeVat, CRM_VAT_COLUMN } from '@/components/business/crm/companyIdentity';
import { edgeError } from '@/utils/edgeError';
import { flowEventService } from '@/services/flows/flowEventService';
import type {
  InboundLineCost, InboundLineCostStatus, InboundLinkRelation, InboundLinkSource,
  InboundLinkSummary,
} from '@/modules/finance/utils/inboundCorrelation';
import type {
  ExpenseKind, VatTreatment, ExpenseOrigin, ExpenseSegmentRow,
} from '@/modules/finance/expenseSegments';

export type { InboundLinkSummary } from '@/modules/finance/utils/inboundCorrelation';

/**
 * `get_inbound_document_detail` — what was on a document, merged with the delivery note that
 * itemises it when the document names nothing itself.
 */
export interface InboundDocumentDetail {
  document: {
    id: string; mark: string | null; doc_type: string | null; label: string;
    issue_date: string | null; dispatch_date: string | null;
    issuer_vat: string | null; issuer_name: string | null;
    currency: string | null; vehicle_number: string | null; download_url: string | null;
  };
  detail:
    | { status: 'own' }
    | {
        status: 'linked'; source_doc_id: string; source_mark: string; source_label: string;
        source_doc_type: string | null; link_source: InboundLinkSource;
        relation: InboundLinkRelation;
      }
    /** Absence with a stated reason — never an empty list standing in for "we do not know". */
    | { status: 'none'; reason: string };
  /** Each line carries its own `line_cost` verdict; `net_value`/`vat_amount` are ABSENT when unknown. */
  lines: (InboundDocLine & { line_cost?: InboundLineCost })[];
  money: {
    /** The document's OWN totals. A ΔΑ is worth zero and stays worth zero. */
    total_net: number | null; total_vat: number | null; total_gross: number | null;
    /** What these goods were billed at, and on which document — may be the correlated one. */
    billed_net: number | null; billed_vat: number | null; billed_gross: number | null;
    billed_on: string | null;
    /** The single VAT category the billing document states, when it states exactly one. */
    vat_category: number | null;
    line_costs: InboundLineCostStatus;
  };
  correlations: InboundLinkSummary[];
  /** Candidates nobody has ruled on. Deliberately NOT folded into `lines`. */
  suggestions: InboundLinkSummary[];
}

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

/** One AADE expense classification (`ecls:*`) as the issuer transmitted it, per line. */
export interface InboundExpenseClassification {
  line_number: number | null;
  classification_type: string | null;
  classification_category: string | null;
  amount: number | null;
  id: number | null;
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
  expense_kind: ExpenseKind | null;
  vat_treatment: VatTreatment | null;
  origin: ExpenseOrigin | null;
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
  /**
   * MARK of the AADE cancellation that voided this document. Non-null IS the cancelled fact;
   * there is no boolean twin to drift against it.
   */
  cancelled_by_mark: string | null;
  /** Per-line `ecls:*` as transmitted. A line may carry more than one, so it is a flat array. */
  expenses_classification: InboundExpenseClassification[] | null;
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
  status: 'new' | 'classified' | 'received' | 'partially_received' | 'dismissed';
  created_supplier_bill_id: string | null;
  /** Set = paid outside the platform, so the cost is excluded from the P&L and reported apart. */
  settled_outside_at?: string | null;
  settled_outside_note?: string | null;
  category_id: string | null;
  created_at: string;
}

/** One document line's receipt position, derived by `inbound_doc_outstanding`. */
export interface InboundLineOutstanding {
  line_number: number | null;
  description: string | null;
  ordered: number;
  received: number;
  outstanding: number;
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
/** One row of `get_inbound_booking_backlog`: a state, and what sits in it. */
export interface InboundBacklogRow {
  booking_state:
    | 'bookable' | 'booked' | 'dismissed' | 'cancelled' | 'settled_outside'
    | 'payroll' | 'own_entity' | 'credit_note' | 'no_value' | 'out_of_scope';
  docs: number;
  net: number;
  vat: number;
  gross: number;
  will_book_total: number;
  first_issue_date: string | null;
  last_issue_date: string | null;
}

export interface InboundBookableIssuerRow {
  /** Nullable: a document can carry no ΑΦΜ, and booking is BY issuer. Such rows stay listed. */
  issuer_vat: string | null;
  issuer_name: string | null;
  crm_company_id: string | null;
  docs: number;
  net: number;
  vat: number;
  will_book_total: number;
  /** How many would book as Uncategorized — i.e. file this supplier before booking it. */
  category_pending: number;
  learned_category_id: string | null;
  learned_category_name: string | null;
  first_issue_date: string | null;
  last_issue_date: string | null;
}

export interface SettleOutcome {
  outcome: 'settled_outside' | 'already_settled_outside' | 'booked_and_paid' | 'already_paid' | 'unknown';
  supplier_bill_id: string | null;
  payment_id: string | null;
  amount: number;
}

export interface ReceivedCreditNoteFetch {
  created: number;
  skipped: number;
  failed: number;
  total: number;
  remaining: number;
  first_error: string | null;
}

/** `skipped` is a document the rules would not book; `failed` is one that tried and broke. */
export interface InboundIssuerBookingResult {
  filed: number;
  booked: number;
  skipped: number;
  failed: number;
  booked_total: number;
  remaining: number;
  first_error: string | null;
}

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

/**
 * What one supplier invoiced, what of it reached the books, and what has been paid — for a date
 * window. DERIVED by `inbound_issuer_money`; nothing here is added up in the browser.
 *
 * `paid` can only exist for documents that BECAME a supplier bill, which is why
 * `booked_documents` travels with it. A supplier with 206 documents and none booked genuinely has
 * paid nothing, but a bare "EUR 0 paid" reads as an unpaid debt rather than as work nobody has
 * done yet — so every reader of `paid` must show that ratio next to it.
 */
export interface IssuerMoney {
  /** Documents in the window. */
  documents: number;
  /** What the supplier actually invoiced — reverse charge counted at NET, per `inbound_invoiced_total`. */
  invoiced: number;
  /** VAT we self-assess and reclaim on reverse-charged purchases. Never part of a cost; here so
   *  it stays reachable rather than silently vanishing. */
  self_accounted_vat: number;
  booked_documents: number;
  booked_total: number;
  paid: number;
  credited: number;
  outstanding: number;
  /** Null when the window mixes currencies — the totals are then not addable and must not be shown. */
  currency: string | null;
  mixed_currency: boolean;
  /** Paid outside the platform: deliberately not booked, so counted apart from `booked_*`. */
  settled_outside_documents: number;
  settled_outside_total: number;
}

/** One candidate from `suggest_orders_for_inbound_doc`. `net_delta` is the derived disagreement
 *  between what the supplier billed and what is still unbilled on the order. */
export interface InboundOrderSuggestion {
  order_id: string;
  order_number: string | null;
  ordered_on: string | null;
  po_net: number;
  currency: string | null;
  party_name: string | null;
  already_billed_net: number;
  net_delta: number;
  same_supplier: boolean;
  match_reason: string;
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
    'cancelled_by_mark', 'expenses_classification',
    'move_purpose', 'vat_payment_suspension', 'total_withheld', 'total_fees', 'total_stamp_duty',
    'total_other_taxes', 'total_deductions', 'currency', 'total_net', 'total_vat', 'total_gross',
    'status', 'created_supplier_bill_id', 'category_id', 'created_at', 'updated_at',
    'settled_outside_at', 'settled_outside_note',
    // Derived on the row: the list and its filters read what SQL decided.
    'expense_kind', 'vat_treatment', 'origin',
  ].join(', '),

  /**
   * Ordered by ISSUE DATE, which is the date the table shows and the only one the operator has
   * any reason to think in. It used to order by `created_at` — when WE happened to poll the row
   * — and the two agreed by accident for as long as there was a single inlet fetching daily.
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


  /** Every received document issued by one ΑΦΜ — the supplier's documents on their CRM record. */
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
   * The money side of the same window `listForIssuerVat` lists. Two calls rather than one because
   * the list is PAGED and the totals are not: deriving them from the loaded page would make every
   * figure a total of twenty documents.
   */
  async issuerMoney(
    workspaceId: string,
    vat: string,
    opts: { from?: string | null; to?: string | null } = {},
  ): Promise<IssuerMoney | null> {
    const { data, error } = await (supabase as any).rpc('inbound_issuer_money', {
      p_workspace_id: workspaceId,
      p_issuer_vat: vat,
      p_from: opts.from ?? null,
      p_to: opts.to ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      documents: Number(row.documents ?? 0),
      invoiced: Number(row.invoiced ?? 0),
      self_accounted_vat: Number(row.self_accounted_vat ?? 0),
      booked_documents: Number(row.booked_documents ?? 0),
      booked_total: Number(row.booked_total ?? 0),
      paid: Number(row.paid ?? 0),
      credited: Number(row.credited ?? 0),
      outstanding: Number(row.outstanding ?? 0),
      settled_outside_documents: Number(row.settled_outside_documents ?? 0),
      settled_outside_total: Number(row.settled_outside_total ?? 0),
      currency: row.currency ?? null,
      mixed_currency: !!row.mixed_currency,
    };
  },

  /** The issuer's business identity, which myDATA does NOT transmit. */
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

  /** Purchase orders this document might be billing, derived in SQL and ranked by closeness. */
  async suggestOrders(docId: string): Promise<InboundOrderSuggestion[]> {
    const { data, error } = await supabase.rpc('suggest_orders_for_inbound_doc' as never, {
      p_doc_id: docId,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as InboundOrderSuggestion[];
  },

  /** Book this document as the bill FOR an existing purchase order — one act, so a retry cannot
   *  leave an expense with no order or book the payable twice. */
  async billToOrder(docId: string, orderId: string): Promise<{ supplier_bill_id: string; note: string }> {
    const { data, error } = await supabase.rpc('inbound_doc_bill_to_order' as never, {
      p_doc_id: docId, p_order: orderId,
    } as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { supplier_bill_id: string; note: string };
    return row;
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
  async receiveToWarehouse(
    docId: string,
    /** `line_number` is the DOCUMENT's own line id (a supplier's 209851, not an array index) —
     *  it is what the outstanding quantity nets against. */
    mappings: { item_id: string; quantity: number; line_number?: number | null }[],
    /** Minted once per click. A retry replays the receipt that already committed instead of
     *  receiving the goods twice — the case a client-side latch cannot close, because the
     *  connection drops after the write (anti-regression rule 4). */
    clientToken?: string,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('inbound_doc_receive_to_warehouse', {
      p_doc_id: docId, p_mappings: mappings, p_client_token: clientToken ?? null,
    } as never);
    if (error) throw error;
    return (data as number) ?? 0;
  },

  /** What is still to come on this document, per line. THE derivation — the over-receipt
   *  refusal and the document's status read the same function. */
  async outstanding(docId: string): Promise<InboundLineOutstanding[]> {
    const { data, error } = await supabase.rpc('inbound_doc_outstanding' as never, {
      p_doc_id: docId,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as InboundLineOutstanding[];
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
   */
  async issuersSummary(workspaceId: string): Promise<ExpenseIssuerRow[]> {
    const { data, error } = await (supabase as any).rpc('inbound_issuers_summary', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return (data ?? []) as ExpenseIssuerRow[];
  },

  /** File every one of a supplier's still-unfiled documents at once. */
  async fileIssuer(workspaceId: string, issuerVat: string, categoryId: string): Promise<number> {
    const { data, error } = await (supabase as any).rpc('inbound_file_issuer', {
      p_workspace_id: workspaceId,
      p_issuer_vat: issuerVat,
      p_category_id: categoryId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  },

  /** Nothing converted these, so the list could only ever show what somebody re-keyed. */
  async fetchReceivedCreditNotes(workspaceId: string, limit = 100): Promise<ReceivedCreditNoteFetch> {
    const { data, error } = await (supabase as any).rpc('fetch_received_supplier_credit_notes', {
      p_workspace_id: workspaceId, p_limit: limit,
    });
    if (error) throw await edgeError(error);
    const res = ((data ?? [])[0] ?? {
      created: 0, skipped: 0, failed: 0, total: 0, remaining: 0, first_error: null,
    }) as ReceivedCreditNoteFetch;
    if (res.created > 0) {
      void flowEventService.emitToWorkspaceRoles(
        workspaceId, ['owner', 'admin'], 'credit_note.received', (userId) => ({
          type: 'credit_note.received',
          user_id: userId,
          workspace_id: workspaceId,
          created: res.created,
          amount: res.total,
          remaining: res.remaining,
          title: `${res.created} supplier credit note${res.created === 1 ? '' : 's'} recorded`,
          body: 'Credit a supplier issued you — it offsets what you owe them.',
          action_url: '/finance?tab=doc_credit_notes',
        }),
      );
    }
    return res;
  },

  /** How many are waiting, so the list can say so instead of looking complete. */
  async countUnfetchedCreditNotes(workspaceId: string): Promise<{ waiting: number; waiting_total: number }> {
    const { data, error } = await (supabase as any).rpc('count_unfetched_supplier_credit_notes', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return ((data ?? [])[0] ?? { waiting: 0, waiting_total: 0 });
  },

  /**
   * The ACCOUNT chooses the outcome: name one and the purchase is booked and the money leaves it;
   * leave it empty and the cost is settled OUTSIDE the books and excluded from the P&L.
   */
  async settleDocument(
    docId: string,
    opts: {
      bankAccountId?: string | null; paidOn?: string | null; amount?: number | null;
      note?: string | null;
      /** Only used to address the flow event — the RPC derives tenancy from the document. */
      workspaceId?: string | null;
    } = {},
  ): Promise<SettleOutcome> {
    const { data, error } = await (supabase as any).rpc('settle_inbound_document', {
      p_doc_id: docId,
      p_bank_account_id: opts.bankAccountId ?? null,
      p_paid_on: opts.paidOn ?? null,
      p_amount: opts.amount ?? null,
      p_note: opts.note ?? null,
    });
    if (error) throw await edgeError(error);
    const res = ((data ?? [])[0] ?? { outcome: 'unknown', supplier_bill_id: null, payment_id: null, amount: 0 }) as SettleOutcome;
    // Both outcomes are worth hearing about, and they are opposite facts: one cost entered the
    // books, one was deliberately kept out. Booking here emits the SAME event the bulk run does —
    // this surface books one document, and a flow that missed it would be watching two of three.
    if (opts.workspaceId && (res.outcome === 'settled_outside' || res.outcome === 'booked_and_paid')) {
      const ws = opts.workspaceId;
      const excluded = res.outcome === 'settled_outside';
      void flowEventService.emitToWorkspaceRoles(
        ws, ['owner', 'admin'], excluded ? 'expense.settled_outside' : 'expense.booked', (userId) => ({
          type: excluded ? 'expense.settled_outside' : 'expense.booked',
          user_id: userId,
          workspace_id: ws,
          document_id: docId,
          supplier_bill_id: res.supplier_bill_id ?? undefined,
          booked: excluded ? 0 : 1,
          amount: res.amount,
          note: opts.note ?? undefined,
          title: excluded ? 'A cost was settled outside the books' : 'An expense was booked and paid',
          body: excluded
            ? `It is excluded from the P&L, expenses and the VAT return, and counted apart. ${opts.note ?? ''}`.trim()
            : 'The purchase is booked as a supplier bill and the payment has left the account.',
          action_url: '/finance?tab=doc_expenses',
        }),
      );
    }
    return res;
  },

  /** Put an excluded cost back. A mis-click must not be permanent, or the P&L stays wrong. */
  async unsettleDocument(docId: string): Promise<boolean> {
    const { data, error } = await (supabase as any).rpc('unsettle_inbound_document', { p_doc_id: docId });
    if (error) throw await edgeError(error);
    return Boolean(data);
  },

  /** Per state: what is waiting to become an expense, and for the rest, why it never will. */
  async expenseSegments(workspaceId: string, from: string, to: string): Promise<ExpenseSegmentRow[]> {
    const { data, error } = await (supabase as any).rpc('get_expense_segments', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as ExpenseSegmentRow[];
  },

  async recordExpenseDocument(workspaceId: string, input: {
    docType: string; series: string; aa: string; issueDate: string;
    issuerVat: string | null; issuerName: string | null; issuerCountry: string;
    net: number; vatCategory: number; vatAmount: number; vatExemptionCategory: number | null;
    classificationType: string | null; classificationCategory: string;
  }): Promise<{ id: string }> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('inbound_documents').insert({
      workspace_id: workspaceId,
      source: 'platform',
      lines_source: 'user',
      status: 'new',
      doc_type: input.docType,
      series: input.series,
      aa: input.aa,
      issue_date: input.issueDate,
      issuer_vat: input.issuerVat,
      issuer_name: input.issuerName,
      issuer_country: input.issuerCountry,
      currency: 'EUR',
      total_net: input.net,
      total_vat: input.vatAmount,
      total_gross: input.net + input.vatAmount,
      lines: [{
        line_number: 1,
        net_value: input.net,
        vat_category: input.vatCategory,
        vat_amount: input.vatAmount,
        vat_exemption_category: input.vatExemptionCategory,
        item_description: input.issuerName,
      }],
      expenses_classification: [{
        line_number: 1,
        classification_type: input.classificationType,
        classification_category: input.classificationCategory,
        amount: input.net,
      }],
      created_by: auth?.user?.id ?? null,
    }).select('id').single();
    if (error) throw error;
    return data as { id: string };
  },

  async sendToMydata(workspaceId: string, documentId: string): Promise<{
    ok: boolean; mark?: string; uid?: string; errors?: string[];
  }> {
    const { data, error } = await supabase.functions.invoke('finance-mydata-send', {
      body: { action: 'send', workspace_id: workspaceId, document_id: documentId },
    });
    if (error) throw await edgeError(error);
    return data as { ok: boolean; mark?: string; uid?: string; errors?: string[] };
  },

  async checkMydataSendRights(workspaceId: string): Promise<{
    canSend: boolean; status: number; detail: string;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-mydata-send', {
      body: { action: 'check-rights', workspace_id: workspaceId },
    });
    if (error) throw await edgeError(error);
    return data as { canSend: boolean; status: number; detail: string };
  },

  async bookingBacklog(workspaceId: string): Promise<InboundBacklogRow[]> {
    const { data, error } = await (supabase as any).rpc('get_inbound_booking_backlog', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return (data ?? []) as InboundBacklogRow[];
  },

  async bookableByIssuer(workspaceId: string): Promise<InboundBookableIssuerRow[]> {
    const { data, error } = await (supabase as any).rpc('get_inbound_bookable_by_issuer', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return (data ?? []) as InboundBookableIssuerRow[];
  },

  /**
   * File a supplier to a category AND book its waiting documents, in one server transaction.
   * Filing alone changes no figure anyone can see; booking alone produces Uncategorized expenses.
   * Bounded server-side — a run books a stated number rather than draining the inbox.
   */
  async bookIssuer(
    workspaceId: string,
    issuerVat: string,
    opts: { categoryId?: string | null; limit?: number } = {},
  ): Promise<InboundIssuerBookingResult> {
    const { data, error } = await (supabase as any).rpc('book_inbound_issuer', {
      p_workspace_id: workspaceId,
      p_issuer_vat: issuerVat,
      p_category_id: opts.categoryId ?? null,
      p_limit: opts.limit ?? 100,
    });
    // Async. Un-awaited it throws a Promise, and the caller toasts "[object Promise]".
    if (error) throw await edgeError(error);
    const res = ((data ?? [])[0] ?? {
      filed: 0, booked: 0, skipped: 0, failed: 0, booked_total: 0, remaining: 0, first_error: null,
    }) as InboundIssuerBookingResult;
    // Emitted HERE rather than at each screen: three surfaces book, and a payload built three
    // times drifts. Fire-and-forget by contract — a flow must never break the booking.
    if (res.booked > 0) {
      void flowEventService.emitToWorkspaceRoles(
        workspaceId, ['owner', 'admin'], 'expense.booked', (userId) => ({
          type: 'expense.booked',
          user_id: userId,
          workspace_id: workspaceId,
          issuer_vat: issuerVat,
          booked: res.booked,
          amount: res.booked_total,
          remaining: res.remaining,
          title: `${res.booked} expense${res.booked === 1 ? '' : 's'} booked`,
          body: `${res.booked} received document${res.booked === 1 ? '' : 's'} became supplier bills. They now reach Payables, the P&L and the VAT return.`,
          action_url: '/finance?tab=doc_expenses',
        }),
      );
    }
    return res;
  },

  /**
   * The best correlation for every document in the workspace that has one — a ΔΑ and the ΤΙΜ that
   * bills it, an invoice and the credit note that corrects it.
   *
   * ONE call for the whole list. Asking per row would be 500 round trips, and picking the "best"
   * edge here would be a second copy of the precedence rule `get_inbound_document_detail` already
   * applies — so SQL decides and this only carries the answer across.
   */
  async linkSummary(workspaceId: string): Promise<Record<string, InboundLinkSummary>> {
    const { data, error } = await supabase.rpc('get_inbound_link_summary', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    const byDoc: Record<string, InboundLinkSummary> = {};
    for (const row of (data ?? []) as InboundLinkSummary[]) byDoc[row.doc_id] = row;
    return byDoc;
  },

  /**
   * What was on a document, taking its itemisation from a correlated delivery note when the
   * document itself names nothing.
   *
   * `money.line_costs === 'unallocated'` is the value that matters: the document total is real and
   * the per-item split is NOT KNOWN. Never divide the total by the line count to fill it in.
   */
  async documentDetail(docId: string): Promise<InboundDocumentDetail | null> {
    const { data, error } = await supabase.rpc('get_inbound_document_detail', { p_doc_id: docId });
    if (error) throw error;
    return (data ?? null) as InboundDocumentDetail | null;
  },

  /** Accept a suggested correlation. Records WHO accepted it — that is what makes it readable. */
  async confirmLink(linkId: string): Promise<void> {
    const { error } = await supabase.rpc('confirm_inbound_document_link', { p_link_id: linkId });
    if (error) throw error;
  },

  /**
   * Dismiss a correlation. Marks it rejected rather than deleting it, so the next sync does not
   * propose it again — and so an issuer's own (wrong) declaration stays on the record.
   */
  async rejectLink(linkId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_inbound_document_link', { p_link_id: linkId });
    if (error) throw error;
  },

  /** Link two documents by hand, from the money document towards what it was for. */
  async linkDocuments(fromDocId: string, toDocId: string): Promise<void> {
    const { error } = await supabase.rpc('link_inbound_documents', {
      p_from_doc_id: fromDocId,
      p_to_doc_id: toDocId,
    });
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
