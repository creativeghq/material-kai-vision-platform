import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';

export type OrderType = 'sales' | 'purchase';
export type OrderStatus = 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Pre-order', confirmed: 'Confirmed', partially_fulfilled: 'Partially delivered',
  fulfilled: 'Completed', cancelled: 'Cancelled',
};
export const ORDER_PAYMENT_LABEL: Record<OrderPaymentStatus, string> = {
  unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid',
};

export interface Order {
  id: string;
  workspace_id: string;
  order_type: OrderType;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  project_id: string | null;
  source_quote_id: string | null;
  order_number: string | null;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  currency: string;
  subtotal_net: number;
  vat_amount: number;
  total: number;
  /** Order-level discount the operator entered: 'percent' (a %) or 'amount' (flat cash off the net). */
  discount_type: 'percent' | 'amount' | null;
  discount_value: number;
  notes: string | null;
  /** Finance category (income for sales, expense for purchase). Carried onto the invoice/bill. */
  category_id: string | null;
  /** When we expect this order to be paid — drives AR/AP aging while it's not yet invoiced. */
  expected_payment_date: string | null;
  /** Purchase-order 3-way match verdict (denormalized; null for sales orders). */
  three_way_match_status: ThreeWayMatchStatus | null;
  created_at: string;
  updated_at: string;
}

export type ThreeWayMatchStatus =
  | 'no_lines' | 'awaiting_receipt' | 'awaiting_bill' | 'matched' | 'variance';

export interface ThreeWayMatch {
  order_id: string;
  order_number: string | null;
  order_type: OrderType;
  currency: string;
  po_net: number;
  ordered_qty: number;
  received_qty: number;
  bill_net: number;
  bill_count: number;
  tolerance: number;
  match_status: ThreeWayMatchStatus;
  variances: Array<
    | { type: 'amount'; po_net: number; bill_net: number; delta: number }
    | { type: 'quantity'; ordered: number; received: number; delta: number }
  >;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;   // snapshot cost/unit (margin before invoicing)
  supplier_company_id: string | null;  // who supplies this line (what we owe)
  measurement_unit_code: string | null;  // unit of measure (item, m2, kg…)
  vat_percent?: number | null;
  vat_category?: number | null;
  net_value: number;
  vat_amount: number;
  line_total: number;
  /** Effective per-line discount % (from the order-level discount, allocated proportionally). */
  discount_pct: number;
  quantity_delivered: number;
  update_warehouse: boolean;
  sort_order: number;
}

export interface OrderListRow extends Order {
  party_name: string | null;
}

export interface NewOrderItem {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;  // cost/unit snapshot (from catalog or manual)
  supplier_company_id?: string | null;  // who supplies this line
  measurement_unit_code?: string | null; // unit of measure (item, m2, kg…)
  vat_percent?: number;       // per-line VAT %
  vat_category?: number;      // myDATA VAT category code (1=24%, …)
  update_warehouse?: boolean;
}

/** Customer-aware pricing for an order line (from the pricing resolver / catalog cost). */
export interface LinePricing {
  unit_price: number | null;
  unit_cost: number | null;
  discount_pct: number | null;
  measurement_unit_code: string | null;
  available: number | null;   // qty on hand across the workspace's warehouses (null = not stocked)
  supplier_company_id: string | null;  // product's default supplier, to seed the line
}

export type OrderDiscountType = 'percent' | 'amount';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Apply an order-level discount ('percent' or a flat 'amount') across the lines. The SAME effective
 * % is applied to every line (a flat amount → an equivalent %), so it allocates proportionally by
 * net and VAT stays exact per line. Line `unit_price` is kept at the ORIGINAL entered price so
 * re-editing an order never double-applies the discount; the discount lives in each line's
 * (post-discount) net/vat and its `discount_pct`, plus the order's `discount_type`/`discount_value`.
 */
function computeOrderLines(
  items: NewOrderItem[],
  discount?: { type: OrderDiscountType | null; value: number },
): {
  lines: Array<{ it: NewOrderItem; net: number; vat: number; pct: number; discountPct: number }>;
  subtotal: number; vatTotal: number; total: number; effDiscountPct: number;
} {
  const rawSubtotal = r2(items.reduce((a, it) => a + (it.quantity || 0) * (it.unit_price || 0), 0));
  let effDiscountPct = 0;
  if (discount?.type === 'percent') {
    effDiscountPct = Math.min(100, Math.max(0, Number(discount.value) || 0));
  } else if (discount?.type === 'amount' && rawSubtotal > 0) {
    effDiscountPct = Math.min(100, Math.max(0, ((Number(discount.value) || 0) / rawSubtotal) * 100));
  }
  const factor = 1 - effDiscountPct / 100;
  const lines = items.map((it) => {
    const net = r2((it.quantity || 0) * (it.unit_price || 0) * factor);
    const pct = it.vat_percent ?? 0;
    const vat = r2(net * pct / 100);
    return { it, net, vat, pct, discountPct: Math.round(effDiscountPct * 1e6) / 1e6 };
  });
  const subtotal = r2(lines.reduce((a, l) => a + l.net, 0));
  const vatTotal = r2(lines.reduce((a, l) => a + l.vat, 0));
  return { lines, subtotal, vatTotal, total: r2(subtotal + vatTotal), effDiscountPct };
}

export interface OrderListOptions {
  workspaceId: string;
  orderType?: OrderType;
  status?: OrderStatus;
  companyId?: string;
  contactId?: string;
  projectId?: string;
  /** Page size. Defaults to 500 — the historical cap, so existing callers are unchanged. */
  limit?: number;
  /** Row offset for paging. Defaults to 0. */
  offset?: number;
}

