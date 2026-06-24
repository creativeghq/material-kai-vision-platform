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
  vat_percent?: number;       // per-line VAT %
  vat_category?: number;      // myDATA VAT category code (1=24%, …)
  update_warehouse?: boolean;
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
        description: l.it.description, quantity: l.it.quantity, unit_price: l.it.unit_price,
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
};
