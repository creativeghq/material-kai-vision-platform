import { supabase } from '@/integrations/supabase/client';

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
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;   // snapshot cost/unit (margin before invoicing)
  measurement_unit_code: string | null;  // unit of measure (item, m2, kg…)
  vat_percent?: number | null;
  vat_category?: number | null;
  net_value: number;
  vat_amount: number;
  line_total: number;
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
}

export const ordersService = {
  async list(opts: {
    workspaceId: string;
    orderType?: OrderType;
    status?: OrderStatus;
    companyId?: string;
    contactId?: string;
    projectId?: string;
  }): Promise<OrderListRow[]> {
    let q = supabase
      .from('orders')
      .select('*')
      .eq('workspace_id', opts.workspaceId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (opts.orderType) q = q.eq('order_type', opts.orderType);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    if (opts.companyId) q = q.or(`customer_company_id.eq.${opts.companyId},supplier_company_id.eq.${opts.companyId}`);
    if (opts.contactId) q = q.or(`customer_contact_id.eq.${opts.contactId},supplier_contact_id.eq.${opts.contactId}`);
    const { data, error } = await q;
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
    return rows.map((r) => ({
      ...r,
      party_name:
        cmap.get(r.customer_company_id ?? '') ?? cmap.get(r.supplier_company_id ?? '') ??
        ctmap.get(r.customer_contact_id ?? '') ?? ctmap.get(r.supplier_contact_id ?? '') ?? null,
    }));
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
  }): Promise<Array<{ id: string; order_number: string | null; order_type: OrderType; party_name: string | null; total: number; settled: number; outstanding: number; currency: string; status: OrderStatus; created_at: string }>> {
    const list = await this.list({ workspaceId: opts.workspaceId, companyId: opts.companyId, contactId: opts.contactId });
    const live = list.filter((o) => o.status !== 'draft' && o.status !== 'cancelled');
    if (live.length === 0) return [];
    const ids = live.map((o) => o.id);

    // Batch the finance lookups (3 queries total, not 3 per order). We only need presence of an
    // invoice/bill and the settled amount — not the full getOrderFinance payload.
    const [inv, bills, pays] = await Promise.all([
      supabase.from('invoices').select('order_id').in('order_id', ids),
      supabase.from('supplier_bills').select('order_id').in('order_id', ids),
      supabase.from('payments').select('order_id, direction, amount').in('order_id', ids),
    ]);
    const invoiced = new Set<string>((inv.data ?? []).map((r: any) => r.order_id));
    (bills.data ?? []).forEach((r: any) => invoiced.add(r.order_id));
    const settledIn = new Map<string, number>();
    const settledOut = new Map<string, number>();
    for (const p of (pays.data ?? []) as Array<{ order_id: string; direction: 'in' | 'out'; amount: number }>) {
      const map = p.direction === 'in' ? settledIn : settledOut;
      map.set(p.order_id, (map.get(p.order_id) ?? 0) + Number(p.amount));
    }

    return live
      .filter((o) => !invoiced.has(o.id))
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
        };
      })
      .filter((r) => r.outstanding > 0.005);
  },

  async get(id: string): Promise<{ order: Order; items: OrderItem[] }> {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error) throw error;
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', id).order('sort_order', { ascending: true });
    return { order: order as Order, items: (items ?? []) as OrderItem[] };
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
    items: NewOrderItem[];
  }): Promise<string> {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const lines = input.items.map((it) => {
      const net = r2((it.quantity || 0) * (it.unit_price || 0));
      const pct = it.vat_percent ?? 0;
      const vat = r2(net * pct / 100);
      return { it, net, vat, pct };
    });
    const subtotal = r2(lines.reduce((a, l) => a + l.net, 0));
    const vatTotal = r2(lines.reduce((a, l) => a + l.vat, 0));
    const total = r2(subtotal + vatTotal);
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
        notes: input.notes ?? null,
      })
      .select('id')
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
        measurement_unit_code: l.it.measurement_unit_code ?? null,
        vat_percent: l.pct,
        vat_category: l.it.vat_category ?? null,
        net_value: l.net,
        vat_amount: l.vat,
        line_total: l.net,      // net per line (gross sits on the order total)
        update_warehouse: l.it.update_warehouse ?? true,
        sort_order: i,
      }));
      const { error: itErr } = await supabase.from('order_items').insert(itemRows);
      if (itErr) throw itErr;
    }
    return orderId;
  },

  async getOrderFinance(orderId: string): Promise<{
    invoices: Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    supplierBills: Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>;
    payments: Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; method: string | null }>;
    received: number;
    paid_out: number;
    profit: number;
  }> {
    const [inv, bills, pay] = await Promise.all([
      supabase.from('invoices').select('id, internal_number, status, total, amount_due, currency').eq('order_id', orderId),
      supabase.from('supplier_bills').select('id, supplier_bill_number, status, total, amount_due, currency').eq('order_id', orderId),
      supabase.from('payments').select('id, direction, amount, currency, paid_at, method').eq('order_id', orderId).order('paid_at', { ascending: false }),
    ]);
    const payments = (pay.data ?? []) as Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; paid_at: string; method: string | null }>;
    const received = payments.filter((p) => p.direction === 'in').reduce((a, p) => a + Number(p.amount), 0);
    const paid_out = payments.filter((p) => p.direction === 'out').reduce((a, p) => a + Number(p.amount), 0);
    return {
      invoices: (inv.data ?? []) as Array<{ id: string; internal_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      supplierBills: (bills.data ?? []) as Array<{ id: string; supplier_bill_number: string | null; status: string; total: number; amount_due: number; currency: string }>,
      payments, received, paid_out, profit: received - paid_out,
    };
  },

  async setStatus(id: string, status: OrderStatus): Promise<void> {
    const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  /** Replace an order's line items and recompute its totals (draft/un-invoiced orders). */
  async updateItems(orderId: string, workspaceId: string, items: NewOrderItem[]): Promise<void> {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const lines = items.map((it) => {
      const net = r2((it.quantity || 0) * (it.unit_price || 0));
      const pct = it.vat_percent ?? 0;
      return { it, net, vat: r2(net * pct / 100), pct };
    });
    const subtotal = r2(lines.reduce((a, l) => a + l.net, 0));
    const vatTotal = r2(lines.reduce((a, l) => a + l.vat, 0));
    await supabase.from('order_items').delete().eq('order_id', orderId);
    if (lines.length) {
      const { error: itErr } = await supabase.from('order_items').insert(lines.map((l, i) => ({
        order_id: orderId, workspace_id: workspaceId, product_id: l.it.product_id ?? null,
        description: l.it.description, quantity: l.it.quantity, unit_price: l.it.unit_price, unit_cost: l.it.unit_cost ?? null,
        measurement_unit_code: l.it.measurement_unit_code ?? null,
        vat_percent: l.pct, vat_category: l.it.vat_category ?? null,
        net_value: l.net, vat_amount: l.vat, line_total: l.net, update_warehouse: l.it.update_warehouse ?? true, sort_order: i,
      })));
      if (itErr) throw itErr;
    }
    const { error } = await supabase.from('orders')
      .update({ subtotal_net: subtotal, vat_amount: vatTotal, total: r2(subtotal + vatTotal), updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
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
    const { data: prod } = await supabase.from('products').select('cost').eq('id', opts.productId).maybeSingle();
    // NB: products.measurement_unit_code is the integer myDATA code, NOT our text unit label
    // (item/m²/…), so we don't seed the line's unit from it — the user picks it.
    const unit: string | null = null;
    const cost = prod?.cost != null ? Number(prod.cost) : null;
    if (opts.orderType === 'purchase') {
      return { unit_price: cost, unit_cost: cost, discount_pct: null, measurement_unit_code: unit };
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
        measurement_unit_code: unit,
      };
    } catch {
      return { unit_price: null, unit_cost: cost, discount_pct: null, measurement_unit_code: unit };
    }
  },

  /** Set / clear a product's primary supplier (the manual "+ supplier" on an order line). */
  async setProductSupplier(productId: string, supplierCompanyId: string | null): Promise<void> {
    const { error } = await supabase.from('products').update({ supplier_company_id: supplierCompanyId }).eq('id', productId);
    if (error) throw error;
  },

  /** Resolve the supplier (id + name) for a set of products, for the order detail's per-line badge. */
  async getProductSuppliers(productIds: string[]): Promise<Map<string, { id: string; name: string }>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    const out = new Map<string, { id: string; name: string }>();
    if (ids.length === 0) return out;
    const { data: prods } = await supabase.from('products').select('id, supplier_company_id').in('id', ids);
    const supIds = [...new Set((prods ?? []).map((p: any) => p.supplier_company_id).filter(Boolean))] as string[];
    if (supIds.length === 0) return out;
    const { data: comps } = await supabase.from('crm_companies').select('id, name').in('id', supIds);
    const names = new Map<string, string>((comps ?? []).map((c: any) => [c.id, c.name]));
    for (const p of (prods ?? []) as Array<{ id: string; supplier_company_id: string | null }>) {
      if (p.supplier_company_id && names.has(p.supplier_company_id)) {
        out.set(p.id, { id: p.supplier_company_id, name: names.get(p.supplier_company_id)! });
      }
    }
    return out;
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
