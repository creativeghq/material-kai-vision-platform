import { supabase } from '@/integrations/supabase/client';

export interface WarehouseItem {
  id: string;
  workspace_id: string;
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
  async listItems(workspaceId: string): Promise<WarehouseItem[]> {
    const { data, error } = await supabase
      .from('warehouse_items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as WarehouseItem[];
  },

  async createItem(input: {
    workspaceId: string; name: string; sku?: string; unit?: string;
    qty_on_hand?: number; reorder_point?: number; location?: string; product_id?: string | null;
  }): Promise<void> {
    const { error } = await supabase.from('warehouse_items').insert({
      workspace_id: input.workspaceId,
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
