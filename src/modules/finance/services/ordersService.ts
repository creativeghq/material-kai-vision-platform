import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { VAT_CATEGORIES } from '@/modules/finance/services/financeService';
import { vatOf } from '@/modules/finance/lib/vatMath';

export type OrderType = 'sales' | 'purchase';
export type OrderStatus = 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid';

// Title Case, per the platform-wide heading rule in .claude/design-system.md — these render as
// status VALUES in tables and on the order header, not as sentences.
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Pre-Order', confirmed: 'Confirmed', partially_fulfilled: 'Partially Delivered',
  fulfilled: 'Completed', cancelled: 'Cancelled',
};
export const ORDER_PAYMENT_LABEL: Record<OrderPaymentStatus, string> = {
  unpaid: 'Unpaid', partial: 'Partially Paid', paid: 'Paid',
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
  /**
   * The SALES order this order exists to serve — "we are buying this FOR that customer's order".
   * Set by `raise_cover_purchase_orders` and by the link picker. Never a merge: purchase lines are
   * money OUT and must not land on a sales order, which settles on money IN.
   */
  covers_order_id: string | null;
  source_quote_id: string | null;
  /**
   * The inbox conversation this order was raised from, written by
   * `create_order_from_thread_intake`. Declared and surfaced here because it was neither: the
   * column was written from the day it shipped and read by nothing, so an order born out of a
   * customer conversation lost every trace of it the moment it was created.
   */
  source_thread_id: string | null;
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
  /**
   * In-app pairing: the mirrored order in the OTHER workspace (reseller network, or a purchase
   * order handed off to a claimed supplier — `handoff_purchase_order_to_supplier`). On a PO,
   * non-null means "sent in-app"; the paired row is the supplier's sales order.
   */
  paired_order_id: string | null;
  paired_workspace_id: string | null;
  /** What the supplier reported back on a PO — via the portal or their mirror order's progress. */
  supplier_status: 'acknowledged' | 'shipped' | null;
  supplier_acknowledged_at: string | null;
  supplier_eta: string | null;
  supplier_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The canonical settlement position of an order, as returned by `get_order_settlements`.
 * `settled` is already the direction-correct half and `outstanding` is already `total − settled`
 * — the TypeScript layer formats these, it does not compute them.
 */
export interface OrderBalance {
  order_id: string;
  order_type: OrderType;
  currency: string;
  total: number;
  /** Money-in allocations (a sales order's settlement; a purchase order's refunds). */
  settled_in: number;
  /** Money-out allocations (a purchase order's settlement; what we paid suppliers on a sale). */
  settled_out: number;
  /** The half THIS order type settles on. */
  settled: number;
  /** `total − settled`. Negative means over-settled. */
  outstanding: number;
  /** What payment_status should be, derived from the ledger. */
  payment_status: OrderPaymentStatus;
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

/** A customer, as either a company or a standalone contact. */
export interface LinkParty { party_type: 'company' | 'contact'; id: string; name: string | null }

export interface LinkOrderSummary {
  id: string;
  order_number: string | null;
  status: OrderStatus;
  payment_status?: OrderPaymentStatus;
  total: number;
  currency: string;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
}

export interface LinkTargetSearch {
  projects: Array<{
    id: string; name: string; status: string; last_activity_at: string;
    client_company_id: string | null; client_contact_id: string | null; client_name: string | null;
  }>;
  customers: Array<LinkParty & { open_count: number; orders: LinkOrderSummary[] }>;
  /** Orders this order's lines may legally be APPENDED to. See `search_order_link_targets`. */
  merge_targets: Array<LinkOrderSummary & { party_name: string | null; line_count: number; covers_order_id: string | null }>;
}

/**
 * What a cost is FOR. One field in the UI, five resolutions — every one of which writes a column
 * that already existed; this adds vocabulary, not schema.
 *
 * The distinction that matters is `merge_order` vs `sales_order` vs `cost_of_order`. All three read
 * as "add it to an order I already have", and they write three different things:
 *   • `merge_order` — the same party and the same direction, so the LINES join that order.
 *   • `sales_order` — settles on money IN. Appending our costs there would bill the customer what
 *     we paid, so it is LINKED (`covers_order_id`) and never written into.
 *   • `cost_of_order` — this cost RIDES ALONG with a purchase already recorded (freight, customs,
 *     an installer, often from a different supplier entirely). It becomes an EXPENSE on that order
 *     (`supplier_bills.order_id`); no order is created and no line is appended, because the cost is
 *     not part of what that order bought. An order holds as many expenses as the job needed.
 */
export type OrderLinkTarget =
  | { kind: 'none' }
  | { kind: 'project'; projectId: string; label: string }
  /** Raise a NEW sales order for this customer, mirroring the lines at their selling price. */
  | { kind: 'customer'; party: LinkParty; label: string }
  /** Attach to a sales order that already exists — sets `covers_order_id`, inherits its project. */
  | { kind: 'sales_order'; orderId: string; projectId: string | null; label: string }
  /** Append the lines to an existing order of the SAME type and party, instead of raising a new one. */
  | { kind: 'merge_order'; orderId: string; orderType: OrderType; projectId: string | null; label: string }
  /** Book this cost as an expense ON an existing purchase order — `supplier_bills.order_id`. */
  | { kind: 'cost_of_order'; orderId: string; projectId: string | null; label: string };

import { round2 as r2 } from '@/utils/decimal';

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
    const vat = vatOf(net, pct);
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
   *
   * Each row also carries the DERIVED due date the money ages against (`due_date`): the operator's
   * `expected_payment_date` when set, otherwise the order date + the workspace's default payment
   * terms — the same fallback `mark_invoice_issued` applies to an invoice with no explicit due
   * date. Without it, an un-invoiced order could never age: real overdue money sat in the
   * "no due date" bucket forever and every aging card read €0 (the silent-zero shape).
   * `due_from_terms` flags the derived case so callers can label it and keep the operator-set
   * field itself empty (editing a due date must never persist one nobody typed).
   */
  async listUninvoicedOutstanding(opts: {
    workspaceId: string;
    companyId?: string;
    contactId?: string;
  }): Promise<Array<{ id: string; order_number: string | null; order_type: OrderType; party_name: string | null; total: number; settled: number; outstanding: number; currency: string; status: OrderStatus; created_at: string; category_id: string | null; category_name: string | null; expected_payment_date: string | null; due_date: string | null; due_from_terms: boolean }>> {
    // Paged until exhausted. `list()` delegates to listPage with a DEFAULT limit of 500 and
    // discards `count`, so past 500 orders un-invoiced receivables/payables simply stopped
    // appearing in AR/AP — real overdue money vanished from both tabs with no truncation signal
    // anywhere. The page size is a transport detail; the caller needs the whole set.
    const PAGE = 500;
    const list: OrderListRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await this.listPage({
        workspaceId: opts.workspaceId, companyId: opts.companyId, contactId: opts.contactId,
        limit: PAGE, offset,
      });
      list.push(...res.rows);
      if (res.rows.length < PAGE || list.length >= res.count) break;
      // Defensive stop: a count that never converges must not spin forever.
      if (offset > 20_000) break;
    }
    // Candidates = every non-cancelled order. We include a draft/pre-order only once it has moved
    // real cash (a deposit received / paid) — empty drafts stay hidden, but a pre-order with a
    // deposit is real money and must surface in Receivables/Payables.
    const candidates = list.filter((o) => o.status !== 'cancelled');
    if (candidates.length === 0) return [];
    const ids = candidates.map((o) => o.id);

    // Batch the finance lookups (3 queries total, not 3 per order). We only need presence of an
    // invoice/bill plus the canonical settlement position — not the full getOrderFinance payload.
    // Settlement comes from `orderBalances` (the shared SQL definition), NOT from re-summing
    // allocations here.
    const [inv, bills, balances, settings] = await Promise.all([
      supabase.from('invoices').select('order_id').in('order_id', ids),
      supabase.from('supplier_bills').select('order_id').in('order_id', ids),
      this.orderBalances(ids),
      supabase.from('finance_settings').select('default_payment_terms_days').eq('workspace_id', opts.workspaceId).maybeSingle(),
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
    // Terms fallback for orders with no operator-set expected payment date. Dates are computed in
    // UTC calendar days to match the invoice aging view, which does `CURRENT_DATE - due_at` in the
    // DB session timezone (UTC on Supabase) — mixing local time would shift a bucket by a day.
    const termsDays = Number((settings.data as { default_payment_terms_days?: number } | null)?.default_payment_terms_days ?? 30);
    const dueFromTerms = (createdAt: string): string | null => {
      const t = Date.parse(createdAt);
      if (Number.isNaN(t)) return null;
      return new Date(t + termsDays * 86_400_000).toISOString().slice(0, 10);
    };

    // A draft/pre-order only counts as real once cash has actually moved on it, either way.
    const hasCash = (id: string) => {
      const b = balances.get(id);
      return !!b && (b.settled_in > 0.005 || b.settled_out > 0.005);
    };

    return candidates
      .filter((o) => !invoiced.has(o.id))
      // Confirmed+ orders always; drafts/pre-orders only once cash has moved on them.
      .filter((o) => o.status !== 'draft' || hasCash(o.id))
      .map((o) => {
        const b = balances.get(o.id);
        return {
          id: o.id,
          order_number: o.order_number,
          order_type: o.order_type,
          party_name: o.party_name,
          total: Number(o.total),
          settled: b?.settled ?? 0,
          outstanding: b?.outstanding ?? Number(o.total),
          currency: o.currency,
          status: o.status,
          created_at: o.created_at,
          category_id: o.category_id ?? null,
          category_name: o.category_id ? (catNames.get(o.category_id) ?? null) : null,
          expected_payment_date: o.expected_payment_date ?? null,
          due_date: o.expected_payment_date ?? dueFromTerms(o.created_at),
          due_from_terms: !o.expected_payment_date,
        };
      })
      .filter((r) => r.outstanding > 0.005);
  },

  /**
   * Settlement position per order, straight from `get_order_settlements` — the SINGLE definition
   * of how much an order is settled and how much is still owed.
   *
   * Do NOT re-derive `outstanding` from these numbers. The rule — a sales order settles on money
   * IN; a purchase order on money OUT; the opposite direction is the other side of the trade and
   * must never reduce what the counterparty owes — lives in ONE place. Net the two directions and
   * a fully-paid sales order with a paid supplier bill reports as still owing exactly the
   * supplier's amount, while the payment badge on the same row says "Paid".
   *
   * The RPC returns `settled` / `outstanding` / `payment_status` already derived, and the same
   * function backs `recompute_order_payment_status` and the `finance.order_payment_status_drift`
   * integrity check, so the three cannot disagree.
   */
  async orderBalances(orderIds: string[]): Promise<Map<string, OrderBalance>> {
    const out = new Map<string, OrderBalance>();
    if (orderIds.length === 0) return out;
    const { data } = await supabase.rpc('get_order_settlements', { p_order_ids: orderIds });
    for (const r of (data ?? []) as OrderBalance[]) {
      out.set(r.order_id, {
        ...r,
        total: Number(r.total), settled_in: Number(r.settled_in), settled_out: Number(r.settled_out),
        settled: Number(r.settled), outstanding: Number(r.outstanding),
      });
    }
    return out;
  },

  async get(id: string): Promise<{ order: Order; items: OrderItem[] }> {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error) throw error;
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', id).order('sort_order', { ascending: true });
    return { order: order as Order, items: (items ?? []) as OrderItem[] };
  },

  /**
   * Can this purchase order be handed off in-app? True only when its supplier company is linked
   * to a CLAIMED platform identity (VAT-verified, operator-approved) owned by another workspace.
   */
  async supplierHandoffAvailable(orderId: string): Promise<{ available: boolean; supplierWorkspaceName?: string }> {
    const { data, error } = await supabase.rpc('supplier_handoff_available', { p_order: orderId });
    if (error) throw error;
    const d = (data ?? {}) as { available?: boolean; supplier_workspace_name?: string };
    return { available: !!d.available, supplierWorkspaceName: d.supplier_workspace_name ?? undefined };
  },

  /**
   * Hand the PO off in-app: a DRAFT sales order materializes in the supplier's workspace (paired
   * both ways via paired_order_id) and their admins are notified. The supplier's confirm/fulfil
   * then round-trips onto this PO as supplier_status acknowledged/shipped.
   */
  async handoffToSupplier(orderId: string): Promise<{ salesOrderId: string }> {
    const { data, error } = await supabase.rpc('handoff_purchase_order_to_supplier', { p_order: orderId });
    if (error) throw error;
    const d = (data ?? {}) as { sales_order_id?: string };
    return { salesOrderId: d.sales_order_id ?? '' };
  },

  /** 3-way match for a purchase order: PO net × goods received × supplier-bill net. */
  async getThreeWayMatch(orderId: string): Promise<ThreeWayMatch | null> {
    const { data, error } = await supabase.rpc('compute_three_way_match', { p_order_id: orderId });
    if (error) throw error;
    const d = data as unknown as ThreeWayMatch & { error?: string };
    if (!d || d.error) return null;
    return d;
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
    /** The sales order this one is raised to serve (demand link, never a merge). */
    coversOrderId?: string | null;
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
        covers_order_id: input.coversOrderId ?? null,
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
      // On a PURCHASE order every line is bought from the order's supplier — that is what makes
      // it a purchase order. Stamping it here is what stops the detail panel asking for a
      // per-line supplier that was already chosen when the order was raised. Only a SALES order
      // mixes suppliers across lines (that's what "Cover shortfall from suppliers" produces).
      const defaultSupplier = input.orderType === 'purchase' ? (input.supplierCompanyId ?? null) : null;
      const itemRows = lines.map((l, i) => ({
        order_id: orderId,
        workspace_id: input.workspaceId,
        product_id: l.it.product_id ?? null,
        description: l.it.description,
        quantity: l.it.quantity,
        unit_price: l.it.unit_price,
        unit_cost: l.it.unit_cost ?? null,
        supplier_company_id: l.it.supplier_company_id ?? defaultSupplier,
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
      // SQL has the last word on the derived money. `computeOrderLines` above seeds the same
      // numbers so the row is never briefly wrong, but `recompute_order_totals` is the definition
      // — the one `append_order_items` also uses, so a merged order and a created order cannot
      // end up rated by two different rules. A disagreement here is a bug in one of them, and
      // this call means the database's answer is the one that survives.
      await supabase.rpc('recompute_order_totals', { p_order_id: orderId });
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
        action_url: `/finance/orders/${orderId}`,
      }));
    return orderId;
  },

  /**
   * Everything a cost can be attributed to, in one round trip: projects, customers with their open
   * sales orders nested underneath, and — only when a supplier and currency are known — the purchase
   * orders these lines may legally be merged into.
   *
   * `merge_targets` is filtered server-side rather than in the picker, so "what may be appended to"
   * has exactly one definition and it is the one the database enforces.
   */
  async searchLinkTargets(opts: {
    workspaceId: string;
    query?: string | null;
    /** The type of order being composed. Merge candidates must match it — see the RPC comment. */
    orderType?: OrderType | null;
    /** Its counterparty: the supplier on a purchase order, the customer on a sales order. */
    partyCompanyId?: string | null;
    partyContactId?: string | null;
    currency?: string | null;
    limit?: number;
  }): Promise<LinkTargetSearch> {
    const { data, error } = await supabase.rpc('search_order_link_targets', {
      p_workspace_id: opts.workspaceId,
      p_query: opts.query?.trim() || null,
      p_order_type: opts.orderType ?? null,
      p_party_company_id: opts.partyCompanyId ?? null,
      p_party_contact_id: opts.partyContactId ?? null,
      p_currency: opts.currency ?? null,
      p_limit: opts.limit ?? 8,
    });
    if (error) throw error;
    const d = (data ?? {}) as Partial<LinkTargetSearch>;
    return {
      projects: d.projects ?? [],
      customers: d.customers ?? [],
      merge_targets: d.merge_targets ?? [],
    };
  },

  /**
   * Append lines to an existing order. NOT `updateItems`, which deletes every line and re-inserts:
   * `stock_allocations.demand_id` points at `order_items.id`, so a delete drops the order's
   * reservations and its `quantity_delivered` with them. The RPC only inserts, then re-rates the
   * existing lines in place (a flat-amount order discount is stored as an effective percent, so a
   * new line legitimately changes what every other line nets).
   *
   * `expectOrderType` is passed so the database, not the caller, refuses a purchase-into-sales merge.
   */
  async appendItems(opts: {
    orderId: string;
    items: NewOrderItem[];
    expectOrderType?: OrderType;
    expectCurrency?: string;
  }): Promise<{ ok: boolean; reason?: string; message?: string; appended?: number; order_number?: string | null }> {
    const { data, error } = await supabase.rpc('append_order_items', {
      p_order_id: opts.orderId,
      p_items: opts.items.map((it) => ({
        product_id: it.product_id ?? null,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost ?? null,
        supplier_company_id: it.supplier_company_id ?? null,
        measurement_unit_code: it.measurement_unit_code ?? null,
        vat_percent: it.vat_percent ?? 0,
        vat_category: it.vat_category ?? null,
        update_warehouse: it.update_warehouse ?? true,
      })),
      p_expect_order_type: opts.expectOrderType ?? null,
      p_expect_currency: opts.expectCurrency ?? null,
    });
    if (error) throw error;
    return (data ?? { ok: false }) as any;
  },

  /**
   * Re-price purchase lines as what the CUSTOMER pays, for the mirrored sales order.
   *
   * Every catalog line goes back through `resolveLinePricing` — the pricing pyramid, the same
   * resolver a hand-picked line uses — so the customer's pricing level and discount apply. It does
   * NOT mark cost up by a house percentage; there is no such number, and inventing one here would
   * be a second pricing rule competing with the resolver.
   *
   * Ad-hoc lines (no `product_id`) have nothing to look up. They are carried at cost and reported in
   * `unpriced` so the operator is told which lines still need a price, rather than a zero-margin
   * line quietly reaching the customer.
   *
   * `supplierCompanyId` is the purchase's own supplier, and every mirrored line keeps it. On a SALES
   * line `supplier_company_id` answers "who do we buy this from" — it is what `getOrderSupplierExposure`
   * groups our payable by and what the line's "Mark paid" pays. This used to be nulled on the way
   * across on the reasoning that a supplier stamp belongs to the purchase side, which had it exactly
   * backwards: the mirror is created FROM the purchase, so the one moment the answer is known for
   * certain is this one. Nulling it meant a sale raised from a purchase showed "+ supplier" on every
   * line and an empty Suppliers tab, with the operator re-picking by hand what the purchase already said.
   */
  async mirrorLinesForSale(opts: {
    workspaceId: string;
    items: NewOrderItem[];
    companyId?: string | null;
    contactId?: string | null;
    /** Who the purchase being mirrored buys from — the fallback for lines carrying no supplier. */
    supplierCompanyId?: string | null;
  }): Promise<{ items: NewOrderItem[]; unpriced: string[] }> {
    const unpriced: string[] = [];
    const fallbackSupplier = opts.supplierCompanyId ?? null;
    const items = await Promise.all(opts.items.map(async (it) => {
      const sup = it.supplier_company_id ?? fallbackSupplier;
      if (!it.product_id) {
        unpriced.push(it.description);
        return { ...it, supplier_company_id: sup };
      }
      const pr = await this.resolveLinePricing({
        workspaceId: opts.workspaceId, productId: it.product_id, orderType: 'sales',
        companyId: opts.companyId ?? null, contactId: opts.contactId ?? null,
      }).catch(() => null);
      if (pr?.unit_price == null) {
        unpriced.push(it.description);
        return { ...it, supplier_company_id: sup };
      }
      return {
        ...it,
        unit_price: pr.unit_price,
        unit_cost: pr.unit_cost ?? it.unit_cost ?? null,
        // The line we are actually buying from wins over the product's default supplier: the
        // catalog names who usually supplies it, this purchase names who is supplying it now.
        supplier_company_id: sup ?? pr.supplier_company_id ?? null,
      };
    }));
    return { items, unpriced };
  },

  /**
   * Duplicate an order into a NEW DRAFT — same party / project / currency / lines — so the operator
   * can repeat business without re-entering everything. Delivered/paid state is NOT carried (a fresh
   * order starts undelivered, unpaid); reservation re-pins on confirm. Returns the new order id.
   */
  /**
   * Re-order: the same items, bought/sold AGAIN, at TODAY's prices and against today's stock.
   *
   * Distinct from `duplicate`, which is an exact copy of a past order — frozen unit prices, frozen
   * costs, straight into `draft`. That is right for "I typed this wrong, give me another go at the
   * same paperwork" and wrong for "order this again": a copy re-books last year's price as if it
   * were current, and silently mis-states margin from the first line.
   *
   * So this returns a PREFILL rather than a row. It re-resolves each product line through
   * `resolveLinePricing` — the same customer-aware resolver a hand-picked line uses — and hands the
   * result to the ordinary New order form, where the operator sees today's numbers and availability
   * before committing. Saving then runs the normal create path, so order numbering, stock
   * reservation, three-way match and notifications all fire exactly as for any other order. A copy
   * inserted behind the scenes fires none of them.
   *
   * `changes` reports what moved since the original, so a re-order at a new price is a visible
   * decision instead of a silent one.
   */
  /**
   * Raise the purchase order(s) this confirmed sales order needs but stock cannot cover.
   *
   * Shortfall is (ordered − delivered − reserved) per line, grouped into ONE draft purchase order
   * per supplier and linked back via `orders.covers_order_id`. Draft, not placed: it commits
   * money. Idempotent — quantities already on an open cover order are subtracted, so pressing it
   * twice does not buy the same units twice.
   */
  async raiseCoverPurchaseOrders(orderId: string): Promise<{
    ok: boolean;
    reason?: string;
    message?: string;
    created?: Array<{ order_id: string; order_number: string | null; supplier_name: string | null; currency: string; total: number; lines: number }>;
    uncovered?: Array<{ order_item_id: string; description: string; quantity: number; reason: string }>;
  }> {
    const { data, error } = await supabase.rpc('raise_cover_purchase_orders', { p_order_id: orderId });
    if (error) throw error;
    return (data ?? { ok: false }) as any;
  },

  async reorderPrefill(orderId: string): Promise<{
    orderType: OrderType;
    lockedCompanyId?: string;
    lockedContactId?: string;
    currency: string;
    notes: string;
    lines: Array<{
      product_id: string | null; description: string; quantity: number; unit_price: number;
      unit_cost: number | null; unit_code: string; vat_code: string; supplier_company_id: string | null;
      available: number | null;
      original_unit_price: number; original_unit_cost: number | null;
    }>;
    changes: Array<{ description: string; was: number; now: number }>;
  }> {
    const { data: o, error } = await supabase.from('orders')
      .select('workspace_id, order_type, order_number, currency, customer_company_id, customer_contact_id, supplier_company_id, supplier_contact_id')
      .eq('id', orderId).single();
    if (error) throw error;
    const { data: items, error: iErr } = await supabase.from('order_items')
      .select('product_id, description, quantity, unit_price, unit_cost, measurement_unit_code, vat_percent, vat_category, supplier_company_id, update_warehouse, sort_order')
      .eq('order_id', orderId).order('sort_order', { ascending: true });
    if (iErr) throw iErr;

    const isSales = o.order_type === 'sales';
    const companyId = (isSales ? o.customer_company_id : o.supplier_company_id) as string | null;
    const contactId = (isSales ? o.customer_contact_id : o.supplier_contact_id) as string | null;

    const changes: Array<{ description: string; was: number; now: number }> = [];
    const lines = await Promise.all(((items ?? []) as any[]).map(async (it) => {
      const wasPrice = Number(it.unit_price) || 0;
      let price = wasPrice;
      let cost = it.unit_cost != null ? Number(it.unit_cost) : null;
      let supplier = (it.supplier_company_id as string | null) ?? null;
      let available: number | null = null;
      // Only catalog-linked lines can be re-priced; a free-text line has no price to look up, so
      // it carries its original figure forward rather than being blanked.
      if (it.product_id) {
        const pr = await this.resolveLinePricing({
          workspaceId: o.workspace_id, productId: it.product_id, orderType: o.order_type as OrderType,
          companyId, contactId,
        }).catch(() => null);
        if (pr) {
          if (pr.unit_price != null) price = pr.unit_price;
          if (pr.unit_cost != null) cost = pr.unit_cost;
          if (pr.supplier_company_id) supplier = pr.supplier_company_id;
          available = pr.available;
        }
      }
      if (Math.abs(price - wasPrice) > 0.005) changes.push({ description: it.description, was: wasPrice, now: price });
      return {
        product_id: (it.product_id as string | null) ?? null,
        description: it.description as string,
        quantity: Number(it.quantity) || 1,
        unit_price: price,
        unit_cost: cost,
        unit_code: (it.measurement_unit_code as string | null) || 'pcs',
        vat_code: it.vat_category != null
          ? String(it.vat_category)
          : (VAT_CATEGORIES.find((v) => v.pct === Number(it.vat_percent ?? 0))?.code ?? '1'),
        supplier_company_id: supplier,
        available,
        // What this line cost/sold for on the ORIGINAL order, so the form can offer "keep the
        // original prices" without a second round trip. This is what the old separate "Duplicate
        // order" action did, now a toggle instead of a whole parallel flow.
        original_unit_price: wasPrice,
        original_unit_cost: it.unit_cost != null ? Number(it.unit_cost) : null,
      };
    }));

    return {
      orderType: o.order_type as OrderType,
      lockedCompanyId: companyId ?? undefined,
      lockedContactId: companyId ? undefined : (contactId ?? undefined),
      currency: o.currency as string,
      notes: `Re-order of ${o.order_number ?? orderId.slice(0, 8)}`,
      lines,
      changes,
    };
  },

  async getOrderFinance(orderId: string): Promise<{
    invoices: Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    supplierBills: Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    payments: Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; method: string | null; reference: string | null; notes: string | null; bank_account_id: string | null; counterparty_company_id: string | null; counterparty_contact_id: string | null; counterparty_bank_account_id: string | null; counterparty_name: string | null }>;
    received: number;
    paid_out: number;
    profit: number;
    // Canonical settlement from `get_order_settlements` — the same definition that drives
    // `payment_status` and the drift check. Unlike `received`/`paid_out` (which only see cash
    // whose `payments.order_id` = this order) it also counts credit re-homed onto the order from
    // an on-account payment (whose `order_id` is NULL). Read `settled`/`outstanding` directly;
    // never recompute them from the two halves.
    settled_in: number;
    settled_out: number;
    settled: number;
    outstanding: number;
    /**
     * The payment status the LEDGER implies, off the same `get_order_settlements` row as
     * `settled`/`outstanding` — NOT the cached `orders.payment_status` column. Render this: a
     * screen that shows Outstanding from the derivation and the word "Paid" from the cache is the
     * exact pair `finance.order_payment_status_drift` exists to catch, and it was already fixed
     * once in the orders LIST while the detail header kept reading the cache.
     */
    payment_status: OrderPaymentStatus;
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
    // Canonical settlement — already direction-resolved by the RPC.
    const b = ((settlement.data ?? []) as OrderBalance[])[0];
    return {
      invoices: (inv.data ?? []) as Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      supplierBills: (bills.data ?? []) as Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      payments, received, paid_out, profit: received - paid_out,
      settled_in: Number(b?.settled_in ?? 0), settled_out: Number(b?.settled_out ?? 0),
      settled: Number(b?.settled ?? 0), outstanding: Number(b?.outstanding ?? 0),
      payment_status: (b?.payment_status ?? 'unpaid') as OrderPaymentStatus,
      creditApplied,
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
    // Propagate. `return []` here — with the caller adding its own `.catch(() => [])` — meant a
    // finance manager investigating a changed amount was shown "no history" for a read that
    // FAILED. "Nothing was edited" and "we could not check" are opposite answers to the question
    // being asked.
    if (error) throw error;
    return (data ?? []) as any;
  },

  /**
   * Set the order's finance category and/or expected payment date. These classify the order and
   * let it AGE in the AR/AP aging report before it's invoiced (an un-invoiced order has no invoice
   * due date, so the expected payment date is what it ages against). Both carry onto the
   * invoice/supplier bill when the order is invoiced. Pass a field to change it; omit to leave it.
   */
  async updateMeta(id: string, patch: {
    categoryId?: string | null; expectedPaymentDate?: string | null; notes?: string | null;
    /** What the order is FOR. Was set-once-at-create until the link picker made it editable. */
    projectId?: string | null; coversOrderId?: string | null;
  }): Promise<void> {
    const clean: Record<string, any> = { updated_at: new Date().toISOString() };
    if (patch.categoryId !== undefined) clean.category_id = patch.categoryId;
    if (patch.expectedPaymentDate !== undefined) clean.expected_payment_date = patch.expectedPaymentDate;
    if (patch.notes !== undefined) clean.notes = patch.notes;
    if (patch.projectId !== undefined) clean.project_id = patch.projectId;
    if (patch.coversOrderId !== undefined) clean.covers_order_id = patch.coversOrderId;
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
        action_url: `/finance/orders/${id}`,
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
    // Same rule as create(): a purchase order's lines belong to that order's supplier.
    const { data: own } = await supabase.from('orders').select('order_type, supplier_company_id').eq('id', orderId).maybeSingle();
    const defaultSupplier = own?.order_type === 'purchase' ? ((own.supplier_company_id as string | null) ?? null) : null;
    await supabase.from('order_items').delete().eq('order_id', orderId);
    if (lines.length) {
      const { error: itErr } = await supabase.from('order_items').insert(lines.map((l, i) => ({
        order_id: orderId, workspace_id: workspaceId, product_id: l.it.product_id ?? null,
        description: l.it.description, quantity: l.it.quantity, unit_price: l.it.unit_price, unit_cost: l.it.unit_cost ?? null,
        supplier_company_id: l.it.supplier_company_id ?? defaultSupplier,
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
    // Same authority as create(): the discount type/value were just written, so re-derive the
    // lines and totals from them in SQL rather than trusting the numbers computed before the write.
    await supabase.rpc('recompute_order_totals', { p_order_id: orderId });
  },

  // `getApplicableCredit` / `applyCreditToOrder` lived here. Settling a sales order from the
  // customer's on-account money is now the sweep's job and only the sweep's job — it runs on every
  // recorded payment, caps at outstanding from `get_order_settlements`, and places oldest-first.
  // The RPCs behind them (`get_order_applicable_credit`, `apply_customer_credit_to_order`) are
  // dropped; the latter re-derived "settled" with its own direction-filtered sum, which is exactly
  // the duplicate-derivation shape moneyDerivation.test.ts exists to stop.

  /**
   * Customer-aware price for an order line, used to pre-fill it on product pick.
   *  - Sales: the central resolver `get_product_price_for_workspace` applies the customer's
   *    pricing level / discount off retail → `final_sell` (unit_price) + `cost_basis` (unit_cost)
   *    + `discount_pct`. This is the pricing pyramid; the order reflects it out of the box.
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
    // FREE stock (on hand minus reserved), not raw on-hand.
    // The picker dropdown already computed qty_on_hand - qty_reserved, so the two disagreed inside
    // one dialog: the dropdown said "0 free / out of stock" while the shortfall banner beneath it
    // stayed silent because on-hand was 5. Reserved stock is spoken for; offering it as available
    // is how the same unit gets promised twice.
    const { data } = await supabase.from('warehouse_items').select('product_id, qty_on_hand, qty_reserved')
      .eq('workspace_id', workspaceId).in('product_id', ids);
    for (const r of (data ?? []) as Array<{ product_id: string; qty_on_hand: number | null; qty_reserved: number | null }>) {
      const free = Number(r.qty_on_hand ?? 0) - Number(r.qty_reserved ?? 0);
      out.set(r.product_id, (out.get(r.product_id) ?? 0) + free);
    }
    return out;
  },

  /**
   * Fill in the supplier on a sale's unassigned lines from the purchase orders covering it.
   *
   * For the case the mirror cannot serve: a sale that already existed when the purchase was
   * pointed at it. The link IS the answer to "who supplies this line", and leaving the operator to
   * re-pick a supplier the covering PO already names is asking them to re-enter known data.
   *
   * Only unambiguous matches are stamped (see the function's own comment) and an existing supplier
   * is never overwritten, so calling it after any link is safe. Returns how many lines it filled.
   */
  async stampLineSuppliersFromCover(salesOrderId: string): Promise<number> {
    const { data, error } = await supabase.rpc('stamp_order_line_suppliers_from_cover', { p_order_id: salesOrderId });
    if (error) throw error;
    return Number(data ?? 0);
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

  /**
   * The two facts that decide whether a line can reach the warehouse: WHICH catalog product it
   * is, and whether it belongs in stock at all.
   *
   * Deliberately NOT part of `updateItems`. Neither field is a figure — they change nothing about
   * what was ordered, billed or owed — so they must stay editable after a supplier bill or invoice
   * has been derived from the lines, which is exactly when `updateItems` locks. Without this a
   * free-text line was a dead end: `receive_order_into_warehouse` skips it forever, the order sits
   * at "partially delivered", and the toast telling you to link a product pointed at a UI that
   * refused to open.
   */
  async setOrderItemStock(itemId: string, patch: { productId?: string | null; updateWarehouse?: boolean }): Promise<void> {
    const upd: Record<string, unknown> = {};
    if ('productId' in patch) upd.product_id = patch.productId ?? null;
    if ('updateWarehouse' in patch) upd.update_warehouse = patch.updateWarehouse;
    if (Object.keys(upd).length === 0) return;
    const { error } = await supabase.from('order_items').update(upd).eq('id', itemId);
    if (error) throw error;
  },

  /**
   * The customs identity of a line: its commodity code and its net mass.
   *
   * Like `setOrderItemStock`, and for the same reason, this is deliberately NOT part of
   * `updateItems`. Neither field is a figure — they change nothing about what was ordered, billed
   * or owed — so they must stay editable after a supplier bill has been derived from the lines,
   * which is precisely when a clearance turns out to need them and `updateItems` refuses.
   *
   * `order_items.taric_code` is a SNAPSHOT, not a lookup: the nomenclature is republished monthly
   * and a past order must keep the code it was cleared under. That is why this writes the line and
   * not the product — and why the Customs card reads the line rather than re-reading the catalog.
   */
  async setOrderItemCustoms(itemId: string, patch: { taricCode?: string | null; netMassKg?: number | null }): Promise<void> {
    const upd: Record<string, unknown> = {};
    if ('taricCode' in patch) upd.taric_code = patch.taricCode || null;
    if ('netMassKg' in patch) upd.net_mass_kg = patch.netMassKg ?? null;
    if (Object.keys(upd).length === 0) return;
    const { error } = await supabase.from('order_items').update(upd).eq('id', itemId);
    if (error) throw error;
  },

  /** The lines a clearance would stall on: no commodity code, or no net mass. Both are required —
   *  the customs preview counts them, so the card that reports the gap can also close it. */
  async listUnclassifiedLines(orderId: string): Promise<Array<{
    id: string; description: string; quantity: number; taric_code: string | null; net_mass_kg: number | null;
  }>> {
    const { data, error } = await supabase.from('order_items')
      .select('id, description, quantity, taric_code, net_mass_kg')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string; description: string; quantity: number; taric_code: string | null; net_mass_kg: number | null }>)
      .filter((l) => !l.taric_code || l.net_mass_kg == null);
  },

  /** Product id → catalog name, so a linked order line can say WHAT it points at. */
  async getProductNames(productIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const { data } = await supabase.from('products').select('id, name').in('id', ids);
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) out.set(p.id, p.name);
    return out;
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
    // What has been PAID comes from the allocation ledger, not from payments that happen to carry
    // this order_id.
    // The old query subtracted only payments tagged with BOTH order_id and a matching
    // counterparty_company_id, so a bill settled from Payables, from the Expenses Inbox, or by
    // on-account credit was invisible: "you still owe X" and a live Pay button persisted after the
    // debt was already paid, inviting a second payment. payment_allocations is the settlement
    // ledger (the same one get_order_settlements reads); supplier_bills.order_id ties a bill to
    // this order.
    const supplierIds = [...bySup.keys()];
    const paid = new Map<string, number>();

    // (a) allocations against supplier bills belonging to this order
    const { data: orderBills } = await supabase.from('supplier_bills')
      .select('id, supplier_company_id').eq('order_id', orderId);
    const billOwner = new Map<string, string>();
    for (const b of (orderBills ?? []) as Array<{ id: string; supplier_company_id: string | null }>) {
      if (b.supplier_company_id) billOwner.set(b.id, b.supplier_company_id);
    }
    if (billOwner.size > 0) {
      const { data: allocs } = await supabase.from('payment_allocations')
        .select('supplier_bill_id, amount').in('supplier_bill_id', [...billOwner.keys()]);
      for (const a of (allocs ?? []) as Array<{ supplier_bill_id: string | null; amount: number }>) {
        const owner = a.supplier_bill_id ? billOwner.get(a.supplier_bill_id) : null;
        if (owner) paid.set(owner, (paid.get(owner) ?? 0) + Number(a.amount ?? 0));
      }
    }

    // (b) money-out tagged directly to the order with no bill in between (a direct supplier
    //     payment against the order). Kept so nothing that WAS counted stops being counted.
    const { data: pays } = await supabase.from('payments')
      .select('id, counterparty_company_id, amount').eq('order_id', orderId).eq('direction', 'out');
    const directIds = ((pays ?? []) as Array<{ id: string }>).map((p) => p.id);
    const allocatedPaymentIds = new Set<string>();
    if (directIds.length > 0) {
      const { data: pa } = await supabase.from('payment_allocations')
        .select('payment_id').in('payment_id', directIds);
      for (const r of (pa ?? []) as Array<{ payment_id: string }>) allocatedPaymentIds.add(r.payment_id);
    }
    for (const p of (pays ?? []) as Array<{ id: string; counterparty_company_id: string | null; amount: number }>) {
      // Skip anything already counted through its allocation above — otherwise a bill-settling
      // payment tagged with the order would be double-subtracted.
      if (allocatedPaymentIds.has(p.id)) continue;
      if (p.counterparty_company_id) {
        paid.set(p.counterparty_company_id, (paid.get(p.counterparty_company_id) ?? 0) + Number(p.amount));
      }
    }
    void supplierIds;
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
    // Ordered, so "first row wins" means NEWEST. `updated_at` was already selected and unused,
    // and without the ordering the kept row was arbitrary — "Discount (off list)" was computed
    // against a random historical price and could change between two loads of the same order.
    const { data } = await supabase.from('product_prices').select('product_id, list_price, updated_at')
      .in('product_id', ids).order('updated_at', { ascending: false });
    const m = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ product_id: string; list_price: number | null }>) {
      if (r.list_price != null && !m.has(r.product_id)) m.set(r.product_id, Number(r.list_price));
    }
    return m;
  },

  /**
   * Set per-line delivered quantities and auto-advance the order's fulfilment status:
   *   nothing delivered → confirmed · some → partially_fulfilled · all → fulfilled.
   * (Stays out of 'draft'/'cancelled'.)
   *
   * ONE call, ONE transaction. This used to loop over the lines calling `deliver_order_line`
   * and `throw` on the first error. Each call was atomic, but the LOOP was not: a failure on
   * line 3 left lines 1 and 2 already delivered — stock moved out of the warehouse,
   * `quantity_delivered` written, allocations dispatched — and the operator was told only that
   * the save failed, with no way to know how far it got. That is pipeline convention #3, "no
   * two-call patterns that can crash mid-way".
   *
   * `deliver_order_lines` runs the same per-line function inside a single transaction, so an
   * exception on any line rolls the whole delivery back.
   *
   * #320: this writes a PICKING marker and nothing else — no warehouse stock moves from here.
   * Goods may only leave against a fiscal accompanying document, so stock is moved by
   * `issue_delivery_note` (Δελτίο Αποστολής, myDATA 9.3), by `mark_invoice_issued` on an
   * order-linked invoice (τιμολόγιο–δελτίο αποστολής), or by `receive_order_into_warehouse` on
   * the purchase side. All three go through `_deliver_order_line_core(..., true)`, which the
   * public RPC cannot reach — the gate is the absence of a parameter, not a default.
   */
  async setDelivery(orderId: string, deliveries: Array<{ itemId: string; quantityDelivered: number }>): Promise<OrderStatus> {
    const { data, error } = await supabase.rpc('deliver_order_lines', {
      p_order: orderId,
      p_lines: deliveries.map((d) => ({
        item_id: d.itemId,
        qty: Math.max(0, d.quantityDelivered),
      })),
    });
    if (error) throw error;
    return (data as OrderStatus) ?? 'confirmed';
  },
};
