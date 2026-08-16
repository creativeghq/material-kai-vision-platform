// Sales/Finance module — single service surface.
// Owns everything finance-related: invoices, payments, allocations,
// purchase orders, supplier bills, credit notes, quote activities,
// and report aggregations (AR/AP aging, P&L, cash flow, follow-up queue).
// Heavy mutations go through Postgres SECURITY DEFINER RPCs so that:
//   - Sequential number generation stays race-free
//   - Status transitions are atomic
//   - The cost-snapshot rule from PR-A is honored end-to-end

import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { normalizeIban } from '@/utils/iban';
import { round2, extractNet, vatCategory } from '@/modules/finance/lib/vatMath';
import { flowEventService } from '@/services/flows/flowEventService';
import { EmailSendError } from '@/modules/email/services/emailService';
import { unwrapEmailSendError } from '@/modules/email/lib/emailSenderGate';
import type { BuyerIdentity } from '@/modules/finance/utils/salesDocumentKind';

// ─── Finance flow events (fire-and-forget) ───────────────────────────────────
// Emitted when a document is issued or a payment is received, so seeded
// system-default flows can notify the workspace + email the customer. Never
// throws — a flow failure must not break issuance/payment recording.

/** Resolve a party's display name + email + linked app user (for bell + email). */
async function resolvePartyContactInfo(
  companyId: string | null | undefined,
  contactId: string | null | undefined,
): Promise<{ name: string | null; email: string | null; userId: string | null }> {
  try {
    if (companyId) {
      const { data } = await supabase.from('crm_companies').select('name, email').eq('id', companyId).maybeSingle();
      return { name: (data?.name as string) ?? null, email: (data?.email as string) ?? null, userId: null };
    }
    if (contactId) {
      const { data } = await supabase.from('crm_contacts').select('name, first_name, last_name, email, user_id').eq('id', contactId).maybeSingle();
      const name = (data?.name as string) || [data?.first_name, data?.last_name].filter(Boolean).join(' ') || null;
      return { name, email: (data?.email as string) ?? null, userId: (data?.user_id as string) ?? null };
    }
  } catch { /* non-fatal */ }
  return { name: null, email: null, userId: null };
}

/**
 * Fire the invoice_issued / receipt_issued flow (notify workspace + email customer) for a
 * freshly-issued document. These are SERVER_ONLY_EVENTS in flow-engine — the browser is
 * forbidden from emitting them (a client emit 403s and is silently dropped), so we relay through
 * the finance-issue-invoice edge function, which emits from trusted server code. Fire-and-forget:
 * a flow hiccup must never break issuance.
 */
async function emitDocumentIssuedEvent(invoiceId: string): Promise<void> {
  try {
    await supabase.functions.invoke('finance-issue-invoice', {
      body: { emit_issued: { invoice_id: invoiceId } },
    });
  } catch { /* flow emit is best-effort */ }
}

// =============================================================================
// Types
// =============================================================================

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'credit_noted'
  | 'void';

export interface Invoice {
  id: string;
  workspace_id: string;
  internal_number: string;
  quote_id: string | null;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal_net: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  /** CASH only. Credit-note settlement is `amount_credited` — see the note there. */
  amount_paid: number;
  /**
   * Settled by credit note rather than by cash.
   *
   * `_recompute_invoice_status_after_allocation` splits the two on purpose: it sums allocations
   * carrying a `credit_note_id` into this column and leaves `amount_paid` as money that actually
   * arrived, so `paid_at` never claims a date for an invoice nobody paid. Both reduce `amount_due`.
   * The column was maintained correctly from the day it shipped and read by nothing — this type
   * did not even declare it — so a credited invoice and a paid one rendered identically.
   */
  amount_credited: number;
  amount_due: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  /** Invoice design template snapshot (set at creation; nullable for legacy rows). */
  template_id: string | null;
  template_colors: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  source_quote_item_id: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discounted_price: number | null;
  unit_cost_snapshot: number | null;
  line_total: number;
  line_cost: number;
  line_margin: number;
  added_at: string;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
  payments?: PaymentWithAllocation[];
  credit_notes?: CreditNote[];
}

/**
 * The rungs of the markup ladder, in the order `_pricing_markup_ladder` tries them:
 * product → brand → supplier → category → the workspace default.
 *
 * Mirrors `pricing_rules_scope_check`. It is the second copy of that vocabulary, which is the
 * shape that killed the brand rung: the resolver read `scope='brand'` and `BrandMarkupCard`
 * wrote it, but the CHECK only ever allowed ('category','product'), so every brand markup save
 * raised a constraint violation and the rung could never hold a row. Guarded by
 * tests/unit/pricingRuleScopes.test.ts — change the CHECK and this list in the same commit.
 */
export type PricingRuleScope = 'category' | 'product' | 'brand' | 'supplier';

export type PaymentDirection = 'in' | 'out';
/**
 * Mirrors `payments_method_check`. `iris` was added 2026-07-31: the POS offers
 * cash / card / IRIS and stamps the right AADE code (3 / 7 / 8) on the fiscal document, but
 * the ledger had no IRIS member, so the register recorded it as `card` — making the ledger
 * disagree with the filed document and collapsing IRIS into card in the Z-report breakdown.
 */
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'iris' | 'check' | 'other';

/** Human display labels for payment methods (Title Case). */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Payment on Hands',
  card: 'Card',
  iris: 'IRIS',
  bank_transfer: 'Bank Payment',
  check: 'Check Payment',
  other: 'Other',
};