export interface OrderSearchOptions extends OrderListOptions {
  /** Free text — matched server-side against the order number OR the joined party name. */
  search?: string;
  /** Inclusive created_at window, ISO dates. */
  createdFrom?: string;
  createdTo?: string;
  /** Inclusive `total` bounds. Pair with `currency` — a range across mixed currencies is noise. */
  totalMin?: number;
  totalMax?: number;
  currency?: string;
  /** Collections segment: 'unpaid' | 'partial' | 'paid'. Reads orders.payment_status. */
  paymentStatus?: OrderPaymentStatus;
}

export const ordersService = {
  /**
   * Server-paged orders list: filters, free-text search AND the party-name join all run in SQL
   * (`search_orders` RPC), so the client never has to hold the whole workspace to filter it.
   * Prefer this for any screen that pages; `listPage` stays for the callers that need every row.
   */
  async search(opts: OrderSearchOptions): Promise<{ rows: OrderListRow[]; count: number }> {
    const { data, error } = await supabase.rpc('search_orders', {
      p_workspace_id: opts.workspaceId,
      p_order_type: opts.orderType ?? null,
      p_status: opts.status ?? null,
      p_company_id: opts.companyId ?? null,
      p_contact_id: opts.contactId ?? null,
      p_project_id: opts.projectId ?? null,
      p_search: opts.search?.trim() || null,
      p_limit: opts.limit ?? 20,
      p_offset: opts.offset ?? 0,
      p_created_from: opts.createdFrom ?? null,
      // End-of-day so a timestamptz column doesn't drop the final day the operator picked.
      p_created_to: opts.createdTo ? `${opts.createdTo}T23:59:59.999` : null,
      p_total_min: opts.totalMin ?? null,
      p_total_max: opts.totalMax ?? null,
      p_currency: opts.currency ?? null,
      p_payment_status: opts.paymentStatus ?? null,
    });
    if (error) throw error;
    const raw = (data ?? []) as Array<{ order_row: Order; party_name: string | null; total_count: number }>;
    return {
      // The RPC hands back the whole orders row as a composite — flatten it into the same
      // OrderListRow shape `listPage` produces so consumers are identical.
      rows: raw.map((r) => ({ ...r.order_row, party_name: r.party_name })),
      // total_count is the count of ALL matching rows, repeated on every row; no rows = no matches.
      count: raw.length ? Number(raw[0].total_count) : 0,
    };
  },

  /**
   * One page of orders PLUS the server's exact total. Retained for the callers that need a plain
   * filtered list (`listUninvoicedOutstanding`, CustomerFinanceTabs, FinancePage). The Orders panel
   * uses `search()` instead — it needs to filter on the party name, which isn't a column here.
   */
  async listPage(opts: OrderListOptions): Promise<{ rows: OrderListRow[]; count: number }> {
    const limit = opts.limit ?? 500;
    const offset = opts.offset ?? 0;
    let q = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('workspace_id', opts.workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.orderType) q = q.eq('order_type', opts.orderType);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    if (opts.companyId) q = q.or(`customer_company_id.eq.${opts.companyId},supplier_company_id.eq.${opts.companyId}`);
    if (opts.contactId) q = q.or(`customer_contact_id.eq.${opts.contactId},supplier_contact_id.eq.${opts.contactId}`);
    const { data, error, count } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Order[];

    // Resolve party display names in batch.
    const companyIds = [...new Set(rows.flatMap((r) => [r.customer_company_id, r.supplier_company_id]).filter(Boolean))] as string[];
    const contactIds = [...new Set(rows.flatMap((r) => [r.customer_contact_id, r.supplier_contact_id]).filter(Boolean))] as string[];
    const [comps, conts] = await Promise.all([
      companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const cmap = new Map<string, string>((comps.data ?? []).map((c) => [c.id, c.name] as [string, string]));
    const ctmap = new Map<string, string>((conts.data ?? []).map((c) => [c.id, c.name] as [string, string]));
    return {
      rows: rows.map((r) => ({
        ...r,
        party_name:
          cmap.get(r.customer_company_id ?? '') ?? cmap.get(r.supplier_company_id ?? '') ??
          ctmap.get(r.customer_contact_id ?? '') ?? ctmap.get(r.supplier_contact_id ?? '') ?? null,
      })),
      count: count ?? rows.length,
    };
  },

  /** Rows only — the historical shape, kept so existing callers don't change. */
  async list(opts: OrderListOptions): Promise<OrderListRow[]> {
    return (await this.listPage(opts)).rows;
  },

  /**
   * Confirmed orders that carry real money owed but are NOT yet an invoice/supplier bill —
   * i.e. un-invoiced receivables (sales) / payables (purchase). Single source of truth used by
   * BOTH the CRM party Account tab and the global Finance AR/AP tabs so the two stay identical.
   *
   * An order is included when: status is not draft/cancelled, it has no invoice AND no supplier
   * bill yet, and its outstanding (total − settled payments) is > 0. Once invoiced, the invoice/
   * bill becomes the AR/AP row and the order drops out here — no double counting.
   */
  async listUninvoicedOutstanding(opts: {
    workspaceId: string;
    companyId?: string;
    contactId?: string;
  }): Promise<Array<{ id: string; order_number: string | null; order_type: OrderType; party_name: string | null; total: number; settled: number; outstanding: number; currency: string; status: OrderStatus; created_at: string; category_id: string | null; category_name: string | null; expected_payment_date: string | null }>> {
    const list = await this.list({ workspaceId: opts.workspaceId, companyId: opts.companyId, contactId: opts.contactId });
    // Candidates = every non-cancelled order. We include a draft/pre-order only once it has moved
    // real cash (a deposit received / paid) — empty drafts stay hidden, but a pre-order with a
    // deposit is real money and must surface in Receivables/Payables.
    const candidates = list.filter((o) => o.status !== 'cancelled');
    if (candidates.length === 0) return [];
    const ids = candidates.map((o) => o.id);

    // Batch the finance lookups (3 queries total, not 3 per order). We only need presence of an
    // invoice/bill and the settled amount — not the full getOrderFinance payload.
    // Settlement now reads the allocation ledger (#280): payment_allocations rows targeting the
    // order, joined to their payment's direction. `payments.order_id` is provenance only.
    const [inv, bills, allocs] = await Promise.all([
      supabase.from('invoices').select('order_id').in('order_id', ids),
      supabase.from('supplier_bills').select('order_id').in('order_id', ids),
      supabase.from('payment_allocations').select('order_id, amount, payment:payments(direction)').in('order_id', ids),
    ]);
    const invoiced = new Set<string>((inv.data ?? []).map((r: any) => r.order_id));
    (bills.data ?? []).forEach((r: any) => invoiced.add(r.order_id));

    // Resolve category display names in one batch (orders now carry a finance category).
    const catIds = [...new Set(candidates.map((o) => o.category_id).filter(Boolean))] as string[];
    const catNames = new Map<string, string>();
    if (catIds.length) {
      const { data: cats } = await supabase.from('finance_categories').select('id, name').in('id', catIds);
      for (const c of (cats ?? []) as Array<{ id: string; name: string }>) catNames.set(c.id, c.name);
    }
    const settledIn = new Map<string, number>();
    const settledOut = new Map<string, number>();
    for (const a of (allocs.data ?? []) as Array<{ order_id: string; amount: number; payment: { direction: 'in' | 'out' } | { direction: 'in' | 'out' }[] | null }>) {
      const dir = (Array.isArray(a.payment) ? a.payment[0]?.direction : a.payment?.direction);
      if (!dir) continue;
      const map = dir === 'in' ? settledIn : settledOut;
      map.set(a.order_id, (map.get(a.order_id) ?? 0) + Number(a.amount));
    }
    const hasCash = (id: string) => settledIn.has(id) || settledOut.has(id);

    return candidates
      .filter((o) => !invoiced.has(o.id))
      // Confirmed+ orders always; drafts/pre-orders only once cash has moved on them.
      .filter((o) => o.status !== 'draft' || hasCash(o.id))
      .map((o) => {
        const settled = (o.order_type === 'sales' ? settledIn : settledOut).get(o.id) ?? 0;
        return {
          id: o.id,
          order_number: o.order_number,
          order_type: o.order_type,
          party_name: o.party_name,
          total: Number(o.total),
          settled,
          outstanding: Math.round((Number(o.total) - settled) * 100) / 100,
          currency: o.currency,
          status: o.status,
          created_at: o.created_at,
          category_id: o.category_id ?? null,
          category_name: o.category_id ? (catNames.get(o.category_id) ?? null) : null,
          expected_payment_date: o.expected_payment_date ?? null,
        };
      })
      .filter((r) => r.outstanding > 0.005);
  },

  /**
   * Settled-so-far per order for a set of order ids, from the allocation ledger (money actually
   * received on sales / paid on purchase). Lets a list show "outstanding = total − settled"
   * without an N+1 getOrderFinance per row. One query, keyed by order id.
   */
  async settledByOrder(orderIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (orderIds.length === 0) return out;
    // Model B (#280 corrected): an order settles on allocations against IT directly OR against the
    // invoices/bills that belong to it. Paying an order's invoice is an invoice-targeted allocation
    // (order_id NULL by the one-target constraint), so a plain `.eq('order_id', …)` missed it and
    // fully-paid orders read as unpaid. `get_order_settlements` applies the join in SQL so this
    // agrees with recompute_order_payment_status and getOrderFinance.
    const { data } = await supabase.rpc('get_order_settlements', { p_order_ids: orderIds });
    // A sales order settles on money IN; a purchase order on money OUT. We don't know each order's
    // type here, so return the net (in − out) and let the caller use its sign.
    for (const r of (data ?? []) as Array<{ order_id: string; settled_in: number; settled_out: number }>) {
      out.set(r.order_id, Number(r.settled_in) - Number(r.settled_out));
    }
    return out;
  },

  async get(id: string): Promise<{ order: Order; items: OrderItem[] }> {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error) throw error;
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', id).order('sort_order', { ascending: true });
    return { order: order as Order, items: (items ?? []) as OrderItem[] };
  },

  /** 3-way match for a purchase order: PO net × goods received × supplier-bill net. */
  async getThreeWayMatch(orderId: string): Promise<ThreeWayMatch | null> {
    const { data, error } = await supabase.rpc('compute_three_way_match', { p_order_id: orderId });
    if (error) throw error;
    const d = data as unknown as ThreeWayMatch & { error?: string };
    if (!d || d.error) return null;
    return d;
  },

  /** Purchase orders for a supplier that a bill can be matched against. Capped at 500 (was 50 —
   *  a long-standing supplier's older POs fell off the picker entirely). */
  async listPurchaseOrdersForSupplier(workspaceId: string, supplierCompanyId: string): Promise<Array<{ id: string; order_number: string | null; total: number; three_way_match_status: string | null }>> {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total, three_way_match_status')
      .eq('workspace_id', workspaceId)
      .eq('order_type', 'purchase')
      .eq('supplier_company_id', supplierCompanyId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; order_number: string | null; total: number; three_way_match_status: string | null }>;
  },

  async create(input: {
    workspaceId: string;
    orderType: OrderType;
    status?: OrderStatus;
    customerCompanyId?: string | null;
    customerContactId?: string | null;
    supplierCompanyId?: string | null;
    supplierContactId?: string | null;
    projectId?: string | null;
    currency?: string;
    notes?: string | null;
    categoryId?: string | null;
    expectedPaymentDate?: string | null;
    /** Order-level discount off the net: a % or a flat cash amount. */
    discountType?: OrderDiscountType | null;
    discountValue?: number | null;
    items: NewOrderItem[];
  }): Promise<string> {
    const disc = { type: input.discountType ?? null, value: Number(input.discountValue) || 0 };
    const { lines, subtotal, vatTotal, total } = computeOrderLines(input.items, disc);
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        workspace_id: input.workspaceId,
        order_type: input.orderType,
        status: input.status ?? 'draft',
        customer_company_id: input.customerCompanyId ?? null,
        customer_contact_id: input.customerContactId ?? null,
        supplier_company_id: input.supplierCompanyId ?? null,
        supplier_contact_id: input.supplierContactId ?? null,
        project_id: input.projectId ?? null,
        currency: input.currency ?? 'EUR',
        subtotal_net: subtotal,
        vat_amount: vatTotal,
        total,
        discount_type: disc.value > 0 && disc.type ? disc.type : null,
        discount_value: disc.value > 0 && disc.type ? disc.value : 0,
        notes: input.notes ?? null,
        category_id: input.categoryId ?? null,
        expected_payment_date: input.expectedPaymentDate ?? null,
      })
      .select('id, order_number')
      .single();
    if (error) throw error;
    const orderId = order.id as string;
    if (lines.length) {
      const itemRows = lines.map((l, i) => ({
        order_id: orderId,
        workspace_id: input.workspaceId,
        product_id: l.it.product_id ?? null,
        description: l.it.description,
        quantity: l.it.quantity,
        unit_price: l.it.unit_price,
        unit_cost: l.it.unit_cost ?? null,
        supplier_company_id: l.it.supplier_company_id ?? null,
        measurement_unit_code: l.it.measurement_unit_code ?? null,
        vat_percent: l.pct,
        vat_category: l.it.vat_category ?? null,
        net_value: l.net,
        vat_amount: l.vat,
        line_total: l.net,      // net per line (post-discount; gross sits on the order total)
        discount_pct: l.discountPct,
        update_warehouse: l.it.update_warehouse ?? true,
        sort_order: i,
      }));
      const { error: itErr } = await supabase.from('order_items').insert(itemRows);
      if (itErr) throw itErr;
    }
    // Flows — order lifecycle (fire-and-forget).
    flowEventService.emitToWorkspaceRoles(input.workspaceId, ['owner', 'admin'], 'order_created',
      (recipientUserId) => ({
        user_id: recipientUserId,
        type: 'order_created',
        workspace_id: input.workspaceId,
        order_id: orderId,
        order_number: (order as any).order_number ?? null,
        order_type: input.orderType,
        status: input.status ?? 'draft',
        total,
        currency: input.currency ?? 'EUR',
        customer_company_id: input.customerCompanyId ?? null,
        supplier_company_id: input.supplierCompanyId ?? null,
        project_id: input.projectId ?? null,
        title: `${input.orderType === 'purchase' ? 'Purchase' : 'Sales'} order created${(order as any).order_number ? ` #${(order as any).order_number}` : ''}`,
        body: `A ${input.orderType} order was created (${total.toFixed(2)} ${input.currency ?? 'EUR'}).`,
        action_url: '/finance?tab=orders',
      }));
    return orderId;
  },

  async getOrderFinance(orderId: string): Promise<{
    invoices: Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    supplierBills: Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    payments: Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; method: string | null; reference: string | null; notes: string | null; bank_account_id: string | null; counterparty_company_id: string | null; counterparty_contact_id: string | null; counterparty_bank_account_id: string | null; counterparty_name: string | null }>;
    received: number;
    paid_out: number;
    profit: number;
    // Canonical settlement per #280: Σ payment_allocations for this order, by payment direction.
    // This is what `recompute_order_payment_status` uses — and unlike `received`/`paid_out` (which
    // only see cash whose `payments.order_id` = this order) it also counts credit re-homed onto the
    // order from an on-account payment (whose `order_id` is NULL). Drive "outstanding" off this.
    settled_in: number;
    settled_out: number;
    // Money re-homed onto this order from a payment that is NOT tagged to it (an on-account credit
    // applied here). Shown read-only in the Payments list so a credit-settled order isn't blank.
    creditApplied: Array<{ allocation_id: string; payment_id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; counterparty_name: string | null }>;
  }> {
    const [inv, bills, pay, alloc, settlement] = await Promise.all([
      supabase.from('invoices').select('id, internal_number, status, total, amount_due, currency').eq('order_id', orderId),
      supabase.from('supplier_bills').select('id, supplier_bill_number, status, total, amount_due, currency').eq('order_id', orderId),
      supabase.from('payments').select('id, direction, amount, currency, paid_at, method, reference, notes, bank_account_id, counterparty_company_id, counterparty_contact_id, counterparty_bank_account_id, counterparty_name').eq('order_id', orderId).order('paid_at', { ascending: false }),
      supabase.from('payment_allocations').select('id, amount, payment_id, payments!inner(direction, order_id, currency, paid_at, counterparty_company_id, counterparty_contact_id)').eq('order_id', orderId),
      // Canonical settlement (model B): allocations against this order OR its invoices/bills.
      supabase.rpc('get_order_settlements', { p_order_ids: [orderId] }),
    ]);
    const rawPayments = (pay.data ?? []) as Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; method: string | null; reference: string | null; notes: string | null; bank_account_id: string | null; counterparty_company_id: string | null; counterparty_contact_id: string | null; counterparty_bank_account_id: string | null; counterparty_name: string | null }>;
    type AllocRow = { id: string; amount: number; payment_id: string; payments: { direction: 'in' | 'out'; order_id: string | null; currency: string; paid_at: string; counterparty_company_id: string | null; counterparty_contact_id: string | null } | null };
    const allocRows = (alloc.data ?? []) as unknown as AllocRow[];
    // Credit rows = allocations whose source payment is tagged to a DIFFERENT order (or none) — i.e.
    // on-account money re-homed here. Order-tagged payments are already in `rawPayments`, so exclude
    // them to avoid double-listing.
    const creditAllocs = allocRows.filter((a) => a.payments && a.payments.order_id !== orderId);
    // Resolve the counterparty (who the cash went to / came from) so the UI can show it.
    // Money-in → the order's customer; money-out → the supplier paid. Both land in counterparty_company_id;
    // a bare contact customer/supplier lands in counterparty_contact_id instead.
    const companyIds = [...rawPayments.map((p) => p.counterparty_company_id), ...creditAllocs.map((a) => a.payments!.counterparty_company_id)].filter(Boolean) as string[];
    const contactIds = [...rawPayments.map((p) => p.counterparty_contact_id), ...creditAllocs.map((a) => a.payments!.counterparty_contact_id)].filter(Boolean) as string[];
    const [companyNames, contactNames] = await Promise.all([
      this.getCompanyNames(companyIds).catch(() => new Map<string, string>()),
      this.getContactNames(contactIds).catch(() => new Map<string, string>()),
    ]);
    const nameFor = (companyId: string | null, contactId: string | null) =>
      (companyId ? companyNames.get(companyId) : null) ?? (contactId ? contactNames.get(contactId) : null) ?? null;
    const payments = rawPayments.map((p) => ({
      ...p,
      // CRM name if the payee is a saved company/contact, else the free-text ad-hoc payee name.
      counterparty_name: nameFor(p.counterparty_company_id, p.counterparty_contact_id) ?? p.counterparty_name,
    }));
    const creditApplied = creditAllocs.map((a) => ({
      allocation_id: a.id, payment_id: a.payment_id, direction: a.payments!.direction, amount: Number(a.amount),
      currency: a.payments!.currency, paid_at: a.payments!.paid_at,
      counterparty_name: nameFor(a.payments!.counterparty_company_id, a.payments!.counterparty_contact_id),
    }));
    // "Received" / "Paid to suppliers" = cash actually on this order: payments TAGGED to it (rawPayments)
    // PLUS credit re-homed onto it from an on-account payment (creditApplied). NOT the allocation ledger
    // alone — a direct supplier payment (money-out with no supplier bill) has no allocation, and a bare
    // pre-payment (money-in with no invoice) likewise; both are real cash on the order and must count.
    const received = rawPayments.filter((p) => p.direction === 'in').reduce((s, p) => s + Number(p.amount), 0)
      + creditApplied.filter((c) => c.direction === 'in').reduce((s, c) => s + c.amount, 0);
    const paid_out = rawPayments.filter((p) => p.direction === 'out').reduce((s, p) => s + Number(p.amount), 0)
      + creditApplied.filter((c) => c.direction === 'out').reduce((s, c) => s + c.amount, 0);
    // Canonical settlement (model B, #280 corrected) — drives `outstanding` / payment_status
    // agreement. Counts allocations against this order OR its invoices/bills, so paying the order's
    // invoice settles the order. Order-direct-only summing (the old code) missed invoice payments.
    const settleRow = ((settlement.data ?? []) as Array<{ settled_in: number; settled_out: number }>)[0];
    const settled_in = Number(settleRow?.settled_in ?? 0);
    const settled_out = Number(settleRow?.settled_out ?? 0);
    return {
      invoices: (inv.data ?? []) as Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      supplierBills: (bills.data ?? []) as Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      payments, received, paid_out, profit: received - paid_out, settled_in, settled_out, creditApplied,
    };
  },

  /**
   * Record real cash on an order through the canonical `record_payment_fx` path (NOT a bare
   * payments insert). This gets us, for free: FX plumbing, the payment receipt PDF, the
   * "payment received" flow notification, and — the point of this method — automatic settlement
   * of the order's open invoice (money in) or supplier bill (money out) by allocating the cash
   * to it greedily, oldest-first. Any remainder stays as unallocated cash, still linked to the
   * order via `order_id` so it shows in the order's Received/Paid totals.
   */
  async recordOrderPayment(input: {
    order: { id: string; workspace_id: string; currency: string; customer_company_id: string | null; customer_contact_id: string | null };
    direction: 'in' | 'out';
    amount: number;
    reference: string;
    method: string | null;
    bankAccountId: string;
    /** money-out: the supplier we're paying (counterparty). */
    supplierCompanyId?: string | null;
    /** money-out: a free-text payee name when the supplier is NOT a saved CRM company (one-off). */
    supplierName?: string | null;
    /** The counterparty's own bank (crm_bank_accounts) the money moved to/from, on a Bank Payment. */
    counterpartyBankAccountId?: string | null;
    /** Open targets to settle: invoices for money-in, supplier_bills for money-out. */
    targets?: Array<{ id: string; amount_due: number; type: 'invoice' | 'supplier_bill' }>;
    fxRateToBase?: number;
    /** Payment date (ISO). Defaults to now when omitted. */
    paidAt?: string;
  }): Promise<string> {
    const { financeService } = await import('@/modules/finance/services/financeService');
    // Greedy allocate across the open targets, oldest-first, capped at the payment amount.
    let remaining = input.amount;
    const allocations: Array<{ target_id: string; target_type: 'invoice' | 'supplier_bill'; amount: number }> = [];
    for (const t of input.targets ?? []) {
      if (remaining <= 0.005) break;
      const due = Math.max(0, Number(t.amount_due) || 0);
      if (due <= 0) continue;
      const alloc = Math.min(remaining, due);
      allocations.push({ target_id: t.id, target_type: t.type, amount: Math.round(alloc * 100) / 100 });
      remaining -= alloc;
    }
    return financeService.recordPayment({
      workspaceId: input.order.workspace_id,
      direction: input.direction,
      amount: input.amount,
      currency: input.order.currency,
      method: (input.method as any) ?? undefined,
      reference: input.reference,
      orderId: input.order.id,
      bankAccountId: input.bankAccountId,
      fxRateToBase: input.fxRateToBase ?? 1,
      // Money in → the order's customer; money out → the supplier being paid.
      counterpartyCompanyId: input.direction === 'out' ? (input.supplierCompanyId ?? null) : (input.order.customer_company_id ?? null),
      counterpartyContactId: input.direction === 'in' ? (input.order.customer_contact_id ?? null) : null,
      // Ad-hoc payee only when money-out to a non-CRM supplier (no company id given).
      counterpartyName: input.direction === 'out' && !input.supplierCompanyId ? (input.supplierName ?? null) : null,
      counterpartyBankAccountId: input.counterpartyBankAccountId ?? null,
      paidAt: input.paidAt ?? undefined,
      allocations,
    });
  },

  /**
   * Edit an existing order payment. Updates the cash row and keeps a single linked allocation in
   * sync (clamped to the target's remaining), so settling stays consistent. Refuses to silently
   * change the amount of a multi-allocation payment (rare for order cash) — caller should delete
   * and re-add in that case.
   */
  async updateOrderPayment(input: {
    paymentId: string; orderId: string;
    direction: 'in' | 'out'; amount: number; reference: string; method: string | null;
    bankAccountId: string; counterpartyCompanyId: string | null; counterpartyContactId: string | null;
    counterpartyBankAccountId?: string | null;
    /** Ad-hoc (non-CRM) payee name — set only when there's no counterpartyCompanyId. */
    counterpartyName?: string | null;
    /** Payment date (ISO) — omit to leave unchanged. */
    paidAt?: string;
  }): Promise<void> {
    const { data: allocs, error: aErr } = await supabase
      .from('payment_allocations').select('id, invoice_id, supplier_bill_id, amount').eq('payment_id', input.paymentId);
    if (aErr) throw aErr;
    if ((allocs?.length ?? 0) > 1) {
      throw new Error('This payment settles more than one document — delete it and re-record instead of editing the amount.');
    }
    const { error } = await supabase.from('payments').update({
      direction: input.direction, amount: input.amount, reference: input.reference, method: input.method || null,
      bank_account_id: input.bankAccountId, counterparty_company_id: input.counterpartyCompanyId, counterparty_contact_id: input.counterpartyContactId,
      counterparty_bank_account_id: input.counterpartyBankAccountId ?? null,
      counterparty_name: input.counterpartyCompanyId ? null : (input.counterpartyName ?? null),
      ...(input.paidAt ? { paid_at: input.paidAt } : {}),
    }).eq('id', input.paymentId).eq('order_id', input.orderId);
    if (error) throw error;
    // Re-sync the single allocation amount so the settled invoice/bill matches the new cash amount.
    const a = allocs?.[0];
    if (a) {
      const targetTable = a.invoice_id ? 'invoices' : 'supplier_bills';
      const targetId = (a.invoice_id ?? a.supplier_bill_id) as string;
      const { data: tgt } = await supabase.from(targetTable).select('total').eq('id', targetId).maybeSingle();
      const col = a.invoice_id ? 'invoice_id' : 'supplier_bill_id';
      const { data: others } = await supabase.from('payment_allocations')
        .select('amount').eq(col, targetId).neq('id', a.id);
      const otherSum = (others ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
      const remaining = Math.max(0, (Number((tgt as any)?.total) || 0) - otherSum);
      const newAlloc = Math.round(Math.min(input.amount, remaining) * 100) / 100;
      const { error: uErr } = await supabase.from('payment_allocations')
        .update({ amount: newAlloc, amount_doc_currency: newAlloc }).eq('id', a.id);
      if (uErr) throw uErr;
    }
  },

  /** Delete an order payment. payment_allocations cascade, so the settled invoice/bill and the
   *  order's payment_status both recompute via their triggers. */
  async deleteOrderPayment(paymentId: string, orderId: string): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('id', paymentId).eq('order_id', orderId);
    if (error) throw error;
  },

  /** Audit trail of edits/deletes to this order's payments (newest first). Reads are RLS-gated to
   *  finance managers, so non-finance users transparently get an empty list. Capped at 500 (was
   *  50) — this is a single order's history, so the ceiling is only a runaway guard. */
  async listOrderPaymentAudit(orderId: string): Promise<Array<{
    id: string; payment_id: string | null; action: 'update' | 'delete'; actor: string | null;
    old_row: any; new_row: any; changed_at: string;
  }>> {
    const { data, error } = await supabase.from('payment_audit_log')
      .select('id, payment_id, action, actor, old_row, new_row, changed_at')
      .filter('old_row->>order_id', 'eq', orderId)
      .order('changed_at', { ascending: false })
      .limit(500);
    if (error) return [];
    return (data ?? []) as any;
  },

  /**
   * Set the order's finance category and/or expected payment date. These classify the order and
   * let it AGE in the AR/AP aging report before it's invoiced (an un-invoiced order has no invoice
   * due date, so the expected payment date is what it ages against). Both carry onto the
   * invoice/supplier bill when the order is invoiced. Pass a field to change it; omit to leave it.
   */
  async updateMeta(id: string, patch: { categoryId?: string | null; expectedPaymentDate?: string | null; notes?: string | null }): Promise<void> {
    const clean: Record<string, any> = { updated_at: new Date().toISOString() };
    if (patch.categoryId !== undefined) clean.category_id = patch.categoryId;
    if (patch.expectedPaymentDate !== undefined) clean.expected_payment_date = patch.expectedPaymentDate;
    if (patch.notes !== undefined) clean.notes = patch.notes;
    const { error } = await supabase.from('orders').update(clean).eq('id', id);
    if (error) throw error;
  },

  async setStatus(id: string, status: OrderStatus): Promise<void> {
    const { data, error } = await supabase.from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, order_number, order_type, workspace_id, total, currency')
      .single();
    if (error) throw error;
    // Flows — order status change (fire-and-forget).
    flowEventService.emitToWorkspaceRoles((data as any).workspace_id, ['owner', 'admin'], 'order_status_changed',
      (recipientUserId) => ({
        user_id: recipientUserId,
        type: 'order_status_changed',
        workspace_id: (data as any).workspace_id,
        order_id: id,
        order_number: (data as any).order_number ?? null,
        order_type: (data as any).order_type,
        status,
        status_label: ORDER_STATUS_LABEL[status] ?? status,
        total: (data as any).total,
        currency: (data as any).currency ?? 'EUR',
        title: `Order ${(data as any).order_number ? `#${(data as any).order_number} ` : ''}→ ${ORDER_STATUS_LABEL[status] ?? status}`,
        body: `Order status changed to "${ORDER_STATUS_LABEL[status] ?? status}".`,
        action_url: '/finance?tab=orders',
      }));
  },

  /**
   * Replace an order's line items and recompute its totals (draft/un-invoiced orders). The
   * order-level discount is re-applied against the (original) line prices — pass it explicitly so
   * editing the items keeps the discount instead of silently dropping it.
   */
  async updateItems(
    orderId: string, workspaceId: string, items: NewOrderItem[],
    discount?: { type: OrderDiscountType | null; value: number },
  ): Promise<void> {
    const disc = { type: discount?.type ?? null, value: Number(discount?.value) || 0 };
    const { lines, subtotal, vatTotal, total } = computeOrderLines(items, disc);
    await supabase.from('order_items').delete().eq('order_id', orderId);
    if (lines.length) {
      const { error: itErr } = await supabase.from('order_items').insert(lines.map((l, i) => ({
        order_id: orderId, workspace_id: workspaceId, product_id: l.it.product_id ?? null,
        description: l.it.description, quantity: l.it.quantity, unit_price: l.it.unit_price, unit_cost: l.it.unit_cost ?? null,
        supplier_company_id: l.it.supplier_company_id ?? null,
        measurement_unit_code: l.it.measurement_unit_code ?? null,
        vat_percent: l.pct, vat_category: l.it.vat_category ?? null,
        net_value: l.net, vat_amount: l.vat, line_total: l.net, discount_pct: l.discountPct,
        update_warehouse: l.it.update_warehouse ?? true, sort_order: i,
      })));
      if (itErr) throw itErr;
    }
    const { error } = await supabase.from('orders')
      .update({
        subtotal_net: subtotal, vat_amount: vatTotal, total,
        discount_type: disc.value > 0 && disc.type ? disc.type : null,
        discount_value: disc.value > 0 && disc.type ? disc.value : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
    if (error) throw error;
  },

  /** How much of the customer's on-account credit can be applied to this (sales) order. */
  async getApplicableCredit(orderId: string, workspaceId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_order_applicable_credit', {
      p_workspace_id: workspaceId, p_order_id: orderId,
    });
    if (error) throw error;
    return Number(data) || 0;
  },

  /**
   * Settle a sales order from the customer's existing on-account credit — NO new cash. Re-homes the
   * customer's unallocated "money in" onto the order (splitting the last payment so nothing overpays);
   * the order's payment_status recomputes via the payment trigger and any remainder stays as credit.
   * Pass `amount` to cap it; omit to apply up to the order's outstanding.
   */
  async applyCreditToOrder(orderId: string, workspaceId: string, amount?: number): Promise<number> {
    const { data, error } = await supabase.rpc('apply_customer_credit_to_order', {
      p_workspace_id: workspaceId, p_order_id: orderId, p_amount: amount ?? null,
    });
    if (error) throw error;
    return Number((data as any)?.applied) || 0;
  },

  /**
   * Customer-aware price for an order line, used to pre-fill it on product pick.
   *  - Sales: the central resolver `get_product_price_for_workspace` applies the customer's
   *    pricing level / discount off retail → `final_sell` (unit_price) + `cost_basis` (unit_cost)
   *    + `discount_pct`. This is the #227 pricing pyramid; the order reflects it out of the box.
   *  - Purchase: we pay cost, so unit_price = unit_cost = products.cost.
   * Also returns the product's unit of measure to seed the line's unit.
   */
  async resolveLinePricing(opts: {
    workspaceId: string; productId: string; orderType: OrderType;
    companyId?: string | null; contactId?: string | null;
  }): Promise<LinePricing> {
    const [{ data: prod }, available] = await Promise.all([
      supabase.from('products').select('cost, supplier_company_id').eq('id', opts.productId).maybeSingle(),
      this.getAvailableStock([opts.productId], opts.workspaceId).then((m) => m.get(opts.productId) ?? null),
    ]);
    // NB: products.measurement_unit_code is the integer myDATA code, NOT our text unit label
    // (item/m²/…), so we don't seed the line's unit from it — the user picks it.
    const unit: string | null = null;
    const cost = prod?.cost != null ? Number(prod.cost) : null;
    const supplier = (prod?.supplier_company_id as string | null) ?? null;
    if (opts.orderType === 'purchase') {
      return { unit_price: cost, unit_cost: cost, discount_pct: null, measurement_unit_code: unit, available, supplier_company_id: supplier };
    }
    try {
      const { data } = await supabase.rpc('get_product_price_for_workspace', {
        p_workspace_id: opts.workspaceId, p_product_id: opts.productId,
        p_company_id: opts.companyId ?? null, p_contact_id: opts.contactId ?? null, p_audience: 'seller',
      });
      const r = (data ?? {}) as { final_sell?: number; retail?: number; cost_basis?: number; discount_pct?: number };
      return {
        unit_price: r.final_sell != null ? Number(r.final_sell) : (r.retail != null ? Number(r.retail) : null),
        unit_cost: r.cost_basis != null ? Number(r.cost_basis) : cost,
        discount_pct: r.discount_pct != null ? Number(r.discount_pct) : null,
        measurement_unit_code: unit, available, supplier_company_id: supplier,
      };
    } catch {
      return { unit_price: null, unit_cost: cost, discount_pct: null, measurement_unit_code: unit, available, supplier_company_id: supplier };
    }
  },

  /** Qty on hand per product, summed across the workspace's warehouses. Absent = not stocked. */
  async getAvailableStock(productIds: string[], workspaceId: string): Promise<Map<string, number>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const { data } = await supabase.from('warehouse_items').select('product_id, qty_on_hand')
      .eq('workspace_id', workspaceId).in('product_id', ids);
    for (const r of (data ?? []) as Array<{ product_id: string; qty_on_hand: number | null }>) {
      out.set(r.product_id, (out.get(r.product_id) ?? 0) + Number(r.qty_on_hand ?? 0));
    }
    return out;
  },

  /** Set / clear the supplier on a specific ORDER LINE (the "+ supplier" picker). Also seeds the
   * product's default supplier when it doesn't have one yet, so future lines auto-fill. */
  async setOrderItemSupplier(itemId: string, supplierCompanyId: string | null, productId?: string | null): Promise<void> {
    const { error } = await supabase.from('order_items').update({ supplier_company_id: supplierCompanyId }).eq('id', itemId);
    if (error) throw error;
    if (productId && supplierCompanyId) {
      await supabase.from('products').update({ supplier_company_id: supplierCompanyId }).eq('id', productId).is('supplier_company_id', null);
    }
  },

  /** Company id → name, for showing supplier labels on order lines. */
  async getCompanyNames(companyIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const { data } = await supabase.from('crm_companies').select('id, name').in('id', ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string }>) out.set(c.id, c.name);
    return out;
  },

  /** Resolve CRM contact ids → display name (for bare-contact payment counterparties). */
  async getContactNames(contactIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(contactIds.filter(Boolean))];
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const { data } = await supabase.from('crm_contacts').select('id, name').in('id', ids);
    for (const c of (data ?? []) as Array<{ id: string; name: string }>) out.set(c.id, c.name);
    return out;
  },

  /** What we owe each supplier on an order. `unit_cost` is stored NET; VAT on the purchase mirrors
   * the SAME rate the line carries on the order (order_items.vat_percent) — so it's the exact VAT
   * already totalled at the bottom of the order, counted ONCE, never a synthetic markup. A 0%-VAT
   * line therefore owes the net cost (matching the line's "Cost total"); a 24% line owes cost×1.24.
   * `cost_net`/`has_vat` are returned for the UI breakdown. Subtract cash already paid to the
   * supplier on this order. Drives the AP view. */
  async getOrderSupplierExposure(orderId: string): Promise<Array<{ supplier_company_id: string; name: string; cost_net: number; cost: number; has_vat: boolean; paid: number; owed: number }>> {
    const { data: items } = await supabase.from('order_items')
      .select('supplier_company_id, quantity, unit_cost, vat_percent').eq('order_id', orderId);
    const bySup = new Map<string, { net: number; gross: number }>();
    for (const it of (items ?? []) as Array<{ supplier_company_id: string | null; quantity: number; unit_cost: number | null; vat_percent: number | null }>) {
      if (!it.supplier_company_id || it.unit_cost == null) continue;
      const net = Number(it.unit_cost) * Number(it.quantity);
      const gross = net * (1 + (Number(it.vat_percent ?? 0) || 0) / 100);
      const cur = bySup.get(it.supplier_company_id) ?? { net: 0, gross: 0 };
      cur.net += net; cur.gross += gross;
      bySup.set(it.supplier_company_id, cur);
    }
    if (bySup.size === 0) return [];
    const { data: pays } = await supabase.from('payments')
      .select('counterparty_company_id, amount').eq('order_id', orderId).eq('direction', 'out');
    const paid = new Map<string, number>();
    for (const p of (pays ?? []) as Array<{ counterparty_company_id: string | null; amount: number }>) {
      if (p.counterparty_company_id) paid.set(p.counterparty_company_id, (paid.get(p.counterparty_company_id) ?? 0) + Number(p.amount));
    }
    const names = await this.getCompanyNames([...bySup.keys()]);
    return [...bySup.entries()].map(([sid, c]) => {
      const net = Math.round(c.net * 100) / 100;
      const gross = Math.round(c.gross * 100) / 100;
      const p = paid.get(sid) ?? 0;
      return {
        supplier_company_id: sid, name: names.get(sid) ?? 'Supplier',
        cost_net: net, cost: gross, has_vat: Math.abs(gross - net) >= 0.005,
        paid: p, owed: Math.round((gross - p) * 100) / 100,
      };
    });
  },

  /** Batch list-price lookup for a set of products (order detail shows discount-vs-list). */
  async getListPrices(productIds: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const { data } = await supabase.from('product_prices').select('product_id, list_price, updated_at').in('product_id', ids);
    const m = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ product_id: string; list_price: number | null }>) {
      if (r.list_price != null && !m.has(r.product_id)) m.set(r.product_id, Number(r.list_price));
    }
    return m;
  },

  /**
   * Set per-line delivered quantities and auto-advance the order's fulfilment status:
   *   nothing delivered → confirmed · some → partially_fulfilled · all → fulfilled.
   * (Stays out of 'draft'/'cancelled'.) Warehouse stock movement remains the dispatch flow's job.
   */
  async setDelivery(orderId: string, deliveries: Array<{ itemId: string; quantityDelivered: number }>): Promise<OrderStatus> {
    let status: OrderStatus = 'confirmed';
    for (const d of deliveries) {
      // deliver_order_line moves warehouse stock by the delta (sales out / purchase in) AND
      // recomputes the order's fulfilment status atomically.
      const { data, error } = await supabase.rpc('deliver_order_line', {
        p_order: orderId, p_item: d.itemId, p_qty: Math.max(0, d.quantityDelivered),
      });
      if (error) throw error;
      if (data) status = data as OrderStatus;
    }
    return status;
  },
};
