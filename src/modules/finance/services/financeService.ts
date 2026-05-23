// Sales/Finance module — single service surface.
//
// Owns everything finance-related: invoices, payments, allocations,
// purchase orders, supplier bills, credit notes, quote activities,
// and report aggregations (AR/AP aging, P&L, cash flow, follow-up queue).
//
// Heavy mutations go through Postgres SECURITY DEFINER RPCs so that:
//   - Sequential number generation stays race-free
//   - Status transitions are atomic
//   - The cost-snapshot rule from PR-A is honored end-to-end

import { supabase } from '@/integrations/supabase/client';

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
  amount_paid: number;
  amount_due: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_terms_days: number | null;
  oxygen_notice_id: string | null;
  oxygen_legal_number: string | null;
  notes: string | null;
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
}

export type PaymentDirection = 'in' | 'out';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'check' | 'other';

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
  reference: string | null;
  notes: string | null;
  created_at: string;
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
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface PurchaseOrder {
  id: string;
  workspace_id: string;
  po_number: string;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  total: number;
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string | null;
  description: string | null;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
  added_at: string;
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
  po_id: string | null;
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
  due_at: string | null;
  issued_at: string | null;
  status: string;
  age_bucket: AgeBucket;
  days_overdue: number;
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

export const financeService = {
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
      .select('*, payment:payments(*)')
      .eq('invoice_id', invoiceId);

    const payments: PaymentWithAllocation[] = [];
    if (allocs) {
      const byPayment = new Map<string, PaymentWithAllocation>();
      for (const a of allocs as Array<PaymentAllocation & { payment: Payment }>) {
        if (!a.payment) continue;
        const existing = byPayment.get(a.payment.id);
        if (existing) {
          existing.allocations.push({ ...a, payment: undefined } as unknown as PaymentAllocation);
        } else {
          byPayment.set(a.payment.id, {
            ...a.payment,
            allocations: [{ ...a, payment: undefined } as unknown as PaymentAllocation],
          });
        }
      }
      payments.push(...byPayment.values());
    }

    return { ...(invoice as Invoice), items: (items ?? []) as InvoiceItem[], payments };
  },

  async issueInvoiceFromQuote(
    quoteId: string,
    opts: { issueNow?: boolean; pushToOxygen?: boolean } = {},
  ): Promise<{ invoice_id: string; invoice: Invoice | null; oxygen: unknown | null }> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: {
        quote_id: quoteId,
        issue_now: opts.issueNow === true,
        push_to_oxygen: opts.pushToOxygen === true,
      },
    });
    if (error) throw error;
    return data as { invoice_id: string; invoice: Invoice | null; oxygen: unknown | null };
  },

  async markInvoiceIssued(invoiceId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_invoice_issued', { p_invoice_id: invoiceId });
    if (error) throw error;
  },

  async updateInvoice(invoiceId: string, patch: Partial<Invoice>): Promise<Invoice> {
    const allowed: Partial<Invoice> = {
      due_at: patch.due_at,
      payment_terms_days: patch.payment_terms_days ?? undefined,
      notes: patch.notes,
      oxygen_legal_number: patch.oxygen_legal_number,
      status: patch.status,
    };
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
    reference?: string | null;
    notes?: string | null;
    allocations: Array<{ target_id: string; target_type: 'invoice' | 'supplier_bill'; amount: number }>;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('record_payment_with_allocations', {
      p_workspace_id: input.workspaceId,
      p_direction: input.direction,
      p_amount: input.amount,
      p_currency: input.currency ?? 'EUR',
      p_method: input.method ?? null,
      p_paid_at: input.paidAt ?? new Date().toISOString(),
      p_counterparty_contact_id: input.counterpartyContactId ?? null,
      p_counterparty_company_id: input.counterpartyCompanyId ?? null,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_allocations: input.allocations,
    });
    if (error) throw error;
    return data as string;
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
      .select('*, allocations:payment_allocations(*)')
      .order('paid_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.direction) q = q.eq('direction', opts.direction);
    if (opts.counterpartyContactId) q = q.eq('counterparty_contact_id', opts.counterpartyContactId);
    if (opts.counterpartyCompanyId) q = q.eq('counterparty_company_id', opts.counterpartyCompanyId);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PaymentWithAllocation[];
  },

  async deletePayment(paymentId: string): Promise<void> {
    // Allocations cascade automatically; status-keeper trigger fires on each delete.
    const { error } = await supabase.from('payments').delete().eq('id', paymentId);
    if (error) throw error;
  },

  // -------- Purchase orders --------

  async createPurchaseOrder(input: {
    workspaceId: string;
    supplierCompanyId?: string;
    supplierContactId?: string;
    currency?: string;
    expectedAt?: string;
    notes?: string;
    items: Array<{
      productId?: string;
      description: string;
      sku?: string;
      quantity: number;
      unit_cost: number;
    }>;
  }): Promise<PurchaseOrder> {
    const { data: nextNum, error: numErr } = await supabase.rpc('next_po_number', {
      p_workspace_id: input.workspaceId,
    });
    if (numErr) throw numErr;

    const subtotal = input.items.reduce((acc, it) => acc + it.quantity * it.unit_cost, 0);

    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        workspace_id: input.workspaceId,
        po_number: nextNum,
        supplier_company_id: input.supplierCompanyId ?? null,
        supplier_contact_id: input.supplierContactId ?? null,
        status: 'draft',
        currency: input.currency ?? 'EUR',
        subtotal_net: subtotal,
        vat_amount: 0,
        total: subtotal,
        expected_at: input.expectedAt ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (poErr) throw poErr;

    if (input.items.length > 0) {
      const { error: itemsErr } = await supabase.from('purchase_order_items').insert(
        input.items.map((it) => ({
          po_id: (po as PurchaseOrder).id,
          product_id: it.productId ?? null,
          description: it.description,
          sku: it.sku ?? null,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
        })),
      );
      if (itemsErr) throw itemsErr;
    }

    return po as PurchaseOrder;
  },

  async listPurchaseOrders(opts: { workspaceId?: string; supplierCompanyId?: string; status?: PurchaseOrderStatus[] } = {}): Promise<PurchaseOrder[]> {
    let q = supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.supplierCompanyId) q = q.eq('supplier_company_id', opts.supplierCompanyId);
    if (opts.status?.length) q = q.in('status', opts.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PurchaseOrder[];
  },

  async getPurchaseOrder(poId: string): Promise<PurchaseOrder & { items: PurchaseOrderItem[] }> {
    const { data: po, error } = await supabase.from('purchase_orders').select('*').eq('id', poId).single();
    if (error) throw error;
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('po_id', poId)
      .order('added_at', { ascending: true });
    return { ...(po as PurchaseOrder), items: (items ?? []) as PurchaseOrderItem[] };
  },

  async updatePurchaseOrderStatus(poId: string, status: PurchaseOrderStatus): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'ordered') patch.ordered_at = new Date().toISOString();
    if (status === 'received') patch.received_at = new Date().toISOString();
    const { error } = await supabase.from('purchase_orders').update(patch).eq('id', poId);
    if (error) throw error;
  },

  // -------- Supplier bills --------

  async createSupplierBill(input: {
    workspaceId: string;
    supplierBillNumber?: string;
    supplierCompanyId?: string;
    supplierContactId?: string;
    poId?: string;
    currency?: string;
    subtotalNet: number;
    vatAmount: number;
    total: number;
    issuedAt?: string;
    dueAt?: string;
    notes?: string;
  }): Promise<SupplierBill> {
    const { data, error } = await supabase
      .from('supplier_bills')
      .insert({
        workspace_id: input.workspaceId,
        supplier_bill_number: input.supplierBillNumber ?? null,
        supplier_company_id: input.supplierCompanyId ?? null,
        supplier_contact_id: input.supplierContactId ?? null,
        po_id: input.poId ?? null,
        currency: input.currency ?? 'EUR',
        subtotal_net: input.subtotalNet,
        vat_amount: input.vatAmount,
        total: input.total,
        issued_at: input.issuedAt ?? null,
        due_at: input.dueAt ?? null,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as SupplierBill;
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

  async createCreditNote(input: {
    workspaceId: string;
    invoiceId: string;
    amount: number;
    currency?: string;
    reason: string;
  }): Promise<CreditNote> {
    const { data: nextNum, error: numErr } = await supabase.rpc('next_credit_note_number', {
      p_workspace_id: input.workspaceId,
    });
    if (numErr) throw numErr;

    const { data: cn, error: insErr } = await supabase
      .from('credit_notes')
      .insert({
        workspace_id: input.workspaceId,
        credit_note_number: nextNum,
        invoice_id: input.invoiceId,
        amount: input.amount,
        currency: input.currency ?? 'EUR',
        reason: input.reason,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    // Flip invoice to credit_noted if the credit note matches the invoice total
    const { data: invSnap } = await supabase
      .from('invoices')
      .select('total, amount_paid, currency')
      .eq('id', input.invoiceId)
      .single();
    if (invSnap && Number(input.amount) >= Number((invSnap as any).total)) {
      await supabase
        .from('invoices')
        .update({ status: 'credit_noted' })
        .eq('id', input.invoiceId);
    }

    return cn as CreditNote;
  },

  async listCreditNotes(opts: { workspaceId?: string; invoiceId?: string } = {}): Promise<CreditNote[]> {
    let q = supabase.from('credit_notes').select('*').order('issued_at', { ascending: false });
    if (opts.workspaceId) q = q.eq('workspace_id', opts.workspaceId);
    if (opts.invoiceId) q = q.eq('invoice_id', opts.invoiceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as CreditNote[];
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
// Formatters (shared)
// =============================================================================

export function formatMoney(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

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