/** Title-case a payment method for display; falls back gracefully for unknown values. */
export const paymentMethodLabel = (m: string | null | undefined): string =>
  (m && PAYMENT_METHOD_LABEL[m as PaymentMethod]) ||
  (m ? m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

/**
 * Which payment methods are meaningful for a given account kind.
 *
 * The account already says HOW the money moved for every kind except `bank` (a transfer and a
 * cheque both clear through the same bank account) and `other`. So the UI only asks for a
 * method in those two cases — everywhere else it is derived, not typed.
 */
export const methodsForAccountKind = (kind: BankAccountKind | null | undefined): PaymentMethod[] => {
  switch (kind) {
    case 'cash': return ['cash'];
    case 'card': return ['card'];
    case 'online': return ['other'];
    // Bank accounts clear three ways the operator cares about: a transfer (Bank Payment), a cheque
    // (Check Payment), or cash handed over (Payment on Hands). 'other'/'card' stay valid enum values
    // for legacy rows but aren't offered here.
    case 'bank': return ['bank_transfer', 'check', 'cash'];
    default: return ['bank_transfer', 'cash', 'check'];
  }
};

/** The method implied by an account kind — used when the UI doesn't ask. */
export const defaultMethodForAccountKind = (kind: BankAccountKind | null | undefined): PaymentMethod =>
  methodsForAccountKind(kind)[0];

/** Group headings for the "Paid from" picker, in display order. */
export const ACCOUNT_KIND_LABEL: Record<BankAccountKind, string> = {
  bank: 'Banks',
  cash: 'Cash',
  card: 'Cards',
  online: 'Online',
  other: 'Other',
};

export const ACCOUNT_KIND_ORDER: BankAccountKind[] = ['bank', 'cash', 'card', 'online', 'other'];

export interface Payment {
  id: string;
  workspace_id: string;
  direction: PaymentDirection;
  amount: number;
  currency: string;
  method: PaymentMethod | null;
  paid_at: string;
  counterparty_contact_id: string | null;
  counterparty_company_id: string | null;
  bank_account_id: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export type BankAccountKind = 'bank' | 'cash' | 'card' | 'online' | 'other';

export interface BankAccount {
  id: string;
  workspace_id: string;
  name: string;
  kind: BankAccountKind;
  currency: string;
  iban: string | null;
  account_ref: string | null;
  opening_balance: number;
  is_default: boolean;
  is_active: boolean;
  show_on_invoice: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccountBalance {
  bank_account_id: string;
  workspace_id: string;
  name: string;
  kind: BankAccountKind;
  currency: string;
  iban: string | null;
  account_ref: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  opening_balance: number;
  show_on_invoice: boolean;
  total_in: number;
  total_out: number;
  current_balance: number;
  payment_count: number;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  supplier_bill_id: string | null;
  amount: number;
  created_at: string;
}

export interface PaymentWithAllocation extends Payment {
  allocations: PaymentAllocation[];
  credit_number?: string | null;
  // Enriched by listPayments for the Payments list (party label + order number for the row).
  party_name?: string | null;
  order_number?: string | null;
  /** Cash on this payment not settled against anything — DERIVED by `get_payment_remainders`.
   *  Present only on rows from `listPayments`; never recompute it from `allocations`. */
  unallocated?: number;
  /** Which account the money moved through — what the lists print instead of `method`. */
  bank_account_name?: string | null;
  /** What this payment settled, one entry per allocation — so the money ledger says which
   *  invoice / expense / order it went against, not just how much was allocated. Credit-note
   *  allocations never appear here: they are sourced from a credit note, not a payment. */
  settled?: Array<{
    kind: 'invoice' | 'expense' | 'order';
    id: string;
    label: string;
    amount: number;
  }>;
}

/** Customer credit we stopped holding and booked as income (see `releaseCustomerCredit`). */
export interface CreditRelease {
  id: string;
  workspace_id: string;
  counterparty_company_id: string | null;
  counterparty_contact_id: string | null;
  amount: number;
  currency: string;
  released_at: string;
  category_id: string | null;
  notes: string | null;
  created_at: string;
}

export type SupplierBillStatus =
  | 'received'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'disputed'
  | 'void';

export interface SupplierBill {
  id: string;
  workspace_id: string;
  supplier_bill_number: string | null;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  status: SupplierBillStatus;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * An open expense offered as a payment target, annotated with where it came from.
 *
 * An expense IS a `supplier_bills` row. When it was created from a myDATA received document
 * (the Expenses Inbox), `inbox` carries the originating document. That link lives ONLY on
 * `inbound_documents.created_supplier_bill_id` — there is deliberately no back-pointer column
 * on the bill, so there is nothing to drift out of sync.
 */
export interface PayableExpense {
  id: string;
  supplier_bill_number: string | null;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  supplier_name: string | null;
  /** Resolved display name — CRM company/contact, else the one-off `supplier_name`. */
  party_name: string | null;
  currency: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  issued_at: string | null;
  due_at: string | null;
  status: SupplierBillStatus;
  category_id: string | null;
  notes: string | null;
  /** The order this expense is matched against, if any. One order holds MANY expenses. */
  order_id: string | null;
  /** Non-null when this expense came from the Inbox (a myDATA received document). */
  inbox: {
    document_id: string;
    mark: string;
    issuer_name: string | null;
    issuer_vat: string | null;
    series: string | null;
    aa: string | null;
    issue_date: string | null;
  } | null;
}

/**
 * One thing that settled an expense — a `payment_allocations` row resolved through its SOURCE.
 * An expense is relieved either by cash (a money-out payment) or by a supplier credit note, and
 * BOTH count toward `amount_paid`. Listing only the cash would make "paid so far" disagree with
 * the rows underneath it.
 */
export interface ExpenseSettlement {
  allocation_id: string;
  source: 'payment' | 'supplier_credit_note';
  /** Settled against the expense, in the expense's currency. */
  amount: number;
  /** Payment date, or the credit note's issue date. */
  occurred_at: string;
  /** Payment id when cash; supplier credit note id when credited. */
  source_id: string;
  /** Credit-note number when credited; null for cash. */
  document_number: string | null;
  method: PaymentMethod | null;
  currency: string;
  reference: string | null;
  notes: string | null;
  bank_account_id: string | null;
  /** The account the cash moved through — what the UI shows instead of the derived method. */
  bank_account_name: string | null;
}

/**
 * What `get_payment_remainders` returns for one payment. `unallocated` is the canonical
 * "how much of this cash is still free" — never recompute it from an embedded allocations array.
 */
export interface PaymentRemainder {
  payment_id: string;
  amount: number;
  allocated: number;
  unallocated: number;
  currency: string;
}

/** An already-recorded money-out payment that still has room to be attached to an expense. */
export interface AttachablePayment {
  id: string;
  amount: number;
  allocated: number;
  unallocated: number;
  currency: string;
  paid_at: string;
  method: PaymentMethod | null;
  reference: string | null;
  party_name: string | null;
  counterparty_company_id: string | null;
  counterparty_contact_id: string | null;
}

export type { BuyerIdentity, SalesDocumentKind } from '@/modules/finance/utils/salesDocumentKind';

export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringExpense {
  id: string;
  workspace_id: string;
  category_id: string;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  description: string | null;
  reference_prefix: string | null;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  cadence: RecurringCadence;
  interval_count: number;
  due_days: number;
  next_run_at: string;
  last_run_at: string | null;
  auto_pay: boolean;
  bank_account_id: string | null;
  payment_method: string | null;
  is_active: boolean;
  notes: string | null;
  /**
   * Defaults stamped onto each generated supplier_bill by `run_due_recurring_expenses`.
   * The BILL carries the real link — job costing reads the bill, never this template — so these
   * are a convenience, not a second place the project/order association lives.
   */
  project_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditNote {
  id: string;
  workspace_id: string;
  credit_note_number: string;
  invoice_id: string;
  amount: number;
  currency: string;
  reason: string;
  issued_at: string;
  created_at: string;
}

export interface SupplierCreditNote {
  id: string;
  workspace_id: string;
  supplier_credit_note_number: string;
  supplier_bill_id: string | null;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  total: number;
  reason: string | null;
  external_mark: string | null;
  status: 'recorded' | 'void';
  issued_at: string;
  created_at: string;
}

export type QuoteActivityKind =
  | 'note'
  | 'call'
  | 'email'
  | 'sms'
  | 'meeting'
  | 'follow_up_scheduled'
  | 'status_change'
  | 'viewed'
  | 'sent'
  | 'reminder_dispatched';

export interface QuoteActivity {
  id: string;
  quote_id: string;
  user_id: string | null;
  kind: QuoteActivityKind;
  body: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AgeBucket = 'current' | '0-30' | '31-60' | '61-90' | '90+' | 'paid' | 'no_due_date';

export interface AgingRow {
  id: string;
  workspace_id: string;
  customer_contact_id?: string | null;
  customer_company_id?: string | null;
  supplier_contact_id?: string | null;
  supplier_company_id?: string | null;
  internal_number?: string;
  supplier_bill_number?: string | null;
  total: number;
  amount_paid: number;
  amount_due: number;
  /**
   * The document's own currency, from vw_ar_aging / vw_ap_aging.
   *
   * Absent, every AR/AP figure falls through to formatMoney's EUR
   * default: a USD invoice's 1,000 rendered as €1,000 AND was summed into the € bucket totals,
   * the DSO base and the AR-outstanding KPI. Synthesised rows (orders, credits) must set it from
   * their own source row, never assume the workspace base.
   */
  currency: string;
  due_at: string | null;
  issued_at: string | null;
  status: string;
  age_bucket: AgeBucket;
  days_overdue: number;
  /** The date the row actually ages against. Same as `due_at` for invoices/bills; for an
   *  un-invoiced order it falls back to order date + the workspace's default payment terms, so
   *  real overdue money can't hide in the "no due date" bucket. */
  effective_due_at?: string | null;
  /** True when `effective_due_at` came from payment terms rather than an operator-set date. */
  due_from_terms?: boolean;
  /** 'invoice' = real invoice/supplier bill; 'manual' = un-invoiced receivable/payable;
   *  'order' = a confirmed order not yet invoiced (synthesised client-side, not from the view);
   *  'credit' = customer money held on account (synthesised client-side from unallocated inbound
   *  payments). Amounts are POSITIVE like every other row — it is "money we hold", not money owed
   *  to us, so aggregates must key off this kind (exclude from "owed" sums, sum separately as
   *  credit held) rather than rely on a sign. Negative on-screen numbers are banned (operator). */
  entry_kind?: 'invoice' | 'manual' | 'order' | 'credit';
  /** Free-text label for manual entries (null for invoices/bills). */
  description?: string | null;
  /** Resolved counterparty (supplier/customer) display name, for search + display. */
  party_name?: string | null;
  /** Internal finance category on the document (nullable). */
  category_id?: string | null;
  category_name?: string | null;
  /** Linked order (for 'order' and 'credit' rows) — lets the row open the specific order. */
  order_id?: string | null;
  order_number?: string | null;
  /** Credit document number (for 'credit' rows). */
  credit_number?: string | null;
}

/**
 * Per-customer AR aging roll-up (from vw_customer_aging_buckets).
 * Exclusive buckets by days past due — an outstanding amount lands in exactly one.
 */
export interface CustomerAgingBuckets {
  workspace_id: string;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  party_name: string | null;
  open_doc_count: number;
  total_outstanding: number;
  /** Not yet due / no due date. */
  not_due: number;
  /** 1..30 days past due — "last 30 days". */
  due_0_30: number;
  /** 31..90 days past due — "more than 30 days". */
  due_31_90: number;
  /** >90 days past due — "more than 90 days". */
  due_90_plus: number;
  max_days_overdue: number;
  /**
   * Identity key = COALESCE(company_id, contact_id). A company IS the customer when present.
   * Group and join on this rather than re-deriving the COALESCE per call site — the view used to
   * group on (company_id, contact_id) and split one customer across several rows whenever some of
   * their invoices carried only a company. (audit #287 T3-14)
   */
  customer_id: string | null;
  /**
   * Rows are per (customer, CURRENCY). Amounts are never summed across currencies — a customer
   * with a EUR and a USD invoice previously reported their total as one currency-less number.
   * Anything rendering these MUST show the currency, or two honest rows read as a duplicate bug.
   * (audit #287 T2-8)
   */
  currency: string | null;
}


export interface FollowUpRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  quote_number: string | null;
  name: string | null;
  status: string;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  grand_total: number | null;
  currency: string | null;
  submitted_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  days_since_activity: number | null;
  last_activity_logged_at: string | null;
  next_scheduled_follow_up: string | null;
}

export interface PnlRow {
  workspace_id: string;
  period_month: string;
  invoice_count: number;
  revenue_net: number | null;
  cogs: number | null;
  gross_margin: number | null;
  gross_margin_pct: number | null;
}

export interface CashFlowRow {
  workspace_id: string;
  expected_date: string;
  direction: 'in' | 'out';
  amount: number;
}

// =============================================================================
// Invoices
// =============================================================================

const _financeServiceCore = {
  // -------- Invoices --------

  async listInvoices(opts: {
    workspaceId?: string;
    status?: InvoiceStatus[];
    customerContactId?: string;
    customerCompanyId?: string;
    limit?: number;
  } = {}): Promise<Invoice[]> {
    let q = supabase.from('invoices').select('*').order('issued_at', { ascending: false, nullsFirst: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.status && opts.status.length > 0) q = q.in('status', opts.status);
    if (opts.customerContactId) q = q.eq('customer_contact_id', opts.customerContactId);
    if (opts.customerCompanyId) q = q.eq('customer_company_id', opts.customerCompanyId);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Invoice[];
  },

  /** "Send email" — email the invoice summary + MARK/QR to the customer. */
  async sendInvoiceEmail(invoiceId: string, to?: string): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase.functions.invoke('finance-send-invoice-email', { body: { invoice_id: invoiceId, to } });
    // Surface a typed error so UI can open the Connect-email gate on `workspace_sender_required`.
    if (error) { const { code, message } = await unwrapEmailSendError(error); throw new EmailSendError(message, (code as any) ?? 'unknown'); }
    return { data, error };
  },

  /** Render (or fetch cached) the customer-facing invoice PDF. Returns a 7-day signed URL. */
  async generateInvoicePdf(invoiceId: string, regenerate = false): Promise<{ pdf_url: string | null; pdf_storage_path: string | null }> {
    const { data, error } = await supabase.functions.invoke('finance-invoice-pdf', { body: { invoice_id: invoiceId, regenerate } });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || 'PDF generation failed');
    return { pdf_url: data?.pdf_url ?? null, pdf_storage_path: data?.pdf_storage_path ?? null };
  },

  /** Re-sign an already-generated invoice PDF without re-rendering. */
  async refreshInvoicePdfUrl(storagePath: string): Promise<string | null> {
    const { data } = await supabase.storage.from('pdf-documents').createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? null;
  },

  /** Render (or fetch cached) the credit-note PDF (5.1/5.2). */
  async generateCreditNotePdf(creditNoteId: string, regenerate = false): Promise<{ pdf_url: string | null }> {
    const { data, error } = await supabase.functions.invoke('finance-invoice-pdf', { body: { credit_note_id: creditNoteId, regenerate } });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || 'PDF generation failed');
    return { pdf_url: data?.pdf_url ?? null };
  },

  /** Payment receipt (απόδειξη είσπραξης) PDF for a recorded payment. */
  async generatePaymentReceiptPdf(paymentId: string, regenerate = false): Promise<{ pdf_url: string | null; pdf_storage_path: string | null; receipt_number: string | null }> {
    const { data, error } = await supabase.functions.invoke('finance-invoice-pdf', { body: { payment_id: paymentId, regenerate } });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || 'Receipt generation failed');
    return { pdf_url: data?.pdf_url ?? null, pdf_storage_path: data?.pdf_storage_path ?? null, receipt_number: data?.receipt_number ?? null };
  },

  /**
   * (Re)send the payment voucher to the counterparty by email — direction-aware, via Flows (never a
   * hardcoded email-api call). Money IN → the customer's receipt (απόδειξη είσπραξης) through the
   * seeded `payment_received` flow. Money OUT → the supplier's payment voucher (απόδειξη πληρωμής)
   * through the seeded `payment_sent` flow. Returns whether an email was on file for that party (the
   * flow no-ops its email step when there isn't one).
   */
  async emailPaymentReceipt(paymentId: string): Promise<{ emailed: boolean; email: string | null }> {
    const { data: p, error } = await supabase.from('payments')
      .select('id, workspace_id, amount, currency, direction, counterparty_company_id, counterparty_contact_id')
      .eq('id', paymentId).single();
    if (error) throw error;
    const out = (p as any).direction === 'out';
    const party = await resolvePartyContactInfo((p as any).counterparty_company_id, (p as any).counterparty_contact_id);
    const currency = (p as any).currency ?? 'EUR';
    const amount = `${Number((p as any).amount).toFixed(2)} ${currency}`;
    let receiptUrl: string | null = null;
    try { receiptUrl = (await financeService.generatePaymentReceiptPdf(paymentId)).pdf_url; } catch { /* voucher optional */ }
    if (out) {
      // Supplier payment voucher — the "Paid to" acknowledgment, via the payment_sent flow.
      const receiptLine = receiptUrl ? `<p><a href="${receiptUrl}">Download the payment voucher</a></p>` : '';
      flowEventService.emit('payment_sent', {
        type: 'payment_sent',
        user_id: party.userId ?? undefined,
        supplier_email: party.email ?? undefined,
        supplier_name: party.name ?? undefined,
        payment_id: paymentId,
        amount,
        currency,
        workspace_id: (p as any).workspace_id,
        receipt_url: receiptUrl ?? undefined,
        receipt_line: receiptLine,
        title: `Payment voucher — ${amount}`,
        body: `A payment of ${amount} to ${party.name ?? 'this supplier'} has been recorded. ${receiptUrl ? 'The voucher is attached below.' : ''}`.trim(),
        action_url: '/finance?tab=doc_payments',
      });
      return { emailed: !!party.email, email: party.email ?? null };
    }
    const receiptLine = receiptUrl ? `<p><a href="${receiptUrl}">Download your receipt</a></p>` : '';
    flowEventService.emit('payment_received', {
      type: 'payment_received',
      user_id: party.userId ?? undefined,
      customer_email: party.email ?? undefined,
      customer_name: party.name ?? undefined,
      payment_id: paymentId,
      amount,
      currency,
      workspace_id: (p as any).workspace_id,
      receipt_url: receiptUrl ?? undefined,
      receipt_line: receiptLine,
      title: `Payment receipt — ${amount}`,
      body: `Your payment of ${amount} has been recorded. ${receiptUrl ? 'Your receipt is attached below.' : ''}`.trim(),
      action_url: '/finance?tab=parties',
    });
    return { emailed: !!party.email, email: party.email ?? null };
  },

  /** "Use as template" — clone an invoice into a fresh DRAFT (no fiscal/MARK). */
  async duplicateInvoice(invoiceId: string): Promise<string> {
    const src = await this.getInvoice(invoiceId);
    // Derived draft number only — the gapless myDATA series/aa is allocated at issue by
    // mark_invoice_issued, never when a draft (or template clone) is created.
    const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', {
      p_workspace_id: src.workspace_id,
    });
    if (numErr) throw numErr;
    const { data: inv, error: insErr } = await supabase
      .from('invoices')
      .insert({
        workspace_id: src.workspace_id,
        internal_number: draftNumber as string,
        series: null,
        series_number: null,
        status: 'draft',
        customer_contact_id: src.customer_contact_id,
        customer_company_id: src.customer_company_id,
        currency: src.currency,
        vat_rate: src.vat_rate,
        document_type: (src as any).document_type ?? null,
        branch_code: (src as any).branch_code ?? 0,
        subtotal_net: src.subtotal_net,
        vat_amount: src.vat_amount,
        total: src.total,
        notes: src.notes,
      } as any)
      .select()
      .single();
    if (insErr) throw insErr;
    // Clone the full financially-meaningful line — NOT just price/qty. Dropping unit_cost_snapshot
    // makes the copy show 100% margin (line_cost/line_margin are generated from it); dropping the
    // per-line tax/withholding/discount fields silently changes the document's tax breakdown.
    // (line_cost / line_margin are GENERATED columns — never inserted.)
    const items = (src.items ?? []).map((it: any) => ({
      invoice_id: inv.id,
      product_id: it.product_id ?? null,
      description: it.description,
      sku: it.sku ?? null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discounted_price: it.discounted_price ?? null,
      unit_cost_snapshot: it.unit_cost_snapshot ?? null,
      net_value: it.net_value ?? null,
      vat_amount: it.vat_amount ?? null,
      line_total: it.line_total,
      vat_category: it.vat_category ?? null,
      measurement_unit_code: it.measurement_unit_code ?? null,
      income_classification_type: it.income_classification_type ?? null,
      income_classification_category: it.income_classification_category ?? null,
      selected_attributes: it.selected_attributes ?? null,
      selected_color: it.selected_color ?? null,
      selected_size: it.selected_size ?? null,
      withheld_amount: it.withheld_amount ?? null,
      withheld_category: it.withheld_category ?? null,
      fees_amount: it.fees_amount ?? null,
      fees_category: it.fees_category ?? null,
      stamp_duty_amount: it.stamp_duty_amount ?? null,
      stamp_duty_category: it.stamp_duty_category ?? null,
      other_taxes_amount: it.other_taxes_amount ?? null,
      other_taxes_category: it.other_taxes_category ?? null,
      deductions_amount: it.deductions_amount ?? null,
      vat_exemption_category: it.vat_exemption_category ?? null,
      line_comments: it.line_comments ?? null,
    }));
    if (items.length) {
      const { error: itErr } = await supabase.from('invoice_items').insert(items);
      if (itErr) throw itErr;
    }
    return inv.id as string;
  },

  async getInvoice(invoiceId: string): Promise<InvoiceWithItems> {
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    if (invErr) throw invErr;

    const { data: items, error: itemsErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('added_at', { ascending: true });
    if (itemsErr) throw itemsErr;

    const { data: allocs } = await supabase
      .from('payment_allocations')
      .select('*, payment:payments(*, bank_account:finance_bank_accounts(name))')
      .eq('invoice_id', invoiceId);

    const payments: PaymentWithAllocation[] = [];
    if (allocs) {
      const byPayment = new Map<string, PaymentWithAllocation>();
      for (const a of allocs as Array<PaymentAllocation & { payment: Payment & { bank_account?: { name: string } | null } }>) {
        if (!a.payment) continue;
        const existing = byPayment.get(a.payment.id);
        if (existing) {
          existing.allocations.push({ ...a, payment: undefined } as unknown as PaymentAllocation);
        } else {
          byPayment.set(a.payment.id, {
            ...a.payment,
            bank_account_name: a.payment.bank_account?.name ?? null,
            allocations: [{ ...a, payment: undefined } as unknown as PaymentAllocation],
          });
        }
      }
      payments.push(...byPayment.values());
    }

    const { data: creditNotes } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('issued_at', { ascending: false });

    return {
      ...(invoice as Invoice),
      items: (items ?? []) as InvoiceItem[],
      payments,
      credit_notes: (creditNotes ?? []) as CreditNote[],
    };
  },

  async issueInvoiceFromQuote(
    quoteId: string,
    opts: { issueNow?: boolean } = {},
  ): Promise<{ invoice_id: string; invoice: Invoice | null }> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: {
        quote_id: quoteId,
        issue_now: opts.issueNow === true,
      },
    });
    if (error) throw await edgeError(error);
    return data as { invoice_id: string; invoice: Invoice | null };
  },

  async markInvoiceIssued(invoiceId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_invoice_issued', { p_invoice_id: invoiceId });
    if (error) throw error;
    // Notify the workspace + email the customer via the seeded flow (fire-and-forget).
    void emitDocumentIssuedEvent(invoiceId);
  },

  async updateInvoice(invoiceId: string, patch: Partial<Invoice>): Promise<Invoice> {
    const allowed: Record<string, any> = {
      due_at: patch.due_at,
      payment_terms_days: patch.payment_terms_days ?? undefined,
      notes: patch.notes,
      status: patch.status,
    };
    // Tools → Change category. Only set when explicitly provided (incl. null to clear),
    // so a generic patch never accidentally nulls the category. (Financial fields stay
    // locked by the DB immutability guard regardless.)
    if ('category_id' in patch) allowed.category_id = (patch as any).category_id;
    const { data, error } = await supabase
      .from('invoices')
      .update(allowed)
      .eq('id', invoiceId)
      .select()
      .single();
    if (error) throw error;
    return data as Invoice;
  },

  async voidInvoice(invoiceId: string, reason: string): Promise<void> {
    // A locally-voided invoice that was already transmitted to myDATA would leave
    // the fiscal record live while the local row reads "void" — a compliance gap.
    // A transmitted invoice must be reversed with a credit note instead.
    const { data: inv, error: readErr } = await supabase
      .from('invoices')
      .select('fiscal_status, fiscal_mark, status')
      .eq('id', invoiceId)
      .single();
    if (readErr) throw readErr;
    const transmitted = (inv as any)?.fiscal_mark
      || ['accepted', 'offline'].includes((inv as any)?.fiscal_status);
    if (transmitted) {
      throw new Error('This invoice was transmitted to myDATA and cannot be voided. Issue a credit note to reverse it.');
    }
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'void', notes: reason })
      .eq('id', invoiceId);
    if (error) throw error;
  },

  // -------- Payments --------

  async recordPayment(input: {
    workspaceId: string;
    direction: PaymentDirection;
    amount: number;
    currency?: string;
    method?: PaymentMethod;
    paidAt?: string;
    counterpartyContactId?: string | null;
    counterpartyCompanyId?: string | null;
    /** Free-text payee name when the counterparty is NOT a saved CRM company/contact (one-off). */
    counterpartyName?: string | null;
    reference?: string | null;
    notes?: string | null;
    /** Payment currency → workspace base currency, at paid_at. Defaults to 1. */
    fxRateToBase?: number;
    /** Optional finance category. */
    categoryId?: string | null;
    /** Which bank/cash account the money moved through (in → deposited to / out → paid from). */
    bankAccountId?: string | null;
    /** The counterparty's OWN bank (crm_bank_accounts) this money moved to/from — recorded on a
     *  Bank Payment for traceability. Distinct from bankAccountId (your treasury account). */
    counterpartyBankAccountId?: string | null;
    /** Money-in only: generate + email the receipt to the customer (default true). When
     *  false, the payment is recorded silently — no receipt, no customer notification. */
    sendReceipt?: boolean;
    /** Link the payment to an order (drives orders.payment_status). Optional — also back-filled
     *  by the DB when the payment is allocated to that order's invoice/bill. */
    orderId?: string | null;
    /**
     * Allocations may sum to LESS than the payment (remainder = customer credit) but not
     * more. `amount` is the value applied to the target in the TARGET's currency; for a
     * cross-currency payment also pass `amount_doc` (payment currency) + `fx_rate`
     * (payment→target). When omitted they default to `amount` / 1 (same-currency).
     */
    allocations: Array<{
      target_id: string; target_type: 'invoice' | 'supplier_bill';
      amount: number; amount_doc?: number; fx_rate?: number;
    }>;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('record_payment_fx', {
      p_workspace_id: input.workspaceId,
      p_direction: input.direction,
      p_amount: input.amount,
      p_currency: input.currency ?? 'EUR',
      p_fx_rate_to_base: input.fxRateToBase ?? 1,
      p_method: input.method ?? null,
      p_paid_at: input.paidAt ?? new Date().toISOString(),
      p_counterparty_contact_id: input.counterpartyContactId ?? null,
      p_counterparty_company_id: input.counterpartyCompanyId ?? null,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_allocations: input.allocations.map((a) => ({
        target_type: a.target_type,
        target_id: a.target_id,
        amount_doc: a.amount_doc ?? a.amount,
        fx_rate: a.fx_rate ?? 1,
      })),
      p_category_id: input.categoryId ?? null,
      p_bank_account_id: input.bankAccountId ?? null,
      p_order_id: input.orderId ?? null,
    });
    if (error) throw error;
    // The RPC doesn't carry the counterparty bank / ad-hoc payee name — stamp them on the created row.
    const postInsert: Record<string, unknown> = {};
    if (input.counterpartyBankAccountId) postInsert.counterparty_bank_account_id = input.counterpartyBankAccountId;
    if (input.counterpartyName && !input.counterpartyCompanyId && !input.counterpartyContactId) postInsert.counterparty_name = input.counterpartyName;
    if (Object.keys(postInsert).length > 0 && data) {
      // `error` is checked here like every other write in this file. Discarding it dropped the
      // counterparty bank account and the one-off payee name silently — the payment then showed
      // a blank party while recordPayment reported success. Not fatal (the payment itself is
      // committed by the RPC above, and rolling it back would be worse), so it throws only after
      // the money is safely recorded, which is what makes the omission visible instead of silent.
      const { error: postErr } = await supabase.from('payments').update(postInsert).eq('id', data as string);
      if (postErr) {
        throw new Error(
          `Payment ${data} was recorded, but its counterparty details could not be saved: ${postErr.message}. `
          + 'Edit the payment to add them — do NOT record it again.',
        );
      }
    }
    // Payment received → generate the receipt + notify/email the customer via the seeded
    // flow (fire-and-forget). Only for inbound money, and only when sendReceipt isn't
    // opted out — when false the payment is recorded silently.
    if (input.direction === 'in' && input.sendReceipt !== false) {
      const paymentId = data as string;
      void (async () => {
        try {
          const party = await resolvePartyContactInfo(input.counterpartyCompanyId, input.counterpartyContactId);
          const amount = `${Number(input.amount).toFixed(2)} ${input.currency ?? 'EUR'}`;
          // Generate the payment receipt (απόδειξη είσπραξης) so the customer email can link it.
          let receiptUrl: string | null = null;
          try { receiptUrl = (await financeService.generatePaymentReceiptPdf(paymentId)).pdf_url; } catch { /* receipt optional */ }
          const receiptLine = receiptUrl ? `<p><a href="${receiptUrl}">Download your receipt</a></p>` : '';
          flowEventService.emit('payment_received', {
            type: 'payment_received',
            user_id: party.userId ?? undefined,
            customer_email: party.email ?? undefined,
            customer_name: party.name ?? undefined,
            payment_id: paymentId,
            amount,
            currency: input.currency ?? 'EUR',
            workspace_id: input.workspaceId,
            receipt_url: receiptUrl ?? undefined,
            receipt_line: receiptLine,
            title: `Payment received — ${amount}`,
            body: `A payment of ${amount}${party.name ? ` from ${party.name}` : ''} has been recorded.`,
            action_url: '/finance?tab=parties',
          });
        } catch { /* best-effort */ }
      })();
    }
    // Place whatever this payment did NOT settle explicitly onto what is still owed. Without this
    // call the sweep existed but nothing invoked it, so cash recorded against no document sat as
    // on-account credit forever next to the very order it had paid for (ORD-2026-0002: €2,854
    // received, €0 allocated, until a migration and a since-removed button placed it by hand).
    //
    // Deliberately AFTER the RPC rather than a trigger on `payments`: the sweep places only each
    // payment's REMAINDER, so it is safe to run at any point and finds nothing on a second pass —
    // whereas an AFTER INSERT trigger fires before the client's explicit allocations exist and
    // would swallow the whole payment onto the wrong target.
    await financeService.sweepUnallocated(input.workspaceId);
    return data as string;
  },

  /**
   * How much of each payment is still unallocated — the ONE derivation, read from SQL.
   *
   * `amount − Σ allocations` was open-coded in three TypeScript sites and three SQL functions, and
   * they disagreed on which column to sum: `amount` is denominated in the TARGET's currency,
   * `amount_doc_currency` in the PAYMENT's, and a remainder is a payment-currency quantity. They
   * happen to agree while every allocation is same-currency, which is exactly why the divergence
   * survived — the data is well-formed and only the arithmetic differs, so nothing could flag it.
   *
   * Pass ids to scope it; omit for every payment the caller can see (RLS applies — the function is
   * SECURITY INVOKER on purpose).
   */
  async paymentRemainders(paymentIds?: string[]): Promise<Map<string, PaymentRemainder>> {
    if (paymentIds && paymentIds.length === 0) return new Map();
    const { data, error } = await supabase.rpc('get_payment_remainders', {
      p_payment_ids: paymentIds ?? null,
    });
    if (error) throw error;
    return new Map((data ?? []).map((r) => [r.payment_id, {
      payment_id: r.payment_id,
      amount: Number(r.amount),
      allocated: Number(r.allocated),
      unallocated: Number(r.unallocated),
      currency: r.currency,
    }]));
  },

  /**
   * Settle every unallocated payment remainder in the workspace against what is open — invoices
   * first (a formal debt outranks an un-invoiced order), then same-currency orders, oldest first.
   * Idempotent, and best-effort by design: the money is already committed by the time this runs,
   * so a failure here must not surface as "the payment failed". It leaves the remainder visible as
   * on-account credit, which is the honest fallback.
   */
  async sweepUnallocated(workspaceId: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('auto_allocate_workspace', { p_workspace_id: workspaceId });
      if (error) throw error;
      return Number((data as any)?.placed) || 0;
    } catch (err) {
      console.error('auto-allocation sweep failed; remainder stays on account', err);
      return 0;
    }
  },

  // -------- Manual (un-invoiced) receivables / payables --------

  // -------- Pricing rules (markup overrides) --------

  // Ordered category tree (parents + subcategories) for pricing pickers; children
  // get an indented label so the hierarchy is visible in a flat <Select>.
  async listMaterialCategoryTree(workspaceId: string): Promise<Array<{ key: string; label: string; level: number }>> {
    const { data, error } = await supabase.rpc('finance_list_category_tree', { p_workspace_id: workspaceId });
    if (error) throw error;
    return ((data ?? []) as Array<{ category_key: string; label: string; level: number }>)
      .filter((r) => r.category_key)
      .map((r) => ({
        key: r.category_key,
        label: (r.level > 0 ? '  '.repeat(r.level) + '↳ ' : '') + (r.label || r.category_key),
        level: r.level ?? 0,
      }));
  },

  async listPricingRules(workspaceId: string): Promise<Array<{
    id: string; scope: PricingRuleScope; target_id: string;
    markup_pct: number | null; sell_price: number | null; currency: string;
  }>> {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('id, scope, target_id, markup_pct, sell_price, currency')
      .eq('workspace_id', workspaceId)
      .order('scope', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async upsertPricingRule(input: {
    workspaceId: string; scope: PricingRuleScope; targetId: string;
    markupPct?: number | null; sellPrice?: number | null; currency?: string;
  }): Promise<void> {
    const { error } = await supabase.from('pricing_rules').upsert({
      workspace_id: input.workspaceId,
      scope: input.scope,
      target_id: input.targetId,
      markup_pct: input.markupPct ?? null,
      sell_price: input.sellPrice ?? null,
      currency: input.currency ?? 'EUR',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,scope,target_id' });
    if (error) throw error;
  },

  async deletePricingRule(id: string): Promise<void> {
    const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Pricing pyramid: customer levels + level×category discounts ──
  async listUserLevels(workspaceId: string): Promise<Array<{
    id: string; level_key: string; label: string; default_discount_pct: number;
    is_default: boolean; sort_order: number; is_active: boolean;
  }>> {
    const { data, error } = await supabase
      .from('workspace_user_levels')
      .select('id, level_key, label, default_discount_pct, is_default, sort_order, is_active')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async upsertUserLevel(input: {
    id?: string; workspaceId: string; levelKey: string; label: string;
    defaultDiscountPct: number; isDefault?: boolean; sortOrder?: number; isActive?: boolean;
  }): Promise<void> {
    const row: any = {
      workspace_id: input.workspaceId,
      level_key: input.levelKey,
      label: input.label,
      default_discount_pct: input.defaultDiscountPct,
    };
    if (input.id) row.id = input.id;
    if (input.isDefault !== undefined) row.is_default = input.isDefault;
    if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
    if (input.isActive !== undefined) row.is_active = input.isActive;
    const { error } = await supabase.from('workspace_user_levels')
      .upsert(row, { onConflict: 'workspace_id,level_key' });
    if (error) throw error;
  },

  async deleteUserLevel(id: string): Promise<void> {
    const { error } = await supabase.from('workspace_user_levels').delete().eq('id', id);
    if (error) throw error;
  },

  // Exactly one default level per workspace.
  async setDefaultUserLevel(workspaceId: string, levelId: string): Promise<void> {
    const clear = await supabase.from('workspace_user_levels')
      .update({ is_default: false }).eq('workspace_id', workspaceId);
    if (clear.error) throw clear.error;
    const set = await supabase.from('workspace_user_levels')
      .update({ is_default: true }).eq('id', levelId);
    if (set.error) throw set.error;
  },

  async listLevelDiscounts(workspaceId: string): Promise<Array<{
    id: string; level_key: string; category_key: string | null; discount_pct: number;
  }>> {
    const { data, error } = await supabase
      .from('pricing_level_discounts')
      .select('id, level_key, category_key, discount_pct')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data ?? []) as any;
  },

  async upsertLevelDiscount(input: {
    workspaceId: string; levelKey: string; categoryKey: string | null; discountPct: number;
  }): Promise<void> {
    // The unique slot is (workspace, level, coalesce(category,'__ALL__')); find an existing row to update.
    let q = supabase.from('pricing_level_discounts')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('level_key', input.levelKey);
    q = input.categoryKey === null ? q.is('category_key', null) : q.eq('category_key', input.categoryKey);
    const existing = await q.limit(1);
    if (existing.error) throw existing.error;
    const row: any = {
      workspace_id: input.workspaceId,
      level_key: input.levelKey,
      category_key: input.categoryKey,
      discount_pct: input.discountPct,
    };
    if (existing.data && existing.data[0]) row.id = existing.data[0].id;
    const { error } = await supabase.from('pricing_level_discounts').upsert(row);
    if (error) throw error;
  },

  async deleteLevelDiscount(id: string): Promise<void> {
    const { error } = await supabase.from('pricing_level_discounts').delete().eq('id', id);
    if (error) throw error;
  },

  // Layer B custom pricing rules (volume_category / category_extra / cash_payment).
  async listCustomRules(workspaceId: string): Promise<Array<{
    id: string; rule_type: string; category_key: string | null; params: any;
    discount_pct: number; label: string | null; is_active: boolean; sort_order: number;
  }>> {
    const { data, error } = await supabase
      .from('pricing_custom_rules')
      .select('id, rule_type, category_key, params, discount_pct, label, is_active, sort_order')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async upsertCustomRule(input: {
    id?: string; workspaceId: string; ruleType: string; categoryKey: string | null;
    params?: any; discountPct: number; label?: string | null; isActive?: boolean; sortOrder?: number;
  }): Promise<void> {
    const row: any = {
      workspace_id: input.workspaceId,
      rule_type: input.ruleType,
      category_key: input.categoryKey,
      params: input.params ?? {},
      discount_pct: input.discountPct,
    };
    if (input.id) row.id = input.id;
    if (input.label !== undefined) row.label = input.label;
    if (input.isActive !== undefined) row.is_active = input.isActive;
    if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
    const { error } = await supabase.from('pricing_custom_rules').upsert(row);
    if (error) throw error;
  },

  async deleteCustomRule(id: string): Promise<void> {
    const { error } = await supabase.from('pricing_custom_rules').delete().eq('id', id);
    if (error) throw error;
  },

  // The workspace's active paid-upfront (cash) discount %, applied at the order level.
  /**
   * The workspace's paid-upfront (cash) discount %, or 0.
   *
   * DOCUMENT-level: it reduces the subtotal before VAT, it is not a line price — which is why it
   * is the one custom rule NOT folded into `get_product_price_for_workspace` (#347 phase 1.1).
   * Discounting the lines AND the total would apply it twice.
   *
   * The query used to live here and again, hand-copied, inside `quote-tools.ts`. Both now call
   * the one SQL source. Do not re-query `pricing_custom_rules` for this.
   */
  async getActiveCashDiscountPct(workspaceId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_workspace_cash_discount_pct', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return Number(data) || 0;
  },

  /**
   * The other three DOCUMENT-level discounts (#347 phase 8).
   *
   * Same rule as the cash discount above and for the same reason: each reduces the order
   * subtotal, so none may be folded into `get_product_price_for_workspace` — discounting the
   * lines AND the total applies it twice.
   *
   * Each is resolved in SQL. Do not re-query `pricing_custom_rules` from TypeScript: that is
   * policy, policy has one home, and pricingRuleTypes.test.ts fails the build on a
   * `.eq('rule_type', …)` anywhere in the client.
   */
  async getPaymentTermsDiscountPct(workspaceId: string, terms: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_payment_terms_discount_pct', {
      p_workspace_id: workspaceId, p_terms: terms,
    });
    if (error) throw error;
    return Number(data) || 0;
  },

  /**
   * Whether this customer has ever bought before is derived IN SQL from their order history —
   * never passed in. A caller-supplied "this is their first order" flag is a caller-supplied
   * discount.
   */
  async getFirstOrderDiscountPct(
    workspaceId: string, companyId?: string | null, contactId?: string | null,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('get_first_order_discount_pct', {
      p_workspace_id: workspaceId,
      p_company_id: companyId ?? null,
      p_contact_id: contactId ?? null,
    });
    if (error) throw error;
    return Number(data) || 0;
  },

  /**
   * Bundle discounts need the WHOLE basket, which is why they cannot live in the per-line
   * resolver: it sees one product at a time. Pass every category present on the order.
   */
  async getBundleDiscountPct(workspaceId: string, categoryKeys: string[]): Promise<number> {
    const { data, error } = await supabase.rpc('get_bundle_discount_pct', {
      p_workspace_id: workspaceId,
      p_category_keys: categoryKeys,
    });
    if (error) throw error;
    return Number(data) || 0;
  },

  // Customer discount/level change: applied directly for finance/admin, or routed to
  // a pending approval request for the 'sales' persona (enforced server-side in the RPC).
  async proposeOrApplyCustomerPricing(input: {
    subjectType: 'company' | 'contact'; subjectId: string;
    userLevelKey: string | null; discountPercent: number | null;
  }): Promise<{ status: 'applied' | 'pending' | 'unchanged'; request_id?: string }> {
    const { data, error } = await supabase.rpc('propose_or_apply_customer_pricing', {
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId,
      p_user_level_key: input.userLevelKey,
      p_discount_percent: input.discountPercent,
    });
    if (error) throw error;
    return (data ?? { status: 'unchanged' }) as any;
  },

  // Finance approvers (owner/admin) of a workspace, for fanning out approval notifications.
  async listWorkspaceApproverIds(workspaceId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin']);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
  },

  async listPendingDiscountRequests(workspaceId: string): Promise<Array<{
    id: string; target_id: string; before: any; after: any; requested_by: string | null; created_at: string;
  }>> {
    const { data, error } = await supabase
      .from('pricing_change_requests')
      .select('id, target_id, before, after, requested_by, created_at')
      .eq('workspace_id', workspaceId)
      .eq('target_type', 'customer_discount')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async decidePricingRequest(requestId: string, approve: boolean, note?: string): Promise<{ subject_type?: string; subject_id?: string }> {
    const { data, error } = await supabase.rpc('decide_customer_pricing_request', {
      p_request_id: requestId, p_approve: approve, p_note: note ?? null,
    });
    if (error) throw error;
    return (data ?? {}) as any;
  },

  /** Customer open balance: sum of open-invoice amount_due − sum of unallocated inbound payments. */
  async getCustomerBalance(workspaceId: string, party: { companyId?: string | null; contactId?: string | null }): Promise<{
    open_invoices_due: number; customer_credit: number; net_balance: number; currency: string;
  }> {
    const { data, error } = await supabase.rpc('get_customer_open_balance', {
      p_workspace_id: workspaceId,
      p_company_id: party.companyId ?? null,
      p_contact_id: party.contactId ?? null,
    });
    if (error) throw error;
    return data as any;
  },

  /**
   * One party's credit position — read straight off `vw_finance_parties`, so the order panel,
   * the Parties list and the nightly sweep all answer "is there money to release here?" the same
   * way. Returns null when the party has no row (nothing invoiced, nothing paid).
   */
  async getPartyCreditPosition(workspaceId: string, party: { companyId?: string | null; contactId?: string | null }): Promise<{
    party_type: 'company' | 'contact'; party_id: string; display_name: string;
    on_account_credit: number; credit_releasable: boolean; receivable_outstanding: number;
  } | null> {
    const partyType = party.companyId ? 'company' : 'contact';
    const partyId = party.companyId ?? party.contactId;
    if (!partyId) return null;
    const { data, error } = await supabase.from('vw_finance_parties')
      .select('party_type, party_id, display_name, on_account_credit, credit_releasable, receivable_outstanding')
      .eq('workspace_id', workspaceId)
      .eq('party_type', partyType)
      .eq('party_id', partyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const r = data as any;
    return {
      party_type: r.party_type, party_id: r.party_id, display_name: r.display_name,
      on_account_credit: Number(r.on_account_credit ?? 0),
      credit_releasable: !!r.credit_releasable,
      receivable_outstanding: Number(r.receivable_outstanding ?? 0),
    };
  },

  /**
   * Claim the right to nudge somebody about this party's leftover credit.
   *
   * TRUE at most once per party per cooldown window, shared with the nightly sweep — closing four
   * orders for the same customer in one afternoon must not produce four notifications about one
   * €400. The RPC stamps the claim itself, so a caller that forgets to check cannot double-fire.
   */
  async claimCreditPrompt(workspaceId: string, party: { partyType: 'company' | 'contact'; partyId: string }, amount: number, cooldownDays = 30): Promise<boolean> {
    const { data, error } = await supabase.rpc('finance_claim_credit_prompt', {
      p_workspace_id: workspaceId,
      p_party_type: party.partyType,
      p_party_id: party.partyId,
      p_amount: amount,
      p_cooldown_days: cooldownDays,
    });
    if (error) throw error;
    return data === true;
  },

  /**
   * Stop holding a party's leftover on-account money: release it to income.
   *
   * The cash does not move — it stays in whatever account it landed in and is ours to spend. What
   * changes is whose money it is: the credit is allocated away, so the party's "on account"
   * balance (and their statement) drops by it, and it lands in the P&L under `categoryId`.
   * Nothing is issued to the customer; nothing goes to myDATA.
   *
   * `amount` is a CAP, not a promise — the RPC re-reads what is actually unallocated and never
   * releases more than that, so a stale screen cannot release money that has since been applied
   * somewhere else. Returns what was actually released. Undo with `reverseCreditRelease`.
   */
  async releaseCustomerCredit(input: {
    workspaceId: string;
    companyId?: string | null;
    contactId?: string | null;
    amount?: number | null;
    categoryId?: string | null;
    currency?: string;
    notes?: string | null;
  }): Promise<{ released: number; release_id: string | null }> {
    const { data, error } = await supabase.rpc('release_customer_credit', {
      p_workspace_id: input.workspaceId,
      p_company_id: input.companyId ?? undefined,
      p_contact_id: input.contactId ?? undefined,
      p_amount: input.amount ?? undefined,
      p_category_id: input.categoryId ?? undefined,
      p_currency: input.currency ?? 'EUR',
      p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
    const r = (data ?? {}) as { released?: number; release_id?: string | null };
    return { released: Number(r.released ?? 0), release_id: r.release_id ?? null };
  },

  /** Undo a release — the allocations cascade away and the credit reappears on the party's account. */
  async reverseCreditRelease(releaseId: string): Promise<number> {
    const { data, error } = await supabase.rpc('reverse_credit_release', { p_release_id: releaseId });
    if (error) throw error;
    return Number((data as { reversed?: number } | null)?.reversed ?? 0);
  },

  /** Credit already released to income for a party (newest first) — the audit trail + undo list. */
  async listCreditReleases(workspaceId: string, party: { companyId?: string | null; contactId?: string | null } = {}): Promise<CreditRelease[]> {
    let q = supabase.from('finance_credit_releases').select('*')
      .eq('workspace_id', workspaceId)
      .order('released_at', { ascending: false });
    if (party.companyId) q = q.eq('counterparty_company_id', party.companyId);
    else if (party.contactId) q = q.eq('counterparty_contact_id', party.contactId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CreditRelease[];
  },

  /**
   * Gross margin earned on a customer, from the invoice lines' cost snapshots.
   *
   * `cost_coverage_pct` is the share of revenue whose line actually carries a cost — read the
   * margin against it, because lines with no cost snapshot look like 100% margin.
   */
  async getCustomerProfitability(workspaceId: string, party: {
    companyId?: string | null; contactId?: string | null; from?: string | null; to?: string | null;
  }): Promise<{
    revenue_net: number; cogs: number; gross_margin: number;
    gross_margin_pct: number | null; cost_coverage_pct: number | null;
    line_count: number; currency: string;
  }> {
    const { data, error } = await supabase.rpc('report_customer_profitability', {
      p_workspace_id: workspaceId,
      p_company_id: party.companyId ?? null,
      p_contact_id: party.contactId ?? null,
      p_from: party.from ?? null,
      p_to: party.to ?? null,
    });
    if (error) throw error;
    return data as any;
  },

  async listPayments(opts: {
    workspaceId?: string;
    direction?: PaymentDirection;
    counterpartyContactId?: string;
    counterpartyCompanyId?: string;
    limit?: number;
  } = {}): Promise<PaymentWithAllocation[]> {
    let q = supabase
      .from('payments')
      // Join the order (provenance) so the list can show its number, and the allocations so the
      // row can show what's settled vs still on-account. The allocation targets come along so
      // the row can name WHAT was settled. Party name is resolved in a 2nd batch.
      // `bank_account` comes along because the ACCOUNT is what the lists show — the method is
      // derived from it (see PaidFromSelect) and printing both said the same thing twice.
      .select('*, allocations:payment_allocations(*, invoice:invoices(internal_number), supplier_bill:supplier_bills(supplier_bill_number, supplier_name), allocated_order:orders(order_number)), order:orders(order_number), bank_account:finance_bank_accounts(name, kind)')
      .order('paid_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.direction) q = q.eq('direction', opts.direction);
    if (opts.counterpartyContactId) q = q.eq('counterparty_contact_id', opts.counterpartyContactId);
    if (opts.counterpartyCompanyId) q = q.eq('counterparty_company_id', opts.counterpartyCompanyId);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as any[];

    // Batch-resolve counterparty names (companies + bare contacts) in two queries, not N.
    const companyIds = [...new Set(rows.map((r) => r.counterparty_company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(rows.map((r) => r.counterparty_contact_id).filter(Boolean))] as string[];
    const [companies, contacts] = await Promise.all([
      companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const companyName = new Map<string, string>((companies.data ?? []).map((c: any) => [c.id, c.name]));
    const contactName = new Map<string, string>((contacts.data ?? []).map((c: any) => [c.id, c.name || [c.first_name, c.last_name].filter(Boolean).join(' ')]));
    // Carry the DERIVED remainder so the list formats it instead of re-summing the embedded
    // allocations itself — DocumentsPage did, with its own third variant of the arithmetic.
    const remainders = await financeService.paymentRemainders(rows.map((r) => r.id));

    return rows.map((r) => ({
      ...r,
      unallocated: remainders.get(r.id)?.unallocated ?? 0,
      order_number: r.order?.order_number ?? null,
      bank_account_name: r.bank_account?.name ?? null,
      party_name: r.counterparty_company_id
        ? (companyName.get(r.counterparty_company_id) ?? null)
        : (r.counterparty_contact_id ? (contactName.get(r.counterparty_contact_id) ?? null) : null),
      settled: (r.allocations ?? []).map((a: any) => {
        if (a.invoice_id) {
          return { kind: 'invoice' as const, id: a.invoice_id, amount: Number(a.amount ?? 0), label: a.invoice?.internal_number ?? 'Invoice' };
        }
        if (a.supplier_bill_id) {
          return {
            kind: 'expense' as const, id: a.supplier_bill_id, amount: Number(a.amount ?? 0),
            label: a.supplier_bill?.supplier_bill_number || a.supplier_bill?.supplier_name || 'Expense',
          };
        }
        if (a.order_id) {
          return { kind: 'order' as const, id: a.order_id, amount: Number(a.amount ?? 0), label: a.allocated_order?.order_number ?? 'Order' };
        }
        return null;
      }).filter(Boolean) as PaymentWithAllocation['settled'],
    })) as PaymentWithAllocation[];
  },

  async deletePayment(paymentId: string): Promise<void> {
    // Allocations cascade automatically; status-keeper trigger fires on each delete.
    const { error } = await supabase.from('payments').delete().eq('id', paymentId);
    if (error) throw error;
  },

  /** Correct a payment's METADATA only — bank account, method, date, reference, notes.
   *  Amount / direction / allocations are immutable here: they drive invoice settlement
   *  and treasury balances, so a value change goes through delete/return + re-record. */
  async updatePayment(paymentId: string, patch: {
    bankAccountId?: string | null; method?: PaymentMethod | null;
    paidAt?: string; reference?: string | null; notes?: string | null;
  }): Promise<void> {
    const upd: Record<string, any> = {};
    if (patch.bankAccountId !== undefined) upd.bank_account_id = patch.bankAccountId;
    if (patch.method !== undefined) upd.method = patch.method;
    if (patch.paidAt !== undefined) upd.paid_at = patch.paidAt;
    if (patch.reference !== undefined) upd.reference = patch.reference;
    if (patch.notes !== undefined) upd.notes = patch.notes;
    if (Object.keys(upd).length === 0) return;
    const { error } = await supabase.from('payments').update(upd).eq('id', paymentId);
    if (error) throw error;
  },

  /** The invoices a payment is allocated to, with their myDATA transmission state.
   *  A non-null `fiscal_mark` means the invoice is transmitted → it can't be deleted,
   *  only reversed with a credit note (return). Drives the delete-vs-return branch. */
  async getPaymentInvoiceAllocations(paymentId: string): Promise<Array<{
    amount: number; invoice_id: string; internal_number: string | null;
    currency: string | null; total: number | null; fiscal_mark: string | null; status: string | null;
  }>> {
    // payment_allocations has no `target_type` column — the target is whichever *_id FK is set.
    // Invoice allocations are the rows with a non-null invoice_id (the embed resolves via that FK).
    const { data, error } = await supabase
      .from('payment_allocations')
      .select('amount, invoice_id, invoice:invoices(id, internal_number, currency, total, fiscal_mark, status)')
      .eq('payment_id', paymentId)
      .not('invoice_id', 'is', null);
    if (error) throw error;
    return (data ?? [])
      .filter((r: any) => r.invoice)
      .map((r: any) => ({
        amount: Number(r.amount), invoice_id: r.invoice.id, internal_number: r.invoice.internal_number,
        currency: r.invoice.currency, total: r.invoice.total, fiscal_mark: r.invoice.fiscal_mark, status: r.invoice.status,
      }));
  },

  // -------- Bank / cash accounts (where money sits) --------

  /** Active (and optionally inactive) bank/cash accounts for a workspace. */
  async listBankAccounts(workspaceId: string, opts: { includeInactive?: boolean } = {}): Promise<BankAccount[]> {
    let q = supabase.from('finance_bank_accounts').select('*').eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (!opts.includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BankAccount[];
  },

  /** Treasury accounts flagged "Show on invoice" — the single source of the bank details
   *  printed on invoices / statements / the on-screen preview. Ordered as configured. */
  async listInvoiceBankAccounts(workspaceId: string): Promise<Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>> {
    const { data, error } = await supabase.from('finance_bank_accounts')
      .select('name, kind, iban, account_ref')
      .eq('workspace_id', workspaceId).eq('is_active', true).eq('show_on_invoice', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>;
  },

  /** Per-account running balances (opening + Σ in − Σ out). */
  async getBankAccountBalances(
    workspaceId: string,
    opts: { includeInactive?: boolean } = {},
  ): Promise<BankAccountBalance[]> {
    let q = supabase.from('vw_bank_account_balances').select('*')
      .eq('workspace_id', workspaceId).order('sort_order', { ascending: true });
    if (!opts.includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as BankAccountBalance[];
  },

  async createBankAccount(input: {
    workspaceId: string; name: string; kind?: BankAccountKind; currency?: string;
    iban?: string | null; accountRef?: string | null; openingBalance?: number;
    isDefault?: boolean; notes?: string | null; showOnInvoice?: boolean;
  }): Promise<BankAccount> {
    if (!input.name?.trim()) throw new Error('Account name is required');
    // First account in a workspace becomes the default automatically.
    const existing = await this.listBankAccounts(input.workspaceId, { includeInactive: true });
    const makeDefault = input.isDefault ?? existing.length === 0;
    if (makeDefault && existing.some((a) => a.is_default)) {
      await supabase.from('finance_bank_accounts').update({ is_default: false }).eq('workspace_id', input.workspaceId);
    }
    const { data, error } = await supabase.from('finance_bank_accounts').insert({
      workspace_id: input.workspaceId,
      name: input.name.trim(),
      kind: input.kind ?? 'bank',
      currency: input.currency ?? 'EUR',
      iban: normalizeIban(input.iban) || null,
      account_ref: input.accountRef ?? null,
      opening_balance: input.openingBalance ?? 0,
      is_default: makeDefault,
      show_on_invoice: input.showOnInvoice ?? false,
      sort_order: existing.length,
    }).select('*').single();
    if (error) throw error;
    return data as BankAccount;
  },

  async updateBankAccount(id: string, patch: Partial<Pick<BankAccount,
    'name' | 'kind' | 'currency' | 'iban' | 'account_ref' | 'opening_balance' | 'is_active' | 'show_on_invoice' | 'sort_order' | 'notes'>>): Promise<void> {
    const { error } = await supabase.from('finance_bank_accounts')
      .update({
        ...patch,
        ...(patch.iban !== undefined ? { iban: normalizeIban(patch.iban) || null } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    if (error) throw error;
  },

  /** Exactly one default account per workspace. */
  async setDefaultBankAccount(workspaceId: string, accountId: string): Promise<void> {
    const clear = await supabase.from('finance_bank_accounts').update({ is_default: false }).eq('workspace_id', workspaceId);
    if (clear.error) throw clear.error;
    const set = await supabase.from('finance_bank_accounts').update({ is_default: true }).eq('id', accountId);
    if (set.error) throw set.error;
  },

  /** Delete an account. Payments keep their history (bank_account_id → NULL via FK). */
  async deleteBankAccount(id: string): Promise<void> {
    const { error } = await supabase.from('finance_bank_accounts').delete().eq('id', id);
    if (error) throw error;
  },

  // -------- Supplier bills --------

  async createSupplierBill(input: {
    workspaceId: string;
    supplierBillNumber?: string;
    supplierCompanyId?: string;
    supplierContactId?: string;
    /** One-off supplier name when the supplier is NOT a saved CRM company/contact. */
    supplierName?: string | null;
    currency?: string;
    subtotalNet: number;
    vatAmount: number;
    total: number;
    issuedAt?: string;
    dueAt?: string;
    notes?: string;
    /** Optional finance category (expense side) — required for the bill to appear in P&L per category. */
    categoryId?: string | null;
    /** Optional purchase order this bill is matched against (drives 3-way match). */
    orderId?: string;
    /** Optional project this cost belongs to. */
    projectId?: string | null;
    /**
     * Optional SALES order this cost was incurred FOR. Deliberately not `orderId`: that one is the
     * PURCHASE order this bill invoices and `compute_three_way_match` joins on it, so pointing it at
     * a customer's order would corrupt the match.
     */
    coversOrderId?: string | null;
  }): Promise<SupplierBill> {
    const { data, error } = await supabase
      .from('supplier_bills')
      .insert({
        workspace_id: input.workspaceId,
        supplier_bill_number: input.supplierBillNumber ?? null,
        supplier_company_id: input.supplierCompanyId ?? null,
        supplier_contact_id: input.supplierContactId ?? null,
        supplier_name: (input.supplierCompanyId || input.supplierContactId) ? null : (input.supplierName?.trim() || null),
        currency: input.currency ?? 'EUR',
        subtotal_net: input.subtotalNet,
        vat_amount: input.vatAmount,
        total: input.total,
        issued_at: input.issuedAt ?? null,
        due_at: input.dueAt ?? null,
        notes: input.notes ?? null,
        category_id: input.categoryId ?? null,
        order_id: input.orderId ?? null,
        project_id: input.projectId ?? null,
        covers_order_id: input.coversOrderId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SupplierBill;
  },

  /**
   * Edit a bill's DOCUMENT metadata after creation — the fields the supplier's paper/PDF
   * invoice supplies (bill #, issue/due dates) plus category and notes. Bills recorded
   * manually from an order usually lack the supplier's own invoice number (myDATA-created
   * ones get `IN-<MARK>` stamped automatically); this is the backfill path.
   *
   * Deliberately NOT editable: amounts (net/VAT/total — payments already allocate against
   * them and the P&L read them), supplier identity, and status/amount_paid (derived from
   * `payment_allocations` by trigger — writing them here would be a second derivation).
   */
  async updateSupplierBillMeta(supplierBillId: string, patch: {
    supplierBillNumber?: string | null;
    issuedAt?: string | null;
    dueAt?: string | null;
    categoryId?: string | null;
    notes?: string | null;
  }): Promise<void> {
    const row: Record<string, string | null> = {};
    if ('supplierBillNumber' in patch) row.supplier_bill_number = patch.supplierBillNumber?.trim() || null;
    if ('issuedAt' in patch) row.issued_at = patch.issuedAt || null;
    if ('dueAt' in patch) row.due_at = patch.dueAt || null;
    if ('categoryId' in patch) row.category_id = patch.categoryId || null;
    if ('notes' in patch) row.notes = patch.notes?.trim() || null;
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('supplier_bills').update(row).eq('id', supplierBillId);
    if (error) throw error;
  },

  /**
   * Record a business operating expense (rent, utilities, fees, …). An expense IS a supplier
   * bill — the canonical spend record that feeds Payables (AP aging) and the P&L per category.
   * Party is optional (many operating costs have no CRM supplier). When `paidNow` is set, the
   * matching money-out payment is booked and allocated to the bill in the same step, so it
   * settles immediately (drops out of AP) and hits cash-out; otherwise it stays an open payable.
   */
  async createExpense(input: {
    workspaceId: string;
    categoryId: string;
    description?: string;
    reference?: string;
    supplierCompanyId?: string;
    supplierContactId?: string;
    /** One-off payee name when the supplier is NOT a saved CRM company/contact. */
    supplierName?: string | null;
    currency?: string;
    subtotalNet: number;
    vatAmount: number;
    issuedAt?: string;
    dueAt?: string;
    notes?: string;
    /** When true, also record the outgoing payment now (bill is created as paid). */
    paidNow?: boolean;
    paidFromBankAccountId?: string | null;
    paymentMethod?: PaymentMethod;
    paidAt?: string;
    /** The supplier's own bank (crm_bank_accounts) the money was paid to, on a Bank Payment. */
    counterpartyBankAccountId?: string | null;
    /** Link this expense (the cost of goods) to the order it belongs to, so it shows on the order. */
    orderId?: string | null;
    /** What the cost is FOR — a project, and/or the customer's sales order it was incurred against. */
    projectId?: string | null;
    coversOrderId?: string | null;
  }): Promise<{ billId: string; paymentId: string | null }> {
    // A supplier bill needs a payee — a saved CRM supplier OR a one-off free-text name.
    if (!input.supplierCompanyId && !input.supplierContactId && !input.supplierName?.trim()) {
      throw new Error('An expense needs a supplier / payee.');
    }
    const currency = input.currency ?? 'EUR';
    const subtotalNet = Number((input.subtotalNet || 0).toFixed(2));
    const vatAmount = Number((input.vatAmount || 0).toFixed(2));
    const total = Number((subtotalNet + vatAmount).toFixed(2));

    const bill = await this.createSupplierBill({
      workspaceId: input.workspaceId,
      supplierBillNumber: input.reference || undefined,
      supplierCompanyId: input.supplierCompanyId,
      supplierContactId: input.supplierContactId,
      supplierName: input.supplierName,
      currency,
      subtotalNet,
      vatAmount,
      total,
      issuedAt: input.issuedAt,
      dueAt: input.dueAt,
      // `supplier_bills` has no description column, so Description has to ride in notes. The old
      // `notes ?? description` DISCARDED Description whenever Notes was also filled — the expense
      // then showed nothing about what it was actually for. Both are kept, Description first
      // because it is the shorter "what was this" line.
      notes: [input.description?.trim(), input.notes?.trim()].filter(Boolean).join('\n\n') || undefined,
      categoryId: input.categoryId,
      orderId: input.orderId ?? undefined,
      projectId: input.projectId ?? null,
      coversOrderId: input.coversOrderId ?? null,
    });

    let paymentId: string | null = null;
    if (input.paidNow && total > 0) {
      paymentId = await this.recordPayment({
        workspaceId: input.workspaceId,
        direction: 'out',
        amount: total,
        currency,
        method: input.paymentMethod ?? 'bank_transfer',
        paidAt: input.paidAt ?? new Date().toISOString(),
        counterpartyCompanyId: input.supplierCompanyId ?? null,
        counterpartyContactId: input.supplierContactId ?? null,
        counterpartyName: (input.supplierCompanyId || input.supplierContactId) ? null : (input.supplierName ?? null),
        reference: input.reference || null,
        notes: input.description ?? null,
        categoryId: input.categoryId,
        orderId: input.orderId ?? null,
        bankAccountId: input.paidFromBankAccountId ?? null,
        counterpartyBankAccountId: input.paymentMethod === 'bank_transfer' ? (input.counterpartyBankAccountId ?? null) : null,
        allocations: [{ target_id: bill.id, target_type: 'supplier_bill', amount: total }],
      });
    }
    return { billId: bill.id, paymentId };
  },

  /**
   * Settle an EXISTING open supplier bill — books a money-out payment allocated to the bill so it
   * drops out of Payables. This is the money-out mirror of settling an invoice with the "For" picker
   * in RecordPaymentDialog. DISTINCT from `createExpense` (which creates a NEW bill and pays it): use
   * this to pay a bill that already exists (an unpaid expense, the
   * recurring-expense cron, or the agent), so paying it never duplicates the payable.
   */
  /**
   * Match an expense to the order it belongs to (or clear it). `supplier_bills.order_id` is what
   * 3-way match already reads, so this is the ONLY place the link is written — a document that
   * became an order gets linked through its bill, not through a second column. An order holds
   * MANY expenses (no uniqueness on the FK): the supplier's own bill plus every extra cost —
   * transport, customs, an installer — that belongs to the same purchase.
   *
   * Both rows must live in the same workspace. RLS scopes the UPDATE to bills the caller can
   * reach but says nothing about the ORDER id being written into them, so without this check a
   * caller could file their own expense against another tenant's order and have it show up in
   * that tenant's cost roll-up and 3-way match.
   */
  async setSupplierBillOrder(supplierBillId: string, orderId: string | null): Promise<void> {
    if (orderId) {
      const [bill, order] = await Promise.all([
        supabase.from('supplier_bills').select('workspace_id').eq('id', supplierBillId).maybeSingle(),
        supabase.from('orders').select('workspace_id').eq('id', orderId).maybeSingle(),
      ]);
      const billWs = (bill.data as { workspace_id: string } | null)?.workspace_id;
      const orderWs = (order.data as { workspace_id: string } | null)?.workspace_id;
      if (!billWs || !orderWs || billWs !== orderWs) throw new Error('Expense and order are not in the same workspace.');
    }
    const { error } = await supabase.from('supplier_bills').update({ order_id: orderId }).eq('id', supplierBillId);
    if (error) throw error;
  },

  async paySupplierBill(input: {
    workspaceId: string;
    supplierBillId: string;
    amount: number;
    method?: PaymentMethod;
    paidAt?: string;
    bankAccountId?: string | null;
    counterpartyBankAccountId?: string | null;
    reference?: string | null;
    notes?: string | null;
    categoryId?: string | null;
  }): Promise<string> {
    const { data: bill, error } = await supabase
      .from('supplier_bills')
      .select('supplier_company_id, supplier_contact_id, currency, category_id')
      .eq('id', input.supplierBillId)
      .single();
    if (error) throw error;
    const b = bill as { supplier_company_id: string | null; supplier_contact_id: string | null; currency: string | null; category_id: string | null };
    return this.recordPayment({
      workspaceId: input.workspaceId,
      direction: 'out',
      amount: input.amount,
      currency: b.currency ?? 'EUR',
      method: input.method ?? 'bank_transfer',
      paidAt: input.paidAt ?? new Date().toISOString(),
      counterpartyCompanyId: b.supplier_company_id,
      counterpartyContactId: b.supplier_contact_id,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      // Inherit the bill's P&L category so the cash-out lands in the same bucket as the cost.
      categoryId: input.categoryId ?? b.category_id ?? null,
      bankAccountId: input.bankAccountId ?? null,
      counterpartyBankAccountId: input.method === 'bank_transfer' ? (input.counterpartyBankAccountId ?? null) : null,
      allocations: [{ target_id: input.supplierBillId, target_type: 'supplier_bill', amount: input.amount }],
      sendReceipt: false,
    });
  },

  // -------- Payment ↔ expense, both directions --------
  // An expense IS a supplier bill, and `payment_allocations.supplier_bill_id` is the ONE
  // settlement ledger for it: a BEFORE trigger guards over-allocation and an AFTER trigger
  // derives the bill's amount_paid / status / paid_at from the allocation rows. So every
  // method here either writes an allocation or reads one — none of them re-derives "what is
  // still owed" independently.

  /**
   * Expenses annotated with their Inbox origin (and a resolved payee name), newest first.
   *
   * Defaults to what can still take a payment — open, non-void, something still due. Pass
   * `ids` + `includeSettled` to read specific expenses regardless of state; `getPayableExpense`
   * is that call, so the party-name / Inbox enrichment below has exactly one implementation.
   * `inboxOnly` narrows to expenses created from a received document; `unlinkedOnly` narrows to
   * expenses not yet matched to an order — what the order's "Attach an existing expense" picker
   * offers, so an already-attached cost can never be double-counted onto a second order.
   */
  async listPayableExpenses(
    workspaceId: string,
    opts: { inboxOnly?: boolean; unlinkedOnly?: boolean; ids?: string[]; includeSettled?: boolean } = {},
  ): Promise<PayableExpense[]> {
    if (opts.ids && opts.ids.length === 0) return [];
    let q = supabase
      .from('supplier_bills')
      .select('id, supplier_bill_number, supplier_company_id, supplier_contact_id, supplier_name, currency, total, amount_paid, amount_due, issued_at, due_at, status, category_id, notes, order_id')
      .eq('workspace_id', workspaceId)
      .order('issued_at', { ascending: false, nullsFirst: false });
    if (opts.ids) q = q.in('id', opts.ids);
    if (opts.unlinkedOnly) q = q.is('order_id', null);
    if (!opts.includeSettled) q = q.not('status', 'in', '("void","paid")').gt('amount_due', 0);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    // The Inbox link is held on the document side only — this is the reverse lookup
    // (indexed by idx_inbound_documents_created_supplier_bill).
    const companyIds = [...new Set(rows.map((r) => r.supplier_company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(rows.map((r) => r.supplier_contact_id).filter(Boolean))] as string[];
    const [inbound, companies, contacts] = await Promise.all([
      supabase
        .from('inbound_documents')
        .select('id, mark, issuer_name, issuer_vat, series, aa, issue_date, created_supplier_bill_id')
        .eq('workspace_id', workspaceId)
        .in('created_supplier_bill_id', ids),
      companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const inboxByBill = new Map<string, PayableExpense['inbox']>();
    for (const d of ((inbound as any).data ?? []) as any[]) {
      inboxByBill.set(d.created_supplier_bill_id, {
        document_id: d.id, mark: d.mark, issuer_name: d.issuer_name ?? null, issuer_vat: d.issuer_vat ?? null,
        series: d.series ?? null, aa: d.aa ?? null, issue_date: d.issue_date ?? null,
      });
    }
    const companyName = new Map<string, string>(((companies as any).data ?? []).map((c: any) => [c.id, c.name]));
    const contactName = new Map<string, string>(((contacts as any).data ?? []).map((c: any) => [c.id, c.name || [c.first_name, c.last_name].filter(Boolean).join(' ')]));

    const out: PayableExpense[] = rows.map((r) => ({
      ...r,
      party_name: r.supplier_company_id
        ? (companyName.get(r.supplier_company_id) ?? null)
        : r.supplier_contact_id
          ? (contactName.get(r.supplier_contact_id) ?? null)
          : (r.supplier_name ?? null),
      inbox: inboxByBill.get(r.id) ?? null,
    }));
    return opts.inboxOnly ? out.filter((e) => e.inbox) : out;
  },

  /**
   * Resolve a buyer's VAT identity so `salesDocumentKindFor` can classify them. The single fetch
   * behind that rule — surfaces exist that hold only `customer_company_id` / `customer_contact_id`
   * (an order row), which is exactly why the order flow used to guess from the company link alone.
   */
  async getBuyerIdentity(ref: { companyId?: string | null; contactId?: string | null }): Promise<BuyerIdentity | null> {
    if (ref.companyId) {
      const { data } = await supabase.from('crm_companies').select('vat_number').eq('id', ref.companyId).maybeSingle();
      return { isCompany: true, vatNumber: (data as any)?.vat_number ?? null, contactType: null };
    }
    if (ref.contactId) {
      const { data } = await supabase.from('crm_contacts').select('vat_number, contact_type').eq('id', ref.contactId).maybeSingle();
      if (!data) return null;
      return { isCompany: false, vatNumber: (data as any).vat_number ?? null, contactType: (data as any).contact_type ?? null };
    }
    return null;
  },

  /** One expense in the same enriched shape, settled or not. */
  async getPayableExpense(expenseId: string): Promise<PayableExpense | null> {
    const { data, error } = await supabase
      .from('supplier_bills').select('workspace_id').eq('id', expenseId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const rows = await this.listPayableExpenses((data as any).workspace_id, { ids: [expenseId], includeSettled: true });
    return rows[0] ?? null;
  },

  /**
   * Everything that settled an expense — the reverse view of the allocation ledger. Includes
   * BOTH sources: cash payments and supplier credit notes. They both reduce `amount_due`, so
   * both belong here; returning only the cash is what makes a part-credited bill look like it
   * has money missing.
   */
  async listExpenseSettlements(supplierBillId: string): Promise<ExpenseSettlement[]> {
    const { data, error } = await supabase
      .from('payment_allocations')
      .select(`id, amount,
        payment:payments(id, paid_at, method, currency, reference, notes, bank_account_id, bank_account:finance_bank_accounts(name)),
        supplier_credit_note:supplier_credit_notes(id, supplier_credit_note_number, issued_at, currency, reason)`)
      .eq('supplier_bill_id', supplierBillId);
    if (error) throw error;
    return ((data ?? []) as any[])
      .map((a): ExpenseSettlement | null => {
        if (a.payment) {
          return {
            allocation_id: a.id, source: 'payment', source_id: a.payment.id,
            amount: Number(a.amount), occurred_at: a.payment.paid_at,
            document_number: null, method: a.payment.method ?? null,
            currency: a.payment.currency, reference: a.payment.reference ?? null,
            notes: a.payment.notes ?? null, bank_account_id: a.payment.bank_account_id ?? null,
            bank_account_name: a.payment.bank_account?.name ?? null,
          };
        }
        if (a.supplier_credit_note) {
          return {
            allocation_id: a.id, source: 'supplier_credit_note', source_id: a.supplier_credit_note.id,
            amount: Number(a.amount), occurred_at: a.supplier_credit_note.issued_at,
            document_number: a.supplier_credit_note.supplier_credit_note_number ?? null,
            method: null, currency: a.supplier_credit_note.currency,
            reference: a.supplier_credit_note.reason ?? null, notes: null, bank_account_id: null,
            bank_account_name: null,
          };
        }
        return null;
      })
      .filter((r): r is ExpenseSettlement => r !== null)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  },

  /**
   * Money-out payments already recorded that still have an unallocated remainder — the
   * candidates for "I paid this earlier, attach it to this expense". Filtered to the
   * expense's currency because a cross-currency attach would need a rate we'd be guessing.
   */
  async listAttachablePayments(workspaceId: string, opts: { currency?: string; companyId?: string | null; contactId?: string | null; limit?: number } = {}): Promise<AttachablePayment[]> {
    let q = supabase
      .from('payments')
      .select('id, amount, currency, paid_at, method, reference, counterparty_company_id, counterparty_contact_id')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'out')
      .order('paid_at', { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.currency) q = q.eq('currency', opts.currency);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];
    // The remainder comes from the one SQL derivation, not from re-summing an embedded
    // allocations array — this site and getDepositsOnAccount disagreed on the fallback.
    const remainders = await financeService.paymentRemainders(rows.map((p) => p.id));
    const withRoom = rows
      .map((p) => {
        const r = remainders.get(p.id);
        return { p, allocated: r?.allocated ?? 0, unallocated: r?.unallocated ?? 0 };
      })
      .filter((r) => r.unallocated > 0.005);
    if (withRoom.length === 0) return [];

    const companyIds = [...new Set(withRoom.map((r) => r.p.counterparty_company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(withRoom.map((r) => r.p.counterparty_contact_id).filter(Boolean))] as string[];
    const [companies, contacts] = await Promise.all([
      companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const companyName = new Map<string, string>(((companies as any).data ?? []).map((c: any) => [c.id, c.name]));
    const contactName = new Map<string, string>(((contacts as any).data ?? []).map((c: any) => [c.id, c.name || [c.first_name, c.last_name].filter(Boolean).join(' ')]));

    const named = withRoom.map(({ p, allocated, unallocated }) => ({
      id: p.id,
      amount: Number(p.amount),
      allocated,
      unallocated,
      currency: p.currency,
      paid_at: p.paid_at,
      method: p.method ?? null,
      reference: p.reference ?? null,
      counterparty_company_id: p.counterparty_company_id ?? null,
      counterparty_contact_id: p.counterparty_contact_id ?? null,
      party_name: p.counterparty_company_id
        ? (companyName.get(p.counterparty_company_id) ?? null)
        : p.counterparty_contact_id ? (contactName.get(p.counterparty_contact_id) ?? null) : null,
    }));

    // HARD-FILTER to the expense's own supplier, not merely sort them first.
    // Sorting left every unallocated money-out payment in the workspace selectable, so attaching
    // the wrong row settled this supplier's bill with ANOTHER supplier's cash — the exact
    // cross-party reattribution that RecordPaymentDialog hard-scopes against on the customer
    // side. Payments with no counterparty at all are kept: they belong to nobody yet, so
    // attaching one here is how they get attributed.
    if (!opts.companyId && !opts.contactId) return named;
    const isSameParty = (p: AttachablePayment) =>
      (opts.companyId && p.counterparty_company_id === opts.companyId) ||
      (opts.contactId && p.counterparty_contact_id === opts.contactId);
    const isUnattributed = (p: AttachablePayment) =>
      !p.counterparty_company_id && !p.counterparty_contact_id;
    return [...named.filter(isSameParty), ...named.filter(isUnattributed)];
  },

  /**
   * Attach an ALREADY-RECORDED money-out payment to an expense. Server-side RPC because the
   * source side needs guarding — the over-allocation trigger only protects the target, so a
   * raw insert could spread more of a payment than it holds. Omit `amount` to settle as much
   * as both sides allow. Returns the allocation id.
   */
  async attachPaymentToExpense(input: { paymentId: string; supplierBillId: string; amount?: number }): Promise<string> {
    const { data, error } = await supabase.rpc('allocate_payment_to_supplier_bill', {
      p_payment_id: input.paymentId,
      p_supplier_bill_id: input.supplierBillId,
      p_amount: input.amount ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** Detach a payment from an expense. The bill's settled state re-derives from the ledger. */
  async detachPaymentFromExpense(allocationId: string): Promise<void> {
    const { error } = await supabase.rpc('deallocate_payment_from_supplier_bill', { p_allocation_id: allocationId });
    if (error) throw error;
  },

  // -------- Recurring expenses (auto-generate a bill each period) --------

  /** Compute the first future run date one cadence-step after an anchor date. */
  nextRecurrenceDate(anchorISO: string, cadence: RecurringCadence, interval = 1): string {
    const d = new Date(anchorISO + 'T00:00:00Z');
    if (cadence === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * interval);
    else if (cadence === 'monthly') d.setUTCMonth(d.getUTCMonth() + interval);
    else if (cadence === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3 * interval);
    else d.setUTCFullYear(d.getUTCFullYear() + interval);
    return d.toISOString().slice(0, 10);
  },

  async createRecurringExpense(input: {
    workspaceId: string;
    categoryId: string;
    supplierCompanyId?: string | null;
    supplierContactId?: string | null;
    description?: string | null;
    referencePrefix?: string | null;
    currency?: string;
    subtotalNet: number;
    vatAmount: number;
    cadence: RecurringCadence;
    intervalCount?: number;
    dueDays?: number;
    nextRunAt: string;
    autoPay?: boolean;
    bankAccountId?: string | null;
    paymentMethod?: string | null;
    notes?: string | null;
    /** Stamped onto every generated bill — see RecurringExpense.project_id. */
    projectId?: string | null;
    orderId?: string | null;
  }): Promise<RecurringExpense> {
    if (!input.supplierCompanyId && !input.supplierContactId) {
      throw new Error('A recurring expense needs a supplier / payee.');
    }
    const { data, error } = await supabase.from('finance_recurring_expenses').insert({
      workspace_id: input.workspaceId,
      category_id: input.categoryId,
      supplier_company_id: input.supplierCompanyId ?? null,
      supplier_contact_id: input.supplierContactId ?? null,
      description: input.description ?? null,
      reference_prefix: input.referencePrefix ?? null,
      currency: input.currency ?? 'EUR',
      subtotal_net: Number((input.subtotalNet || 0).toFixed(2)),
      vat_amount: Number((input.vatAmount || 0).toFixed(2)),
      cadence: input.cadence,
      interval_count: input.intervalCount ?? 1,
      due_days: input.dueDays ?? 0,
      next_run_at: input.nextRunAt,
      auto_pay: input.autoPay ?? false,
      bank_account_id: input.bankAccountId ?? null,
      payment_method: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      project_id: input.projectId ?? null,
      order_id: input.orderId ?? null,
    } as any).select().single();
    if (error) throw error;
    return data as RecurringExpense;
  },

  async listRecurringExpenses(workspaceId: string): Promise<RecurringExpense[]> {
    const { data, error } = await supabase.from('finance_recurring_expenses')
      .select('*').eq('workspace_id', workspaceId).order('next_run_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as RecurringExpense[];
  },

  async setRecurringExpenseActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('finance_recurring_expenses')
      .update({ is_active: isActive } as any).eq('id', id);
    if (error) throw error;
  },

  async deleteRecurringExpense(id: string): Promise<void> {
    const { error } = await supabase.from('finance_recurring_expenses').delete().eq('id', id);
    if (error) throw error;
  },

  async listSupplierBills(opts: { workspaceId?: string; supplierCompanyId?: string; status?: SupplierBillStatus[] } = {}): Promise<SupplierBill[]> {
    let q = supabase.from('supplier_bills').select('*').order('issued_at', { ascending: false, nullsFirst: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.supplierCompanyId) q = q.eq('supplier_company_id', opts.supplierCompanyId);
    if (opts.status?.length) q = q.in('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SupplierBill[];
  },

  // -------- Credit notes --------

  /**
   * Issue a standalone correlated credit note (myDATA 5.1). Splits the gross amount into
   * net+VAT using the invoice's VAT rate, then calls issue_credit_note, which creates the
   * note + line + a netting allocation that reduces the invoice's amount_due (and flips it
   * to credit_noted when fully covered). The original invoice stays immutable.
   * Pass submitFiscal to immediately transmit it to the workspace's legal connector.
   */
  async createCreditNote(input: {
    workspaceId?: string;
    invoiceId: string;
    amount: number;          // gross (net + VAT) — used only when `lines` is omitted
    currency?: string;
    reason: string;
    correlated?: boolean;    // 5.1 (correlated, default) vs 5.2
    submitFiscal?: boolean;
    /** Explicit per-line credit (preferred — credits specific invoice lines/quantities).
     *  When omitted, a single synthetic line is derived from `amount` at the invoice VAT rate. */
    lines?: Array<{
      source_invoice_item_id?: string | null; product_id?: string | null; description: string;
      sku?: string | null; unit?: string | null; quantity: number; unit_price: number;
      net_value: number; vat_amount: number; vat_category?: number | null; vat_percent?: number | null;
      income_classification_type?: string | null; income_classification_category?: string | null;
    }>;
  }): Promise<{ credit_note_id: string; fiscal_submitted: boolean; fiscal_error?: string }> {
    if (input.lines && input.lines.length > 0) {
      const { data: cnId, error } = await supabase.rpc('issue_credit_note', {
        p_invoice_id: input.invoiceId,
        p_lines: input.lines,
        p_reason: input.reason,
        p_correlated: input.correlated ?? true,
      });
      if (error) throw error;
      let fiscalSubmitted = false;
      let fiscalError: string | undefined;
      if (input.submitFiscal) {
        try { await this.submitCreditNoteFiscal(cnId as string); fiscalSubmitted = true; }
        catch (e: any) { fiscalError = e?.message ?? 'myDATA transmission failed'; }
      }
      return { credit_note_id: cnId as string, fiscal_submitted: fiscalSubmitted, fiscal_error: fiscalError };
    }

    const { data: inv } = await supabase
      .from('invoices')
      .select('vat_rate')
      .eq('id', input.invoiceId)
      .single();
    const rate = Number((inv as any)?.vat_rate ?? 24);
    const net = round2(extractNet(input.amount, rate));
    const vat = round2(input.amount - net);
    // myDATA VAT category — EXACT rate→category map via the shared vatMath helper
    // (matches supabase/functions/_shared/fiscal/invoice-builder.ts). A `>=` ladder
    // here mislabelled the reduced-island rates 17/9/4.
    const vatCat = vatCategory(rate);

    const lines = [{
      description: input.reason || 'Credit',
      quantity: 1,
      unit_price: net,
      net_value: net,
      vat_percent: rate,
      vat_category: vatCat,
      vat_amount: vat,
    }];

    const { data: cnId, error } = await supabase.rpc('issue_credit_note', {
      p_invoice_id: input.invoiceId,
      p_lines: lines,
      p_reason: input.reason,
      p_correlated: input.correlated ?? true,
    });
    if (error) throw error;

    let fiscalSubmitted = false;
    let fiscalError: string | undefined;
    if (input.submitFiscal) {
      // The note already exists + nets the invoice regardless, but DON'T silently
      // swallow a myDATA transmission failure — surface it so the caller can warn
      // the operator instead of reporting a clean success on an untransmitted note.
      try { await this.submitCreditNoteFiscal(cnId as string); fiscalSubmitted = true; }
      catch (e: any) { fiscalError = e?.message ?? 'myDATA transmission failed'; }
    }
    return { credit_note_id: cnId as string, fiscal_submitted: fiscalSubmitted, fiscal_error: fiscalError };
  },

  /** Transmit an existing credit note to the workspace's legal connector (myDATA 5.1). */
  async submitCreditNoteFiscal(creditNoteId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { credit_note_id: creditNoteId, submit_fiscal: true },
    });
    if (error) throw await edgeError(error);
    return data;
  },

  async listCreditNotes(opts: { workspaceId?: string; invoiceId?: string } = {}): Promise<CreditNote[]> {
    let q = supabase.from('credit_notes').select('*').order('issued_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.invoiceId) q = q.eq('invoice_id', opts.invoiceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CreditNote[];
  },

  /**
   * Record a SUPPLIER credit note (πιστωτικό προμηθευτή) against a supplier bill.
   * The supplier issues + transmits these to myDATA; we only record them to relieve our
   * payable. `issue_supplier_credit_note` writes the note + a netting allocation, so the
   * bill's amount_due drops via the shared recompute trigger. `externalMark` captures the
   * supplier's own myDATA MARK for reconciliation.
   */
  async issueSupplierCreditNote(input: {
    workspaceId: string;
    /** Link to a recorded supplier bill (nets its payable) OR omit for a standalone note. */
    supplierBillId?: string | null;
    /** Required when no bill is linked — the supplier the note is from. */
    supplier?: { type: 'company' | 'contact'; id: string } | null;
    currency?: string | null;
    issuedAt?: string | null;
    categoryId?: string | null;
    markPaid?: boolean;
    reason?: string;
    externalMark?: string;
    lines: Array<{
      product_id?: string | null; description: string; quantity: number; unit_price: number;
      net_value: number; vat_amount: number; vat_category?: number | null; vat_percent?: number | null;
      unit?: string | null; sku?: string | null;
    }>;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('issue_supplier_credit_note', {
      p_supplier_bill_id: input.supplierBillId ?? null,
      p_lines: input.lines,
      p_reason: input.reason ?? null,
      p_external_mark: input.externalMark ?? null,
      p_workspace_id: input.workspaceId,
      p_supplier_company_id: input.supplier?.type === 'company' ? input.supplier.id : null,
      p_supplier_contact_id: input.supplier?.type === 'contact' ? input.supplier.id : null,
      p_currency: input.currency ?? 'EUR',
      p_issued_at: input.issuedAt ?? null,
      p_category_id: input.categoryId ?? null,
      p_mark_paid: input.markPaid ?? false,
    });
    if (error) throw error;
    return data as string;
  },

  async listSupplierCreditNotes(opts: { workspaceId?: string; supplierBillId?: string } = {}): Promise<SupplierCreditNote[]> {
    let q = supabase.from('supplier_credit_notes').select('*').order('issued_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.supplierBillId) q = q.eq('supplier_bill_id', opts.supplierBillId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SupplierCreditNote[];
  },

  // -------- Quote activities --------

  async listQuoteActivities(quoteId: string): Promise<QuoteActivity[]> {
    const { data, error } = await supabase
      .from('quote_activities')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as QuoteActivity[];
  },

  async createQuoteActivity(input: {
    quoteId: string;
    kind: QuoteActivityKind;
    body?: string;
    scheduledFor?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<QuoteActivity> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('quote_activities')
      .insert({
        quote_id: input.quoteId,
        user_id: user?.id ?? null,
        kind: input.kind,
        body: input.body ?? null,
        scheduled_for: input.scheduledFor ?? null,
        metadata: input.metadata ?? {},
      })
      .select()
      .single();
    if (error) throw error;
    return data as QuoteActivity;
  },

  async completeQuoteActivity(activityId: string): Promise<void> {
    const { error } = await supabase
      .from('quote_activities')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activityId);
    if (error) throw error;
  },

  // -------- Aggregated reports --------

  async getArAging(workspaceId?: string): Promise<AgingRow[]> {
    let q = supabase.from('vw_ar_aging').select('*').order('days_overdue', { ascending: false });
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AgingRow[];
  },

  async getApAging(workspaceId?: string): Promise<AgingRow[]> {
    let q = supabase.from('vw_ap_aging').select('*').order('days_overdue', { ascending: false });
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AgingRow[];
  },

  /**
   * Per-customer AR aging buckets (0-30 / 31-90 / 90+ days past due, plus not-due).
   * One row per customer with an open balance; lets staff see how aged each
   * customer's debt is at a glance. Optionally scope to a single party.
   */
  async getCustomerAgingBuckets(opts?: {
    workspaceId?: string;
    companyId?: string;
    contactId?: string;
  }): Promise<CustomerAgingBuckets[]> {
    let q = supabase
      .from('vw_customer_aging_buckets')
      .select('*')
      .order('total_outstanding', { ascending: false });
    if (opts?.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts?.companyId) q = q.eq('customer_company_id', opts.companyId);
    if (opts?.contactId) q = q.eq('customer_contact_id', opts.contactId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CustomerAgingBuckets[];
  },

  async getFollowUpQueue(workspaceId?: string): Promise<FollowUpRow[]> {
    let q = supabase.from('vw_quote_followup_queue').select('*').order('days_since_activity', { ascending: false });
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as FollowUpRow[];
  },

  async getMonthlyPnl(workspaceId: string, monthsBack = 12): Promise<PnlRow[]> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);
    const { data, error } = await supabase
      .from('vw_monthly_pnl')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('period_month', cutoff.toISOString().slice(0, 10))
      .order('period_month', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PnlRow[];
  },

  async getCashFlowForecast(workspaceId: string, daysAhead = 90): Promise<CashFlowRow[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + daysAhead);
    const { data, error } = await supabase
      .from('vw_cash_flow_forecast')
      .select('*')
      .eq('workspace_id', workspaceId)
      .lte('expected_date', limit.toISOString().slice(0, 10))
      .order('expected_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CashFlowRow[];
  },

  /**
   * Money received but NOT yet turned into a document — customer deposits / on-account credit.
   * = inbound payments whose allocated-to-invoices amount is less than the payment, i.e. the
   * unallocated remainder. This is cash held as a liability (revenue isn't recognised until a
   * receipt/invoice is issued), so it never shows in P&L/AR — this surfaces it + lets you reconcile.
   */
  async getDepositsOnAccount(workspaceId: string): Promise<{
    /** Largest single-currency bucket — NOT a cross-currency sum. Prefer `totals`. */
    total: number; currency: string;
    /** One entry per currency present, largest first. Never sum across these. */
    totals: Array<{ currency: string; total: number }>;
    rows: Array<{ payment_id: string; paid_at: string; amount: number; unallocated: number; currency: string; reference: string | null; credit_number: string | null; order_id: string | null; order_number: string | null; party_name: string | null }>;
  }> {
    const { data: pays } = await supabase.from('payments')
      .select('id, amount, currency, paid_at, reference, credit_number, order_id, counterparty_company_id, counterparty_contact_id')
      .eq('workspace_id', workspaceId).eq('direction', 'in')
      .order('paid_at', { ascending: false }).limit(500);
    const payments = (pays ?? []) as Array<{ id: string; amount: number; currency: string; paid_at: string; reference: string | null; credit_number: string | null; order_id: string | null; counterparty_company_id: string | null; counterparty_contact_id: string | null }>;
    if (payments.length === 0) return { total: 0, currency: 'EUR', totals: [], rows: [] };
    const ids = payments.map((p) => p.id);

    // Remainder per payment, from the one SQL derivation. This used to sum `amount_doc_currency`
    // with no fallback, so an older allocation row with that column NULL counted as zero settled
    // and inflated the deposit shown here.
    const remainders = await financeService.paymentRemainders(ids);

    // Order numbers + party names in batch.
    const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))] as string[];
    const compIds = [...new Set(payments.map((p) => p.counterparty_company_id).filter(Boolean))] as string[];
    const contactIds = [...new Set(payments.map((p) => p.counterparty_contact_id).filter(Boolean))] as string[];
    const [ords, comps, conts] = await Promise.all([
      orderIds.length ? supabase.from('orders').select('id, order_number').in('id', orderIds) : Promise.resolve({ data: [] as any[] }),
      compIds.length ? supabase.from('crm_companies').select('id, name').in('id', compIds) : Promise.resolve({ data: [] as any[] }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const omap = new Map<string, string | null>((ords.data ?? []).map((o: any) => [o.id, o.order_number]));
    const cmap = new Map<string, string>((comps.data ?? []).map((c: any) => [c.id, c.name]));
    const ctmap = new Map<string, string>((conts.data ?? []).map((c: any) => [c.id, c.name]));

    const rows = payments.map((p) => {
      const unallocated = remainders.get(p.id)?.unallocated ?? 0;
      return {
        payment_id: p.id, paid_at: p.paid_at, amount: Number(p.amount), unallocated, currency: p.currency,
        reference: p.reference, credit_number: p.credit_number, order_id: p.order_id, order_number: p.order_id ? (omap.get(p.order_id) ?? null) : null,
        party_name: p.counterparty_company_id ? (cmap.get(p.counterparty_company_id) ?? null) : (p.counterparty_contact_id ? (ctmap.get(p.counterparty_contact_id) ?? null) : null),
      };
    }).filter((r) => r.unallocated > 0.005);

    // Per-currency totals. `total` used to sum EVERY unallocated remainder regardless of currency
    // and label the result with `rows[0].currency` — whichever the NEWEST deposit happened to be —
    // so the "Received, not yet invoiced" card and the AR credit netting presented a mixed sum
    // under one symbol, and the resulting credit rows netted against euro receivables.
    // `total`/`currency` are kept for callers that have not been updated, but they now describe
    // only the LARGEST single-currency bucket rather than a meaningless cross-currency sum.
    const byCurrency = new Map<string, number>();
    for (const r of rows) {
      byCurrency.set(r.currency, Math.round(((byCurrency.get(r.currency) ?? 0) + r.unallocated) * 100) / 100);
    }
    const totals = [...byCurrency.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => b.total - a.total);
    return {
      total: totals[0]?.total ?? 0,
      currency: totals[0]?.currency ?? 'EUR',
      totals,
      rows,
    };
  },

  async getCustomerAccount(opts: { contactId?: string; companyId?: string }): Promise<{
    quoteCount: number;
    quotedTotal: number;
    acceptedTotal: number;
    invoicedTotal: number;
    paidTotal: number;
    outstandingTotal: number;
  } | null> {
    let q = supabase.from('vw_customer_account_summary').select('*');
    if (opts.contactId) q = q.eq('customer_contact_id', opts.contactId);
    if (opts.companyId) q = q.eq('customer_company_id', opts.companyId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    return {
      quoteCount: row.quote_count ?? 0,
      quotedTotal: row.quoted_total ?? 0,
      acceptedTotal: row.accepted_total ?? 0,
      invoicedTotal: row.invoiced_total ?? 0,
      paidTotal: row.paid_total ?? 0,
      outstandingTotal: row.outstanding_total ?? 0,
    };
  },

  /** Effective order/credit limits for a buyer (per-customer override → workspace default). */
  async getBuyerFinanceLimits(opts: { workspaceId: string; companyId?: string; contactId?: string }): Promise<{
    credit_limit: number | null;
    min_order_value: number | null;
    payment_terms_days: number | null;
    warn_over_credit_limit: boolean;
    block_over_credit_limit: boolean;
    block_min_order: boolean;
    block_unpaid_invoice: boolean;
  }> {
    const { data, error } = await supabase.rpc('get_buyer_finance_limits', {
      p_workspace_id: opts.workspaceId,
      p_company_id: opts.companyId ?? null,
      p_contact_id: opts.contactId ?? null,
    });
    if (error) throw error;
    return data as any;
  },

  async getSupplierAccount(opts: { contactId?: string; companyId?: string }): Promise<{
    poCount: number;
    orderedTotal: number;
    billedTotal: number;
    paidTotal: number;
    outstandingTotal: number;
  } | null> {
    let q = supabase.from('vw_supplier_account_summary').select('*');
    if (opts.contactId) q = q.eq('supplier_contact_id', opts.contactId);
    if (opts.companyId) q = q.eq('supplier_company_id', opts.companyId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    return {
      poCount: row.po_count ?? 0,
      orderedTotal: row.ordered_total ?? 0,
      billedTotal: row.billed_total ?? 0,
      paidTotal: row.paid_total ?? 0,
      outstandingTotal: row.outstanding_total ?? 0,
    };
  },
};

// =============================================================================
// Planned payments + reports + parties + settings (v2)
// =============================================================================

export type PlannedPaymentDirection = 'in' | 'out';
export type PlannedPaymentStatus = 'planned' | 'paid' | 'cancelled' | 'overdue';
export type PlannedPaymentCategory =
  | 'supplier_bill'
  | 'rent'
  | 'utility'
  | 'tax'
  | 'salary'
  | 'expected_receipt'
  | 'loan'
  | 'expense'
  | 'other';

export interface PlannedPayment {
  id: string;
  workspace_id: string;
  direction: PlannedPaymentDirection;
  amount: number;
  currency: string;
  scheduled_for: string;
  category: PlannedPaymentCategory;
  title: string;
  notes: string | null;
  counterparty_company_id: string | null;
  counterparty_contact_id: string | null;
  supplier_bill_id: string | null;
  invoice_id: string | null;
  status: PlannedPaymentStatus;
  paid_payment_id: string | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartyRow {
  party_type: 'company' | 'contact';
  party_id: string;
  display_name: string;
  email: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  workspace_id: string;
  invoiced_total: number;
  receivable_paid_total: number;
  receivable_outstanding: number;
  billed_total: number;
  payable_paid_total: number;
  payable_outstanding: number;
  net_position: number;
  credit_limit: number | null;
  over_credit_limit: boolean;
  contact_group: string | null;
  /** Unallocated money-in we are holding for this party — cash of theirs settled against nothing. */
  on_account_credit: number;
  /**
   * Derived in `vw_finance_parties`, not here: there is money on account AND they owe nothing.
   * While an invoice is still open that leftover belongs against THAT invoice, so offering to
   * book it as income would turn a receivable into profit nobody earned. Every consumer — the
   * Parties list, the order panel's prompt, the nightly sweep — reads this one boolean.
   */
  credit_releasable: boolean;
}

export interface FinanceSettings {
  workspace_id: string;
  statements_enabled: boolean;
  statement_email_subject: string | null;
  statement_email_body: string | null;
  statement_template_cover_path: string | null;
  statement_template_footer_path: string | null;
  default_payment_terms_days: number;
  default_vat_rate: number;
  /** Blanket sell uplift on catalog products this workspace resells. */
  default_markup_pct: number;
  digest_enabled: boolean;
  digest_frequency: 'daily' | 'weekly' | 'monthly';
  digest_day_of_week: number | null;
  digest_hour_utc: number;
  digest_recipients: string[];
  digest_last_sent_at: string | null;
  /** Automatic per-customer statement (Καρτέλα) schedule. Off by default. */
  auto_statement_enabled: boolean;
  auto_statement_frequency: 'every_n_days' | 'weekly' | 'monthly';
  auto_statement_interval_days: number | null;
  auto_statement_day_of_week: number | null;
  auto_statement_day_of_month: number;
  auto_statement_hour_utc: number;
  auto_statement_only_outstanding: boolean;
  auto_statement_min_balance: number;
  auto_statement_side: 'customer' | 'supplier' | 'both';
  auto_statement_last_run_at: string | null;
  /** Buyer risk-gate rules enforced at invoice issuance (ΑΑΔΕ status + credit limit + order rules). */
  risk_block_inactive_vat: boolean;
  risk_block_unvalidated_vat: boolean;
  risk_warn_over_credit_limit: boolean;
  risk_block_over_credit_limit: boolean;
  /**
   * Quote governance. Both are enforced by QuoteDetailAdminPage but had no writer anywhere,
   * so every workspace sat on the DB defaults ('warn' / true) with no way to change them.
   *
   */
  negative_margin_policy: 'warn' | 'block';
  sales_can_see_cost: boolean;
  /** Order rules: workspace defaults (overridable per-customer in CRM). */
  min_order_value: number | null;
  default_credit_limit: number | null;
  risk_block_min_order: boolean;
  risk_block_unpaid_invoice: boolean;
  /** Invoice design template selected for this workspace + per-role color overrides. */
  invoice_template_id: string;
  invoice_template_colors: Record<string, string>;
  /** Default footer notes prefilled onto every new invoice (editable per-invoice). */
  default_invoice_notes: string | null;
  /** Print a "Pay / view online" link + QR (→ /pay/{token}) on payable invoices. */
  invoice_show_pay_link: boolean;
  /** Print the customer's carry-forward (previous balance / credit) below the total. */
  invoice_show_previous_balance: boolean;
  /** How an approved trip card posts to the ledger: planned_payment (auto-reimburse) | none. */
  trip_expense_reimbursement_mode: 'planned_payment' | 'none';
  updated_at: string;
}

export interface SalesPerDayRow { period: string; invoice_count: number; revenue_net: number; gross_margin: number }
/** Daily cash movements (Oxygen "Εισπράξεις/Πληρωμές"): settled cash in vs out per day. */
export interface CashflowPerDayRow { period: string; receipts: number; payments: number; difference: number; payment_count: number }
/** P&L per finance category (Oxygen "Αναφορά ανά Επ. Κατηγορία"). */
export interface PnlPerCategoryRow { category_id: string | null; category_name: string; income: number; customer_credits: number; expenses: number; supplier_credits: number; net: number; vat_income: number; vat_expense: number }
export interface VatReportRow { section: 'output' | 'output_credit' | 'input' | 'input_credit'; vat_rate: number | null; net: number; vat: number; doc_count: number }
export interface VatByCodeRow { vat_category: number | null; vat_rate: number | null; income_classification_type: string; income_classification_category: string; net: number; vat: number; line_count: number }
export interface PartyLedgerRow {
  entry_date: string | null; doc_kind: string; doc_number: string | null;
  debit: number; credit: number; currency: string | null;
  /** The row's own record id — every ledger line IS a document that exists somewhere. */
  doc_id: string | null;
  /** What it settles/credits: a credit note's invoice, a supplier credit note's bill. */
  related_id: string | null;
}
export type MyDataBucket = 'accepted' | 'offline_pending' | 'rejected' | 'failed' | 'not_transmitted';
export interface MyDataReconRow { doc_kind: 'invoice' | 'credit_note' | 'delivery_note'; doc_id: string; doc_number: string | null; issued_at: string | null; total: number | null; currency: string | null; fiscal_status: string | null; fiscal_mark: string | null; bucket: MyDataBucket }
export interface SalesPerCustomerRow { party_type: 'company'|'contact'; party_id: string; display_name: string; invoice_count: number; revenue_net: number; gross_margin: number }
/** One Intrastat declaration line: commodity code x partner country x country of origin. */
export interface IntrastatRow {
  cn8: string;
  description: string | null;
  partner_country: string;
  country_of_origin: string | null;
  net_mass_kg: number | null;
  invoiced_value: number | null;
  currency: string | null;
  lines: number;
}

export interface MyfRow { direction: 'sales' | 'purchases'; counterparty_name: string; vat_number: string | null; doc_count: number; net: number; vat: number; gross: number }
export interface SalesPerProductRow { product_id: string | null; product_name: string; sku: string | null; total_quantity: number; revenue_net: number; gross_margin: number }
export interface CustomerTopProductRow { product_id: string; description: string; sku: string | null; total_quantity: number; revenue_net: number; order_count: number; last_ordered: string | null; on_hand: number }
export interface SalesPerCategoryRow { category_id: string | null; category_name: string; line_count: number; total_quantity: number; revenue_net: number; gross_margin: number }
export interface PurchasesPerProductRow { product_id: string | null; product_name: string; sku: string | null; total_quantity: number; total_cost: number }
export interface OpenTaskRow { quote_id: string; quote_label: string; kind: string; scheduled_for: string; days_until: number; body: string | null; owner_user_id: string | null }

export interface SalesPerFactoryRow { factory_name: string; line_count: number; total_quantity: number; revenue_net: number; gross_margin: number }
export interface SpendPerSupplierRow { party_type: 'company'|'contact'; party_id: string | null; display_name: string; bill_count: number; billed_total: number; paid_total: number; outstanding: number }
export interface PaymentsPerCounterpartyOutRow { party_type: 'company'|'contact'; party_id: string | null; display_name: string; payment_count: number; total_paid: number }
export interface PaymentsPerCounterpartyInRow { party_type: 'company'|'contact'; party_id: string | null; display_name: string; payment_count: number; total_received: number }
export interface SalesPerDesignerRow { user_id: string; display_name: string; invoice_count: number; revenue_net: number; gross_margin: number; accepted_quote_count: number }
export interface TopOutstandingRow {
  party_type: 'company'|'contact';
  party_id: string | null;
  display_name: string;
  open_invoice_count?: number;
  open_bill_count?: number;
  outstanding: number;
  oldest_due_at: string | null;
  max_days_overdue: number;
}

// v2 method bundle — merged into financeService below so callers see one symbol.
const _financeServiceV2 = {
  // -------- Planned payments --------

  async listPlannedPayments(opts: {
    workspaceId: string;
    direction?: PlannedPaymentDirection;
    status?: PlannedPaymentStatus[];
    from?: string;
    to?: string;
  }): Promise<PlannedPayment[]> {
    let q = supabase.from('planned_payments').select('*')
      .eq('workspace_id', opts.workspaceId)
      .order('scheduled_for', { ascending: true });
    if (opts.direction) q = q.eq('direction', opts.direction);
    if (opts.status?.length) q = q.in('status', opts.status);
    if (opts.from) q = q.gte('scheduled_for', opts.from);
    if (opts.to) q = q.lte('scheduled_for', opts.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PlannedPayment[];
  },

  async createPlannedPayment(input: {
    workspaceId: string;
    direction: PlannedPaymentDirection;
    title: string;
    amount: number;
    currency?: string;
    scheduledFor: string;
    category: PlannedPaymentCategory;
    counterpartyCompanyId?: string | null;
    counterpartyContactId?: string | null;
    supplierBillId?: string | null;
    invoiceId?: string | null;
    notes?: string;
    reminderAt?: string | null;
  }): Promise<PlannedPayment> {
    const { data, error } = await supabase.from('planned_payments').insert({
      workspace_id: input.workspaceId,
      direction: input.direction,
      title: input.title,
      amount: input.amount,
      currency: input.currency ?? 'EUR',
      scheduled_for: input.scheduledFor,
      category: input.category,
      counterparty_company_id: input.counterpartyCompanyId ?? null,
      counterparty_contact_id: input.counterpartyContactId ?? null,
      supplier_bill_id: input.supplierBillId ?? null,
      invoice_id: input.invoiceId ?? null,
      notes: input.notes ?? null,
      reminder_at: input.reminderAt ?? null,
    }).select().single();
    if (error) throw error;
    return data as PlannedPayment;
  },

  async updatePlannedPayment(id: string, patch: Partial<PlannedPayment>): Promise<void> {
    const allowed: Record<string, unknown> = {};
    for (const k of ['title','amount','scheduled_for','category','notes','status','reminder_at','counterparty_company_id','counterparty_contact_id'] as const) {
      if (patch[k] !== undefined) allowed[k] = patch[k];
    }
    const { error } = await supabase.from('planned_payments').update(allowed).eq('id', id);
    if (error) throw error;
  },

  async deletePlannedPayment(id: string): Promise<void> {
    const { error } = await supabase.from('planned_payments').delete().eq('id', id);
    if (error) throw error;
  },

  /** Mark a planned_payment as paid by creating a real payment + flipping the flag. */
  async markPlannedPaymentPaid(planned: PlannedPayment, method: PaymentMethod = 'bank_transfer'): Promise<void> {
    const paymentId = await _financeServiceCore.recordPayment({
      workspaceId: planned.workspace_id,
      direction: planned.direction,
      amount: planned.amount,
      currency: planned.currency,
      method,
      counterpartyCompanyId: planned.counterparty_company_id,
      counterpartyContactId: planned.counterparty_contact_id,
      reference: planned.title,
      notes: planned.notes ?? null,
      // If linked to a supplier_bill or invoice, allocate the full amount to it
      allocations: planned.supplier_bill_id
        ? [{ target_id: planned.supplier_bill_id, target_type: 'supplier_bill', amount: planned.amount }]
        : planned.invoice_id
          ? [{ target_id: planned.invoice_id, target_type: 'invoice', amount: planned.amount }]
          : [],
    });
    const { error } = await supabase
      .from('planned_payments')
      .update({ status: 'paid', paid_payment_id: paymentId })
      .eq('id', planned.id);
    if (error) throw error;
  },

  // -------- Parties --------

  /**
   * Business rollup: a person (CRM contact) can be attached to a company via
   * crm_company_contacts (is_primary marks the main one). When a contact is
   * chosen as the billing party on ANY document (invoice / receipt / receivable
   * / payable …), the document must be issued to that BUSINESS, not the person.
   * Returns the contact's primary company_id, or null when the contact is a
   * standalone individual. Prefers is_primary, then the oldest link.
   */
  async resolvePrimaryCompanyId(contactId: string): Promise<string | null> {
    if (!contactId) return null;
    const { data, error } = await supabase
      .from('crm_company_contacts')
      .select('company_id, is_primary, created_at')
      .eq('contact_id', contactId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data?.company_id as string | undefined) ?? null;
  },

  /**
   * THE billing party of a document, with the business rollup applied — call this, never
   * `resolvePrimaryCompanyId` directly, wherever a document's party is written.
   *
   * Exactly ONE of the pair comes back set. `vw_customer_account_summary` /
   * `vw_supplier_account_summary` UNION a per-contact branch with a per-company branch, so a
   * document carrying both ids is counted twice in that party's totals — "company OR contact,
   * never both" is a schema rule, not a style choice.
   *
   * The rule was already stated on `resolvePrimaryCompanyId` and five dialogs applied it, but two
   * ORDER paths ("raise a customer order from this purchase", and OrderLinkPicker's "for this
   * customer" branch) mapped `party_type` to ids inline and skipped it. An order raised against a
   * company's contact was stored with a null customer_company_id and then showed up NOWHERE: the
   * company's Account tab filters on customer_company_id, and the contact's Account tab is not
   * rendered at all for a company-linked contact — it points back at the company. ORD-2026-0005
   * sat invisible in both. `bind_party_company()` is the DB backstop that makes a third such site
   * impossible; this keeps the browser's pricing, document-kind hint and toast agreeing with what
   * the row will actually say.
   */
  async resolveBillingParty(party: {
    companyId?: string | null;
    contactId?: string | null;
  }): Promise<{ companyId: string | null; contactId: string | null }> {
    if (party.companyId) return { companyId: party.companyId, contactId: null };
    if (!party.contactId) return { companyId: null, contactId: null };
    const rolled = await financeService.resolvePrimaryCompanyId(party.contactId).catch(() => null);
    // A standalone individual has no company and stays a contact party. Not a gap.
    return rolled ? { companyId: rolled, contactId: null } : { companyId: null, contactId: party.contactId };
  },

  async listParties(opts: {
    workspaceId: string;
    role?: 'customer' | 'supplier' | 'both' | 'all';
    search?: string;
  }): Promise<PartyRow[]> {
    let q = supabase.from('vw_finance_parties').select('*').eq('workspace_id', opts.workspaceId);
    if (opts.role === 'customer') q = q.eq('is_customer', true);
    if (opts.role === 'supplier') q = q.eq('is_supplier', true);
    if (opts.role === 'both') q = q.eq('is_customer', true).eq('is_supplier', true);
    if (opts.search) q = q.ilike('display_name', `%${opts.search}%`);
    const { data, error } = await q.order('receivable_outstanding', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as PartyRow[];
  },

  /**
   * One party's documents for the Finance drill-down.
   *
   * Payments come through `listPayments` rather than a bare `select('*')` so each row carries what
   * it was APPLIED to (`settled`) and what is still on account (`unallocated`). Without that, a
   * deposit taken against an order showed up as an unexplained amount: it counts towards no
   * invoice, so every tile on the page reads €0 next to it.
   */
  async getPartyDetail(opts: { workspaceId: string; partyType: 'company'|'contact'; partyId: string }): Promise<{
    party: PartyRow | null;
    invoices: Invoice[];
    bills: SupplierBill[];
    payments: PaymentWithAllocation[];
  }> {
    const partyP = supabase.from('vw_finance_parties').select('*')
      .eq('workspace_id', opts.workspaceId)
      .eq('party_type', opts.partyType)
      .eq('party_id', opts.partyId)
      .maybeSingle();

    const invoicesP = opts.partyType === 'company'
      ? supabase.from('invoices').select('*').eq('customer_company_id', opts.partyId).order('issued_at', { ascending: false, nullsFirst: false })
      : supabase.from('invoices').select('*').eq('customer_contact_id', opts.partyId).order('issued_at', { ascending: false, nullsFirst: false });

    const billsP = opts.partyType === 'company'
      ? supabase.from('supplier_bills').select('*').eq('supplier_company_id', opts.partyId).order('issued_at', { ascending: false, nullsFirst: false })
      : supabase.from('supplier_bills').select('*').eq('supplier_contact_id', opts.partyId).order('issued_at', { ascending: false, nullsFirst: false });

    const paymentsP = financeService.listPayments({
      workspaceId: opts.workspaceId,
      counterpartyCompanyId: opts.partyType === 'company' ? opts.partyId : undefined,
      counterpartyContactId: opts.partyType === 'contact' ? opts.partyId : undefined,
    });

    const [party, invs, bills, payments] = await Promise.all([partyP, invoicesP, billsP, paymentsP]);
    if (party.error) throw party.error;
    if (invs.error) throw invs.error;
    if (bills.error) throw bills.error;
    return {
      party: (party.data ?? null) as PartyRow | null,
      invoices: (invs.data ?? []) as Invoice[],
      bills: (bills.data ?? []) as SupplierBill[],
      payments,
    };
  },

  // -------- Settings --------

  async getSettings(workspaceId: string): Promise<FinanceSettings> {
    const { data, error } = await supabase
      .from('finance_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as FinanceSettings;
    // Auto-create defaults on first access
    const { data: inserted, error: insErr } = await supabase
      .from('finance_settings')
      .insert({ workspace_id: workspaceId })
      .select()
      .single();
    if (insErr) throw insErr;
    return inserted as FinanceSettings;
  },

  async updateSettings(workspaceId: string, patch: Partial<FinanceSettings>): Promise<FinanceSettings> {
    const allowed: Record<string, unknown> = {};
    for (const k of [
      'statements_enabled','statement_email_subject','statement_email_body',
      'statement_template_cover_path','statement_template_footer_path',
      'default_payment_terms_days','default_vat_rate','default_markup_pct',
      'digest_enabled','digest_frequency','digest_day_of_week','digest_hour_utc','digest_recipients',
      'auto_statement_enabled','auto_statement_frequency','auto_statement_interval_days',
      'auto_statement_day_of_week','auto_statement_day_of_month','auto_statement_hour_utc',
      'auto_statement_only_outstanding','auto_statement_min_balance','auto_statement_side',
      'risk_block_inactive_vat','risk_block_unvalidated_vat',
      'risk_warn_over_credit_limit','risk_block_over_credit_limit',
      'min_order_value','default_credit_limit','risk_block_min_order','risk_block_unpaid_invoice',
      'negative_margin_policy','sales_can_see_cost',
      'invoice_template_id','invoice_template_colors','default_invoice_notes',
      'invoice_show_pay_link','invoice_show_previous_balance',
      'trip_expense_reimbursement_mode',
    ] as const) {
      if (patch[k] !== undefined) allowed[k] = patch[k];
    }
    const { data, error } = await supabase
      .from('finance_settings')
      .update(allowed)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data as FinanceSettings;
  },

  // -------- Reports --------

  async reportSalesPerDay(workspaceId: string, from: string, to: string): Promise<SalesPerDayRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_day', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as SalesPerDayRow[];
  },
  /** VAT analysis (ΦΠΑ): output by rate + input, each net of credit notes. */
  async getVatReport(workspaceId: string, from: string, to: string): Promise<VatReportRow[]> {
    const { data, error } = await supabase.rpc('finance_vat_report', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as VatReportRow[];
  },
  /** VAT analysis by myDATA classification CODE (complements VAT-by-rate). */
  async getVatByCode(workspaceId: string, from: string, to: string): Promise<VatByCodeRow[]> {
    const { data, error } = await supabase.rpc('finance_vat_by_code', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as VatByCodeRow[];
  },
  /** myDATA reconciliation: every issued legal doc bucketed by its AADE state. */
  async getMyDataReconciliation(workspaceId: string, from: string, to: string): Promise<MyDataReconRow[]> {
    const { data, error } = await supabase.rpc('finance_mydata_reconciliation', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as MyDataReconRow[];
  },
  /**
   * customer/supplier running ledger (καρτέλα): chronological debit/credit entries.
   *
   * `includeOrders` adds orders that have NOT become an invoice or a supplier bill, so the
   * commercial position reads correctly: without it, cash taken on an un-invoiced order appears as
   * a credit with nothing on the debit side and the balance claims we owe the customer. Invoiced
   * orders are never included — their invoice is already the ledger entry.
   *
   * It MUST be passed identically to `getPartyOpeningBalance`, or orders placed before the period
   * start drop out of the carry-forward while their payments stay in.
   */
  async getPartyLedger(input: {
    workspaceId: string; side: 'customer' | 'supplier';
    companyId?: string | null; contactId?: string | null; from: string; to: string;
    includeOrders?: boolean;
  }): Promise<PartyLedgerRow[]> {
    const { data, error } = await supabase.rpc('finance_party_ledger', {
      p_workspace_id: input.workspaceId, p_side: input.side,
      p_company_id: input.companyId ?? null, p_contact_id: input.contactId ?? null,
      p_from: input.from, p_to: input.to, p_include_orders: input.includeOrders ?? false,
    });
    if (error) throw error;
    return (data ?? []) as PartyLedgerRow[];
  },
  /** carry-forward balance (Προηγούμενα Σύνολα): net debit-credit of all entries before `before`.
   *  `includeOrders` has to match the `getPartyLedger` call it is summed with — see there. */
  async getPartyOpeningBalance(input: {
    workspaceId: string; side: 'customer' | 'supplier';
    companyId?: string | null; contactId?: string | null; before: string;
    includeOrders?: boolean;
  }): Promise<number> {
    const { data, error } = await supabase.rpc('finance_party_opening_balance', {
      p_workspace_id: input.workspaceId, p_side: input.side,
      p_company_id: input.companyId ?? null, p_contact_id: input.contactId ?? null,
      p_before: input.before, p_include_orders: input.includeOrders ?? false,
    });
    if (error) throw error;
    return Number(data ?? 0);
  },
  /**
   * Intrastat — the monthly statistical return for goods crossing an intra-EU border.
   *
   * Flattened to one row per commodity code / partner / origin so it drops straight into the
   * generic report table and its CSV export. The RPC also returns how many in-scope lines had NO
   * commodity code or NO weight; those are surfaced as a warning rather than dropped, because a
   * return that is quietly short is worse than one that says what it is missing.
   */
  async reportIntrastat(
    workspaceId: string, from: string, to: string, direction: 'dispatch' | 'arrival',
  ): Promise<{ rows: IntrastatRow[]; unclassified: number; unweighed: number }> {
    const { data, error } = await supabase.rpc('get_intrastat_lines', {
      p_workspace_id: workspaceId, p_from: from, p_to: to, p_direction: direction,
    });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      rows: (r.rows ?? []) as IntrastatRow[],
      unclassified: Number(r.unclassified_lines ?? 0),
      unweighed: Number(r.unweighed_lines ?? 0),
    };
  },

  async reportMyf(workspaceId: string, from: string, to: string): Promise<MyfRow[]> {
    const { data, error } = await supabase.rpc('report_myf', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as MyfRow[];
  },
  /** Daily cash movements (Oxygen report_payexp.php): receipts vs payments vs difference per day. */
  async reportCashflowPerDay(workspaceId: string, from: string, to: string): Promise<CashflowPerDayRow[]> {
    const { data, error } = await supabase.rpc('report_cashflow_per_day', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as CashflowPerDayRow[];
  },
  /** P&L per finance category (Oxygen report_ba.php): income/credits/expenses/VAT grouped by category. */
  async reportPnlPerCategory(workspaceId: string, from: string, to: string): Promise<PnlPerCategoryRow[]> {
    const { data, error } = await supabase.rpc('report_pnl_per_category', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as PnlPerCategoryRow[];
  },
  async reportSalesPerCustomer(workspaceId: string, from: string, to: string): Promise<SalesPerCustomerRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_customer', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as SalesPerCustomerRow[];
  },
  async reportSalesPerProduct(workspaceId: string, from: string, to: string): Promise<SalesPerProductRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_product', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as SalesPerProductRow[];
  },
  async reportSalesPerCategory(workspaceId: string, from: string, to: string): Promise<SalesPerCategoryRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_category', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as SalesPerCategoryRow[];
  },
  async reportPurchasesPerProduct(workspaceId: string, from: string, to: string): Promise<PurchasesPerProductRow[]> {
    const { data, error } = await supabase.rpc('report_purchases_per_product', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as PurchasesPerProductRow[];
  },
  async reportReceiptsPerProduct(workspaceId: string, from: string, to: string): Promise<PurchasesPerProductRow[]> {
    const { data, error } = await supabase.rpc('report_receipts_per_product', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as PurchasesPerProductRow[];
  },
  async reportOpenTasks(workspaceId: string): Promise<OpenTaskRow[]> {
    const { data, error } = await supabase.rpc('report_open_tasks', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as OpenTaskRow[];
  },
  async reportSalesPerFactory(workspaceId: string, from: string, to: string): Promise<SalesPerFactoryRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_factory', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as SalesPerFactoryRow[];
  },
  async reportSpendPerSupplier(workspaceId: string, from: string, to: string): Promise<SpendPerSupplierRow[]> {
    const { data, error } = await supabase.rpc('report_spend_per_supplier', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as SpendPerSupplierRow[];
  },
  async reportPaymentsOutPerCounterparty(workspaceId: string, from: string, to: string): Promise<PaymentsPerCounterpartyOutRow[]> {
    const { data, error } = await supabase.rpc('report_payments_out_per_counterparty', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as PaymentsPerCounterpartyOutRow[];
  },
  async reportPaymentsInPerCounterparty(workspaceId: string, from: string, to: string): Promise<PaymentsPerCounterpartyInRow[]> {
    const { data, error } = await supabase.rpc('report_payments_in_per_counterparty', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as PaymentsPerCounterpartyInRow[];
  },
  async reportSalesPerDesigner(workspaceId: string, from: string, to: string): Promise<SalesPerDesignerRow[]> {
    const { data, error } = await supabase.rpc('report_sales_per_designer', { p_workspace_id: workspaceId, p_from: from, p_to: to });
    if (error) throw error;
    return (data ?? []) as SalesPerDesignerRow[];
  },
  /** A customer's most-bought catalog products ("items to push"). Membership-gated RPC. */
  async reportCustomerTopProducts(input: {
    workspaceId: string; companyId?: string | null; contactId?: string | null; limit?: number;
  }): Promise<CustomerTopProductRow[]> {
    const { data, error } = await supabase.rpc('report_customer_top_products', {
      p_workspace_id: input.workspaceId,
      p_company_id: input.companyId ?? null,
      p_contact_id: input.contactId ?? null,
      p_limit: input.limit ?? 8,
    });
    if (error) throw error;
    return (data ?? []) as CustomerTopProductRow[];
  },
  async reportTopCustomerOutstanding(workspaceId: string): Promise<TopOutstandingRow[]> {
    const { data, error } = await supabase.rpc('report_top_customer_outstanding', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as TopOutstandingRow[];
  },
  async reportTopSupplierOutstanding(workspaceId: string): Promise<TopOutstandingRow[]> {
    const { data, error } = await supabase.rpc('report_top_supplier_outstanding', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as TopOutstandingRow[];
  },

  // -------- Send statement --------

  async sendStatement(input: {
    partyType: 'company'|'contact';
    partyId: string;
    email?: string;
    dryRun?: boolean;
    side?: 'customer' | 'supplier';
    from?: string;
    to?: string;
    lang?: 'el' | 'en';
  }): Promise<{ ok: boolean; email_sent_to: string | null; pdf_url: string | null; lines: number; total_outstanding: number; error?: string }> {
    const { data, error } = await supabase.functions.invoke('finance-send-statement', {
      body: {
        party_type: input.partyType,
        party_id: input.partyId,
        email: input.email,
        dry_run: input.dryRun,
        side: input.side,
        from: input.from,
        to: input.to,
        lang: input.lang,
      },
    });
    if (error) {
      // supabase-js wraps any non-2xx as a FunctionsHttpError whose message is the
      // generic "Edge Function returned a non-2xx status code" — the real reason
      // (e.g. "Statement sending is disabled in finance settings.") lives in the
      // response body. Surface it as a typed error so UI can open the Connect-email
      // gate on `workspace_sender_required` and show a truthful toast otherwise.
      const { code, message } = await unwrapEmailSendError(error);
      throw new EmailSendError(message, (code as any) ?? 'unknown');
    }
    return data as any;
  },

  /**
   * Mint (or reuse) a public account-statement share link for a party. The recipient
   * opens it and unlocks the statement with their VAT + email. Admin/finance/sales auth.
   */
  async mintStatementShareLink(input: {
    partyType: 'company' | 'contact'; partyId: string; side?: 'customer' | 'supplier';
    /** Revoke the current link and issue a fresh one (kills the old URL). */
    rotate?: boolean;
  }): Promise<{ ok: boolean; url: string; token: string; rotated?: boolean }> {
    const { data, error } = await supabase.functions.invoke('finance-send-statement', {
      body: { mode: input.rotate ? 'share_rotate' : 'share_mint', party_type: input.partyType, party_id: input.partyId, side: input.side },
    });
    if (error) throw await edgeError(error);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  },

  /**
   * Public: resolve a statement share token with the recipient's VAT + email. No auth —
   * called from the /statement/:token page. Returns the ledger + open invoices (each with
   * a /pay/{token} Stripe link) on match, or an error payload otherwise.
   */
  async viewStatementShare(input: { token: string; vat: string; email: string }): Promise<{
    ok: boolean; error?: string;
    party_name?: string; business_name?: string | null; side?: 'customer' | 'supplier';
    currency?: string; lang?: 'el' | 'en'; from?: string; to?: string;
    opening?: number; closing?: number;
    closing_label?: string; owes?: boolean; outstanding?: number;
    title?: string;
    issuer?: { name: string | null; address: string | null; city: string | null; vat: string | null; tax_office: string | null; phone: string | null; email: string | null };
    recipient?: { name: string | null; address: string | null; city: string | null; vat: string | null; tax_office: string | null; email: string | null };
    bank_transfer?: { label: string; lines: string[] } | null;
    rows?: Array<{ date: string | null; kind: string; doc: string | null; debit: number; credit: number; balance: number }>;
    invoices?: Array<{ internal_number: string | null; amount_due: number; currency: string; pay_url: string | null }>;
    pdf_url?: string | null;
    payment_link_url?: string | null;
    logo_url?: string | null;
    background_url?: string | null;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-send-statement', {
      body: { mode: 'share_view', token: input.token, vat: input.vat, email: input.email },
    });
    // A 401 (no match) comes back as a FunctionsHttpError; surface the body's message.
    if (error) {
      const e = await edgeError(error).catch(() => null);
      return { ok: false, error: (e as any)?.message ?? 'The VAT number or email does not match our records.' };
    }
    return data as any;
  },

  // -------- Stripe pay link / checkout --------

  /**
   * Admin-side: mint a public pay token + (optionally) create a Stripe Checkout session.
   * Returns the public pay link in either case; checkout_url is null when link_only=true.
   */
  async getInvoicePayLink(invoiceId: string, opts: { linkOnly?: boolean; successUrl?: string; cancelUrl?: string } = {}): Promise<{
    pay_link: string;
    pay_token: string;
    invoice_id: string;
    checkout_url: string | null;
    session_id: string | null;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-pay-invoice', {
      body: {
        invoice_id: invoiceId,
        link_only: opts.linkOnly === true,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
      },
    });
    if (error) throw await edgeError(error);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  },

  /**
   * Customer-self path: an authenticated user (the invoice's customer) creates a
   * Stripe Checkout session for an invoice they're allowed to read via RLS.
   * Returns the hosted Stripe URL — caller redirects to it.
   */
  async payInvoiceAsCustomer(invoiceId: string, opts: { successUrl: string; cancelUrl: string }): Promise<{
    ok: boolean;
    checkout_url?: string;
    error?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-pay-invoice', {
      body: {
        invoice_id: invoiceId,
        link_only: false,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
      },
    });
    if (error) throw await edgeError(error);
    return data as any;
  },

  /**
   * Public-side: redeem a pay_token → Stripe Checkout URL. Called from the /pay/:token page.
   * No auth required.
   */
  /** Admin "Send digest now" — emails the digest immediately to the configured recipients
   *  (or the override list). Used by the Settings tab's "Send test" button. */
  async sendDigestNow(opts: { workspaceId?: string; recipientsOverride?: string[] } = {}): Promise<{
    ok: boolean;
    recipients_attempted: number;
    recipients_delivered: number;
    errors: string[];
  }> {
    const { data, error } = await supabase.functions.invoke('finance-digest-aggregate', {
      body: { mode: 'now', workspace_id: opts.workspaceId, recipients_override: opts.recipientsOverride },
    });
    if (error) throw await edgeError(error);
    return data as any;
  },

  /** Returns the seeded 'Finance digest' flow row (if it exists) so the Settings
   *  panel can deep-link to the FlowsManagement editor for schedule changes. */
  async getDigestFlowId(): Promise<string | null> {
    const { data, error } = await supabase
      .from('flows')
      .select('id')
      .eq('name', 'Finance digest')
      .eq('trigger_type', 'scheduled')
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as any)?.id ?? null;
  },

  async resolvePayToken(
    payToken: string,
    opts: {
      successUrl?: string; cancelUrl?: string;
      /** Fetch the document + payable options only — creates no checkout session. */
      infoOnly?: boolean;
      /** Requested amount (deposit / part payment). Re-validated + clamped server-side. */
      amount?: number;
      /** Which provider to charge with. Defaults server-side to 'stripe'. */
      provider?: string;
      /** 'card' (hosted redirect) or 'bank_reference' (Viva RF code). Defaults to 'card'. */
      method?: 'card' | 'bank_reference';
    } = {},
  ): Promise<{
    ok: boolean;
    info?: boolean;
    checkout_url?: string;
    /** Providers the seller can actually charge with (info_only responses). */
    providers?: Array<{ slug: string; label: string; methods: Array<'card' | 'bank_reference'> }>;
    provider?: string;
    /** 'redirect' → follow checkout_url; 'bank_reference' → show rf_code. */
    payment_kind?: 'redirect' | 'bank_reference';
    rf_code?: string;
    order_code?: string;
    code?: string;
    invoice_id?: string;
    internal_number?: string;
    amount?: number;
    amount_due?: number;
    total?: number;
    partial?: boolean;
    status?: string;
    is_pre_invoice?: boolean;
    deposit_pct?: number | null;
    deposit_amount?: number | null;
    min_amount?: number;
    max_amount?: number;
    currency?: string;
    customer_display?: string;
    already_paid?: boolean;
    error?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('finance-pay-invoice', {
      body: {
        pay_token: payToken,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        ...(opts.infoOnly ? { info_only: true } : {}),
        ...(opts.amount != null ? { amount: opts.amount } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
        ...(opts.method ? { method: opts.method } : {}),
      },
    });
    if (error) throw await edgeError(error);
    return data as any;
  },

  /**
   * Resolve a provider order code back to the invoice's pay link.
   *
   * Viva takes the customer's return URL from the payment SOURCE configured in the
   * merchant's dashboard (it cannot be set per call) and sends them back with
   * `?t={transactionId}&s={orderCode}`. This maps that orderCode to the pay page.
   *
   * `orderCode` is int64 and overflows JS Number — it must stay a STRING the whole way.
   */
  async resolveProviderOrder(
    orderCode: string,
    provider = 'viva',
  ): Promise<{ ok: boolean; pay_token?: string; pay_link?: string; intent_status?: string; invoice_status?: string; error?: string }> {
    const { data, error } = await supabase.functions.invoke('finance-pay-invoice', {
      body: { order_code: String(orderCode), provider },
    });
    if (error) throw await edgeError(error);
    return data as any;
  },
};

// Single merged service surface. TS infers the union of both literals' types,
// so callers get v1 + v2 methods on one symbol.
export const financeService: typeof _financeServiceCore & typeof _financeServiceV2 =
  Object.assign(_financeServiceCore, _financeServiceV2);

// =============================================================================
// Formatters (shared)
// =============================================================================

// Canonical money formatter lives in `@/utils/decimal` (money is printed well outside finance).
// Re-exported here because most of the app imports it from this service.
export { formatMoney } from '@/utils/decimal';

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

export function ageBucketLabel(b: AgeBucket): string {
  switch (b) {
    case 'current': return 'Current';
    case '0-30': return '0–30 days';
    case '31-60': return '31–60 days';
    case '61-90': return '61–90 days';
    case '90+': return '90+ days';
    case 'paid': return 'Paid';
    case 'no_due_date': return 'No due date';
    default: return b;
  }
}

// =============================================================================
// myDATA VAT categories + money/VAT math (canonical — single source of truth)
// =============================================================================
// AADE standard VAT categories. cat↔percent pairs MUST match exactly or myDATA
// rejects the document — categories 4/5/6 are the reduced island rates and were
// previously omitted in some pickers (ServicesCard / the product fiscal card). Do NOT
// redefine this table anywhere else; import VAT_CATEGORIES from here.

export interface VatCategory {
  /** AADE category code, as a string (myDATA accepts "1".."8"). */
  code: string;
  /** Numeric VAT percentage applied for this category (0 for 7/8). */
  pct: number;
  /** Short label, e.g. "24%". */
  label: string;
  /** Longer label for settings/defaults pickers, e.g. "1 — 24%". */
  longLabel: string;
}

export const VAT_CATEGORIES: VatCategory[] = [
  { code: '1', pct: 24, label: '24%', longLabel: '1 — 24%' },
  { code: '2', pct: 13, label: '13%', longLabel: '2 — 13%' },
  { code: '3', pct: 6, label: '6%', longLabel: '3 — 6%' },
  { code: '4', pct: 17, label: '17% (reduced)', longLabel: '4 — 17% (island reduced)' },
  { code: '5', pct: 9, label: '9% (reduced)', longLabel: '5 — 9% (island reduced)' },
  { code: '6', pct: 4, label: '4% (super-reduced)', longLabel: '6 — 4% (island super-reduced)' },
  { code: '7', pct: 0, label: '0%', longLabel: '7 — 0%' },
  { code: '8', pct: 0, label: 'Without VAT', longLabel: '8 — Without VAT (exempt)' },
];

/** VAT percentage for an AADE category code; `fallback` when the code is unknown/blank. */
export function vatPctForCat(code: string | number | null | undefined, fallback = 0): number {
  if (code == null || code === '') return fallback;
  const c = VAT_CATEGORIES.find((v) => v.code === String(code));
  return c ? c.pct : fallback;
}

/** Codes 7 and 8 (and any 0% category) require a vatExemptionCategory on myDATA. */
export function vatCatRequiresExemption(code: string | number | null | undefined): boolean {
  return vatPctForCat(code, -1) === 0;
}

// round2 / extractNet now live in the pure, hermetically-tested @/modules/finance/lib/vatMath
// module (guarded by tests/unit/vatMath.test.ts). Re-exported here so the components that
// import them from this service keep working unchanged.
export { round2, extractNet, vatCategory };
