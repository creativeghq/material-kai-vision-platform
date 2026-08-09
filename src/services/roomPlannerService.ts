/**
 * Room planner persistence (#321 M3, #259 Phase 1).
 *
 * Items are READ through `room_layout_items_resolved`, never from the base table, because the
 * footprint a plan draws is DERIVED — an explicit override, else the product's measured 3D model
 * dimensions, else a neutral default. Storing the footprint on the item would freeze a copy of the
 * product's real size, and the plan would keep drawing last year's sofa at last year's size with
 * nothing to flag it. The view is `security_invoker = on`, so it inherits the tables' RLS
 * (CLAUDE.md invariant 3) rather than becoming a way around it.
 *
 * Writes go to the base table, which is the only thing that has authored columns at all.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { modelPublicUrl } from '@/services/product3dService';

export type RoomLayout = Tables<'room_layouts'>;

/** A layout item with its footprint already resolved. Mirrors `room_layout_items_resolved`. */
export interface ResolvedLayoutItem {
  id: string;
  workspace_id: string;
  layout_id: string;
  product_id: string;
  x_m: number;
  y_m: number;
  rotation_deg: number;
  sort_order: number;
  footprint_width_m: number | null;
  footprint_depth_m: number | null;
  effective_width_m: number;
  effective_depth_m: number;
  /** Where the footprint came from — so the UI can say "measured" rather than imply precision. */
  footprint_source: 'override' | 'model' | 'default';
  product_name: string;
}

export const roomPlannerService = {
  async listLayouts(workspaceId: string): Promise<RoomLayout[]> {
    const { data, error } = await supabase
      .from('room_layouts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createLayout(workspaceId: string, name: string): Promise<RoomLayout> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('room_layouts')
      .insert({ workspace_id: workspaceId, name: name.trim() || 'Untitled room', created_by: auth.user?.id ?? null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateLayout(id: string, patch: Partial<Pick<RoomLayout, 'name' | 'room_width_m' | 'room_depth_m' | 'notes'>>): Promise<void> {
    const { error } = await supabase
      .from('room_layouts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteLayout(id: string): Promise<void> {
    const { error } = await supabase.from('room_layouts').delete().eq('id', id);
    if (error) throw error;
  },

  /** Items with derived footprints. Read path is the view, always. */
  async listItems(layoutId: string): Promise<ResolvedLayoutItem[]> {
    const { data, error } = await supabase
      .from('room_layout_items_resolved' as never)
      .select('*')
      .eq('layout_id', layoutId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ResolvedLayoutItem[];
  },

  /**
   * Model URLs for the products in a layout, keyed by product_id (#259 Phase 2).
   *
   * One query for the whole room rather than one per item — a 20-piece layout would otherwise open
   * 20 round trips before the first frame. Only glb/gltf: usdz is the iOS AR format and cannot be
   * rendered in a WebGL canvas.
   */
  async modelUrlsForProducts(workspaceId: string, productIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (productIds.length === 0) return out;
    const { data, error } = await supabase
      .from('product_3d_models')
      .select('product_id, format, storage_bucket, storage_path, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'ready')
      .in('format', ['glb', 'gltf'])
      .in('product_id', [...new Set(productIds)]);
    if (error) throw error;
    for (const row of data ?? []) {
      // Prefer glb when a product has both — it is the format the rest of the platform renders,
      // so its measurements are the ones a user has actually seen.
      if (out.has(row.product_id) && row.format !== 'glb') continue;
      out.set(row.product_id, modelPublicUrl(row));
    }
    return out;
  },

  async addItem(
    workspaceId: string,
    layoutId: string,
    productId: string,
    at: { xM: number; yM: number },
    sortOrder: number,
  ): Promise<void> {
    const { error } = await supabase.from('room_layout_items').insert({
      workspace_id: workspaceId,
      layout_id: layoutId,
      product_id: productId,
      x_m: at.xM,
      y_m: at.yM,
      sort_order: sortOrder,
    });
    if (error) throw error;
  },

  /** Position/rotation only — the footprint is not ours to write unless it is an explicit override. */
  async moveItem(id: string, at: { xM: number; yM: number; rotationDeg?: number }): Promise<void> {
    const { error } = await supabase
      .from('room_layout_items')
      .update({
        x_m: at.xM,
        y_m: at.yM,
        ...(at.rotationDeg !== undefined ? { rotation_deg: at.rotationDeg } : {}),
      })
      .eq('id', id);
    if (error) throw error;
  },

  async removeItem(id: string): Promise<void> {
    const { error } = await supabase.from('room_layout_items').delete().eq('id', id);
    if (error) throw error;
  },
};
