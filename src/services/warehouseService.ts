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
  }): Promise<void> {
    const { error } = await supabase.from('warehouse_items').insert({
      workspace_id: input.workspaceId,
      warehouse_id: input.warehouse_id,
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit ?? 'pcs',
      qty_on_hand: input.qty_on_hand ?? 0,
      reorder_point: input.reorder_point ?? 0,
      location: input.location ?? null,
      product_id: input.product_id ?? null,
    });
    if (error) throw error;
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
};
