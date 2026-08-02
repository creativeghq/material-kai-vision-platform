/**
 * Delivery notes. A note moves goods to a customer; issuing decrements
 * warehouse stock for lines linked to a warehouse item. Issued dispatch notes can be
 * transmitted to myDATA as a 9.3 movement document via `submitFiscal()`.
 */
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

export interface DeliveryNote {
  id: string;
  workspace_id: string;
  kind: 'dispatch' | 'receipt';
  delivery_note_number: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  status: 'draft' | 'issued' | 'invoiced' | 'void';
  issued_at: string | null;
  notes: string | null;
  fiscal_mark: string | null;
  fiscal_status: string | null;
  created_at: string;
}

export interface DeliveryLineInput {
  warehouse_item_id?: string | null;
  product_id?: string | null;
  description: string;
  sku?: string | null;
  quantity: number;
  unit?: string | null;
}

export interface WarehousePick {
  id: string; name: string; sku: string | null; unit: string | null; qty_on_hand: number | null; product_id: string | null;
}

/** One product line of an order that needs to ship, matched against warehouse stock. */
export interface DispatchQueueLine {
  description: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  warehouse_item_id: string | null;
  product_id: string | null;
  qty_on_hand: number | null;   // matched stock on hand; null when the line isn't a stocked item
  shortfall: boolean;           // true when stock is tracked AND on-hand < ordered qty
}

/** A paid, shippable order in the daily dispatch board. */
export interface DispatchQueueOrder {
  invoice_id: string;
  internal_number: string;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  customer_name: string | null;
  ship_to: string | null;
  transport_date: string | null;   // YYYY-MM-DD, drives the day-buckets
  currency: string;
  total: number;
  notes: string | null;
  lines: DispatchQueueLine[];
  has_shortfall: boolean;
  /** Linked dispatch note when one already exists (draft only — issued orders leave the board). */
  dispatch: { id: string; status: string; number: string | null; fiscal_mark: string | null } | null;
}

