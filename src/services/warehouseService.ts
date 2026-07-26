import { supabase } from '@/integrations/supabase/client';

export interface Warehouse {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  location: string | null;
  is_default: boolean;
}

export interface WarehouseItem {
  id: string;
  workspace_id: string;
  warehouse_id: string | null;
  product_id: string | null;
  sku: string | null;
  name: string;
  unit: string;
  qty_on_hand: number;
  qty_reserved: number;
  reorder_point: number;
  location: string | null;
  // #207 — catalog depth (Oxygen warehouse_products parity)
  barcode: string | null;
  serial_number: string | null;
  cpv_code: string | null;
  taric_code: string | null;
  mydata_classification_type: string | null;
  mydata_classification_category: string | null;
}

/** The #207 catalog-depth fields, set on create and editable afterwards. */
export interface WarehouseItemCatalogFields {
  barcode?: string | null;
  serial_number?: string | null;
  cpv_code?: string | null;
  taric_code?: string | null;
  mydata_classification_type?: string | null;
  mydata_classification_category?: string | null;
  // Operational fields — editable after creation (previously only settable at create time).
  reorder_point?: number;
  location?: string | null;
  unit?: string;
}

export const warehouseService = {
  // ── Warehouses (#207 multi-warehouse) ──────────────────────────────────────
  async listWarehouses(workspaceId: string): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return (data ?? []) as Warehouse[];
  },

  /** Get-or-create the workspace's default warehouse; returns its id. */
  async ensureDefaultWarehouse(workspaceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('ensure_default_warehouse', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data as string;
  },

  async createWarehouse(input: { workspaceId: string; name: string; code?: string; location?: string; isDefault?: boolean }): Promise<Warehouse> {
    const { data, error } = await supabase.from('warehouses').insert({
      workspace_id: input.workspaceId,
      name: input.name,
      code: input.code ?? null,
      location: input.location ?? null,
      is_default: input.isDefault ?? false,
    }).select('*').single();
    if (error) throw error;
    return data as Warehouse;
  },

  /** Move stock of an item's product into another warehouse (out+in movements). */
  async transfer(fromItemId: string, toWarehouseId: string, quantity: number): Promise<string> {
    const { data, error } = await supabase.rpc('transfer_stock', {
      p_from_item_id: fromItemId, p_to_warehouse_id: toWarehouseId, p_qty: quantity,
    });
    if (error) throw error;
    return data as string;
  },

  // ── Items ───────────────────────────────────────────────────────────────
  async listItems(workspaceId: string, warehouseId?: string): Promise<WarehouseItem[]> {
    let q = supabase.from('warehouse_items').select('*').eq('workspace_id', workspaceId);
    if (warehouseId) q = q.eq('warehouse_id', warehouseId);
    const { data, error } = await q.order('name');
    if (error) throw error;
    return (data ?? []) as WarehouseItem[];
  },

  async createItem(input: {
    workspaceId: string; name: string; warehouse_id: string; sku?: string; unit?: string;
    qty_on_hand?: number; reorder_point?: number; location?: string; product_id?: string | null;
  } & WarehouseItemCatalogFields): Promise<string> {
    const { data, error } = await supabase.from('warehouse_items').insert({
      workspace_id: input.workspaceId,
      warehouse_id: input.warehouse_id,
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit ?? 'pcs',
      qty_on_hand: input.qty_on_hand ?? 0,
      reorder_point: input.reorder_point ?? 0,
      location: input.location ?? null,
      product_id: input.product_id ?? null,
      barcode: input.barcode ?? null,
      serial_number: input.serial_number ?? null,
      cpv_code: input.cpv_code ?? null,
      taric_code: input.taric_code ?? null,
      mydata_classification_type: input.mydata_classification_type ?? null,
      mydata_classification_category: input.mydata_classification_category ?? null,
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  /** Update a stock item's catalog-depth fields (#207 codes/classification) and/or its operational
   *  fields (reorder point, location, unit). Only the keys present in `fields` are written, so a
   *  caller editing just the reorder point never clears the codes and vice-versa. RLS enforces
   *  finance-manager + the 'stock' entitlement (same gate as stock-api). */
  async updateItemCatalog(id: string, fields: WarehouseItemCatalogFields): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const k of [
      'barcode', 'serial_number', 'cpv_code', 'taric_code',
      'mydata_classification_type', 'mydata_classification_category',
      'reorder_point', 'location', 'unit',
    ] as const) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from('warehouse_items').update(patch).eq('id', id);
    if (error) throw error;
  },

  /** Minimal catalog product (name + sku) — used when building stock from a supplier
   *  expense line so the received good is also sellable. Returns the new product id. */
  async createProduct(input: { workspaceId: string; name: string; sku?: string | null; itemType?: 'good' | 'service' }): Promise<string> {
    const { data, error } = await supabase.from('products').insert({
      workspace_id: input.workspaceId,
      name: input.name,
      sku: input.sku ?? null,
      item_type: input.itemType ?? 'good',
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  async recordMovement(itemId: string, direction: 'in' | 'out' | 'adjust', quantity: number, reason?: string): Promise<number> {
    const { data, error } = await supabase.rpc('record_stock_movement', {
      p_item_id: itemId, p_direction: direction, p_quantity: quantity, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as number;
  },

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('warehouse_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Pending products (AI-extracted from inbound expenses → ✓ add / ✗ dismiss) ──
  async listPending(workspaceId: string): Promise<PendingProduct[]> {
    const { data, error } = await supabase.from('warehouse_pending_items')
      .select('*').eq('workspace_id', workspaceId).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PendingProduct[];
  },
  async approvePending(id: string, overrides: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('approve_pending_warehouse_item', { p_id: id, p_overrides: overrides });
    if (error) throw error;
    return data as string;
  },
  async dismissPending(id: string): Promise<void> {
    const { error } = await supabase.rpc('dismiss_pending_warehouse_item', { p_id: id });
    if (error) throw error;
  },
};

export interface PendingProduct {
  id: string; workspace_id: string; inbound_document_id: string | null; raw_description: string | null;
  name: string; sku: string | null; unit: string | null; size: string | null; attributes: string | null;
  quantity: number; unit_cost: number | null; currency: string;
  suggested_sales_price: number | null; sales_price: number | null; category_id: string | null;
  matched_product_id: string | null; add_to_catalog: boolean; target_warehouse_id: string | null;
}
