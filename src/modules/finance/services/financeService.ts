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
    /** Payment currency → workspace base currency, at paid_at. Defaults to 1. */
    fxRateToBase?: number;
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
    });
    if (error) throw error;
    return data as string;
  },

  /** Customer open balance: Σ open-invoice amount_due − Σ unallocated inbound payments. */
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
    amount: number;          // gross (net + VAT)
    currency?: string;
    reason: string;
    correlated?: boolean;    // 5.1 (correlated, default) vs 5.2
    submitFiscal?: boolean;
  }): Promise<{ credit_note_id: string }> {
    const { data: inv } = await supabase
      .from('invoices')
      .select('vat_rate')
      .eq('id', input.invoiceId)
      .single();
    const rate = Number((inv as any)?.vat_rate ?? 24);
    const net = Math.round((input.amount / (1 + rate / 100)) * 100) / 100;
    const vat = Math.round((input.amount - net) * 100) / 100;
    const vatCat = rate >= 24 ? 1 : rate >= 13 ? 2 : rate >= 6 ? 3 : rate > 0 ? 4 : 7;

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

    if (input.submitFiscal) {
      // Best-effort transmit; the note already exists + nets the invoice regardless.
      try { await this.submitCreditNoteFiscal(cnId as string); } catch { /* surfaced via list */ }
    }
    return { credit_note_id: cnId as string };
  },

  /** Transmit an existing credit note to the workspace's legal connector (myDATA 5.1). */
  async submitCreditNoteFiscal(creditNoteId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { credit_note_id: creditNoteId, submit_fiscal: true },
    });
    if (error) throw error;
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
  /** #176 blanket sell uplift on catalog products this workspace resells. */
  default_markup_pct: number;
  digest_enabled: boolean;
  digest_frequency: 'daily' | 'weekly' | 'monthly';
  digest_day_of_week: number | null;
  digest_hour_utc: number;
  digest_recipients: string[];
  digest_last_sent_at: string | null;
  updated_at: string;
}

export interface SalesPerDayRow { period: string; invoice_count: number; revenue_net: number; gross_margin: number }
export interface SalesPerCustomerRow { party_type: 'company'|'contact'; party_id: string; display_name: string; invoice_count: number; revenue_net: number; gross_margin: number }
export interface SalesPerProductRow { product_id: string | null; product_name: string; sku: string | null; total_quantity: number; revenue_net: number; gross_margin: number }
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

  async getPartyDetail(opts: { workspaceId: string; partyType: 'company'|'contact'; partyId: string }): Promise<{
    party: PartyRow | null;
    invoices: Invoice[];
    bills: SupplierBill[];
    payments: Payment[];
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

    const paymentsP = opts.partyType === 'company'
      ? supabase.from('payments').select('*').eq('counterparty_company_id', opts.partyId).order('paid_at', { ascending: false })
      : supabase.from('payments').select('*').eq('counterparty_contact_id', opts.partyId).order('paid_at', { ascending: false });

    const [party, invs, bills, payments] = await Promise.all([partyP, invoicesP, billsP, paymentsP]);
    if (party.error) throw party.error;
    if (invs.error) throw invs.error;
    if (bills.error) throw bills.error;
    if (payments.error) throw payments.error;
    return {
      party: (party.data ?? null) as PartyRow | null,
      invoices: (invs.data ?? []) as Invoice[],
      bills: (bills.data ?? []) as SupplierBill[],
      payments: (payments.data ?? []) as Payment[],
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
  }): Promise<{ ok: boolean; email_sent_to: string | null; pdf_url: string | null; lines: number; total_outstanding: number; error?: string }> {
    const { data, error } = await supabase.functions.invoke('finance-send-statement', { body: input });
    if (error) throw error;
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
    if (error) throw error;
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
    if (error) throw error;
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
    if (error) throw error;
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

  async resolvePayToken(payToken: string, opts: { successUrl?: string; cancelUrl?: string } = {}): Promise<{
    ok: boolean;
    checkout_url?: string;
    invoice_id?: string;
    internal_number?: string;
    amount?: number;
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
      },
    });
    if (error) throw error;
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