export const deliveryNotesService = {
  async list(workspaceId: string): Promise<DeliveryNote[]> {
    const { data, error } = await supabase
      .from('delivery_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DeliveryNote[];
  },

  async listWarehouse(workspaceId: string): Promise<WarehousePick[]> {
    const { data } = await supabase
      .from('warehouse_items')
      .select('id, name, sku, unit, qty_on_hand, product_id')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true });
    return (data ?? []) as WarehousePick[];
  },

  async create(workspaceId: string, input: {
    kind?: 'dispatch' | 'receipt';
    customerCompanyId?: string | null;
    customerContactId?: string | null;
    branchCode?: number;
    notes?: string;
    lines: DeliveryLineInput[];
    transportDate?: string;
    transportTime?: string;
    vehicleNumber?: string;
    movePurpose?: string;
    responsible?: string;
    shipFrom?: string;
    shipTo?: string;
    shipFromStreet?: string; shipFromNumber?: string; shipFromPostal?: string; shipFromCity?: string;
    shipToStreet?: string; shipToNumber?: string; shipToPostal?: string; shipToCity?: string;
    shipFromAddressUnitId?: string | null; shipToAddressUnitId?: string | null;
    relatedDocument?: string;
    invoiceId?: string | null;
  }): Promise<string> {
    const { data: dn, error } = await supabase
      .from('delivery_notes')
      .insert({
        workspace_id: workspaceId,
        kind: input.kind ?? 'dispatch',
        customer_company_id: input.customerCompanyId ?? null,
        customer_contact_id: input.customerContactId ?? null,
        invoice_id: input.invoiceId ?? null,
        branch_code: input.branchCode ?? 0,
        notes: input.notes || null,
        transport_date: input.transportDate || null,
        transport_time: input.transportTime || null,
        vehicle_number: input.vehicleNumber || null,
        move_purpose: input.movePurpose || null,
        responsible: input.responsible || null,
        ship_from: input.shipFrom || null,
        ship_to: input.shipTo || null,
        ship_from_street: input.shipFromStreet || null,
        ship_from_number: input.shipFromNumber || null,
        ship_from_postal: input.shipFromPostal || null,
        ship_from_city: input.shipFromCity || null,
        ship_to_street: input.shipToStreet || null,
        ship_to_number: input.shipToNumber || null,
        ship_to_postal: input.shipToPostal || null,
        ship_to_city: input.shipToCity || null,
        ship_from_address_unit_id: input.shipFromAddressUnitId ?? null,
        ship_to_address_unit_id: input.shipToAddressUnitId ?? null,
        related_document: input.relatedDocument || null,
      } as any)
      .select('id')
      .single();
    if (error) throw error;
    const id = (dn as any).id;
    const items = input.lines.filter((l) => l.description.trim() && l.quantity > 0).map((l) => ({
      delivery_note_id: id,
      warehouse_item_id: l.warehouse_item_id ?? null,
      product_id: l.product_id ?? null,
      description: l.description.trim(),
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit: l.unit ?? null,
    }));
    if (items.length) {
      const { error: itErr } = await supabase.from('delivery_note_items').insert(items);
      if (itErr) throw itErr;
    }
    return id;
  },

  /**
   * Issue the note and report WHAT MOVED.
   *
   * The RPC used to return void, and it silently skips any line with no product_id — so the board
   * reported "Shipped · stock decremented" for a note where nothing moved at all, the note left
   * the board, and the goods became untracked. It returns {moved, skipped, skipped_lines} now,
   * the same shape receive_order_into_warehouse already returns.
   */
  async issue(id: string): Promise<{ moved: number; skipped: number; skipped_lines: string[]; delivery_note_number: string | null }> {
    const { data, error } = await supabase.rpc('issue_delivery_note', { p_id: id });
    if (error) throw error;
    const r = (data ?? {}) as any;
    return {
      moved: Number(r.moved ?? 0),
      skipped: Number(r.skipped ?? 0),
      skipped_lines: (r.skipped_lines ?? []) as string[],
      delivery_note_number: r.delivery_note_number ?? null,
    };
  },

  /** Schedule (or clear) an order's ship date — the dispatch board buckets by this. RLS-gated to
   *  finance managers on `invoices`. Pass null to unschedule (back to "No ship date"). */
  async scheduleDispatch(workspaceId: string, invoiceId: string, date: string | null): Promise<void> {
    const { error } = await supabase.from('invoices')
      .update({ transport_date: date }).eq('id', invoiceId).eq('workspace_id', workspaceId);
    if (error) throw error;
  },

  /** Render (or fetch cached) the delivery-note PDF. */
  async generatePdf(id: string, regenerate = false): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('finance-invoice-pdf', { body: { delivery_note_id: id, regenerate } });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.error || 'PDF generation failed');
    return data?.pdf_url ?? null;
  },

  /** Transmit an issued dispatch note to the workspace's legal connector as a myDATA 9.3 movement document. */
  async submitFiscal(id: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-issue-invoice', {
      body: { delivery_note_id: id, submit_fiscal: true },
    });
    if (error) throw await edgeError(error);
    if (data && data.ok === false) throw new Error(data.error || 'myDATA transmission failed');
    return data;
  },

  /** Convert an issued delivery note into a draft invoice (prices via the cascade resolver). */
  async toInvoice(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('delivery_note_to_invoice', { p_id: id });
    if (error) throw error;
    return data as string;
  },

  /**
   * Daily dispatch board — every paid, shippable order (`has_shipping=true`, `status='paid'`)
   * that hasn't yet left the door. An order drops off once its dispatch note is issued; while
   * the note is still a draft it stays on the board (with the draft linked) so the warehouse can
   * issue + print it. Each order's lines are matched to warehouse stock so shortfalls show before
   * picking. Buckets by `transport_date` happen on the client.
   */
  async listDispatchQueue(workspaceId: string): Promise<DispatchQueueOrder[]> {
    const { data: invs, error } = await supabase
      .from('invoices')
      .select('id, internal_number, customer_company_id, customer_contact_id, ship_to, transport_date, currency, total, notes')
      .eq('workspace_id', workspaceId)
      .eq('has_shipping', true)
      .eq('status', 'paid');
    if (error) throw error;
    const orders = (invs ?? []) as any[];
    if (orders.length === 0) return [];

    const invoiceIds = orders.map((o) => o.id);
    const companyIds = [...new Set(orders.map((o) => o.customer_company_id).filter(Boolean))];
    const contactIds = [...new Set(orders.map((o) => o.customer_contact_id).filter(Boolean))];

    const [itemsRes, whRes, dnRes, companiesRes, contactsRes] = await Promise.all([
      supabase.from('invoice_items').select('invoice_id, product_id, description, sku, unit, quantity').in('invoice_id', invoiceIds),
      supabase.from('warehouse_items').select('id, name, sku, qty_on_hand, qty_reserved, product_id').eq('workspace_id', workspaceId),
      supabase.from('delivery_notes').select('id, invoice_id, status, delivery_note_number, fiscal_mark').eq('workspace_id', workspaceId).eq('kind', 'dispatch').in('invoice_id', invoiceIds).neq('status', 'void'),
      companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
      contactIds.length ? supabase.from('crm_contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const itemsByInvoice = new Map<string, any[]>();
    for (const it of (itemsRes.data ?? []) as any[]) {
      const arr = itemsByInvoice.get(it.invoice_id) ?? [];
      arr.push(it); itemsByInvoice.set(it.invoice_id, arr);
    }
    const wh = (whRes.data ?? []) as WarehousePick[];
    const dispatchByInvoice = new Map<string, any>();
    for (const d of (dnRes.data ?? []) as any[]) dispatchByInvoice.set(d.invoice_id, d);
    const companyName = new Map((((companiesRes as any).data ?? []) as any[]).map((c) => [c.id, c.name]));
    const contactName = new Map((((contactsRes as any).data ?? []) as any[]).map((c) => [c.id, c.name]));

    const result: DispatchQueueOrder[] = [];
    for (const o of orders) {
      // An order with an *issued* dispatch note is already out the door — drop it.
      const dn = dispatchByInvoice.get(o.id);
      if (dn && dn.status !== 'draft') continue;

      const rawLines = itemsByInvoice.get(o.id) ?? [];
      const lines: DispatchQueueLine[] = rawLines.map((l) => {
        const match = matchWarehouseItem(l, wh);
        // Free stock across ALL warehouses, not the first matching row's raw on-hand.
        const onHand = freeStockForLine(l, wh);
        const qty = Number(l.quantity ?? 0);
        return {
          description: (l.description ?? '').trim() || 'Item',
          sku: l.sku ?? match?.sku ?? null,
          unit: l.unit ?? null,
          quantity: qty,
          warehouse_item_id: match?.id ?? null,
          product_id: l.product_id ?? match?.product_id ?? null,
          qty_on_hand: onHand,
          // A line that matches NO stock row is short by definition, and is exactly the case a
          // null-tolerant comparison would pass silently.
          shortfall: onHand == null ? qty > 0 : onHand < qty,
        };
      });

      result.push({
        invoice_id: o.id,
        internal_number: o.internal_number,
        customer_company_id: o.customer_company_id ?? null,
        customer_contact_id: o.customer_contact_id ?? null,
        customer_name: (o.customer_company_id && companyName.get(o.customer_company_id))
          || (o.customer_contact_id && contactName.get(o.customer_contact_id)) || null,
        ship_to: o.ship_to ?? null,
        transport_date: o.transport_date ?? null,
        currency: o.currency ?? 'EUR',
        total: Number(o.total ?? 0),
        notes: o.notes ?? null,
        lines,
        has_shortfall: lines.some((l) => l.shortfall),
        dispatch: dn ? { id: dn.id, status: dn.status, number: dn.delivery_note_number ?? null, fiscal_mark: dn.fiscal_mark ?? null } : null,
      });
    }
    return result;
  },

  /** Cut a draft dispatch note from a paid order, matched to warehouse stock and linked back to the invoice. */
  async createDispatchFromOrder(workspaceId: string, order: DispatchQueueOrder): Promise<string> {
    const lines: DeliveryLineInput[] = order.lines
      .filter((l) => l.description.trim() && l.quantity > 0)
      .map((l) => ({
        warehouse_item_id: l.warehouse_item_id,
        product_id: l.product_id,
        description: l.description,
        sku: l.sku,
        quantity: l.quantity,
        unit: l.unit,
      }));
    return this.create(workspaceId, {
      kind: 'dispatch',
      customerCompanyId: order.customer_company_id,
      customerContactId: order.customer_contact_id,
      invoiceId: order.invoice_id,
      transportDate: order.transport_date || undefined,
      shipTo: order.ship_to || undefined,
      relatedDocument: order.internal_number,
      notes: `Order ${order.internal_number}`,
      lines,
    });
  },
};

/** Match an order line to a stock item: product_id → exact SKU → exact name. Null when non-stocked. */
function matchWarehouseItem(line: { product_id?: string | null; sku?: string | null; description?: string | null }, wh: WarehousePick[]): WarehousePick | null {
  if (line.product_id) { const m = wh.find((w) => w.product_id === line.product_id); if (m) return m; }
  if (line.sku) { const s = String(line.sku).toLowerCase().trim(); const m = wh.find((w) => (w.sku ?? '').toLowerCase().trim() === s); if (m) return m; }
  if (line.description) { const d = String(line.description).toLowerCase().trim(); const m = wh.find((w) => (w.name ?? '').toLowerCase().trim() === d); if (m) return m; }
  return null;
}

/**
 * FREE stock for a line, summed across every warehouse that holds it.
 *
 * matchWarehouseItem returns the FIRST matching row, and the shortfall test used its raw
 * qty_on_hand — so a product split across two warehouses raised a false alarm, reserved stock was
 * counted as available (a missed alarm), and a product with no stock row at all yielded
 * `qty_on_hand == null` which the old test read as "no shortfall" — no warning whatsoever for the
 * one case that is certainly short.
 *
 * Returns null only when the line matches NO warehouse row, which the caller treats as a shortfall.
 */
function freeStockForLine(
  line: { product_id?: string | null; sku?: string | null; description?: string | null },
  wh: WarehousePick[],
): number | null {
  const matches = wh.filter((w) => {
    if (line.product_id && w.product_id === line.product_id) return true;
    if (line.sku && (w.sku ?? '').toLowerCase().trim() === String(line.sku).toLowerCase().trim()) return true;
    if (line.description && (w.name ?? '').toLowerCase().trim() === String(line.description).toLowerCase().trim()) return true;
    return false;
  });
  if (matches.length === 0) return null;
  return matches.reduce(
    (sum, w) => sum + (Number((w as any).qty_on_hand ?? 0) - Number((w as any).qty_reserved ?? 0)),
    0,
  );
}
