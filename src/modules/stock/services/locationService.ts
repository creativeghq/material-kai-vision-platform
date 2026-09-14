/**
 * Warehouse locations, putaway and the stocktake freeze (#428).
 *
 * `warehouses` was a flat list of buildings, so there were no bins, no location barcodes, no
 * putaway and no pick sequence. Everything here follows from that one missing table.
 */
import { supabase } from '@/integrations/supabase/client';

import type { PutawaySuggestion, CountDrift, LocationKind } from '@/modules/stock/locationRules';

export type {
  PutawayStatus, PutawaySuggestion, LocationKind, CountDriftStatus, CountDrift,
} from '@/modules/stock/locationRules';
export {
  LOCATION_KIND_LABEL, putawayDirects, putawayIsScannable, countNeedsFreezing, countHasDrifted,
} from '@/modules/stock/locationRules';

export interface WarehouseLocation {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  code: string;
  barcode: string | null;
  kind: LocationKind;
  path: string | null;
  capacity_kg: number | null;
  count_frequency_days: number | null;
  next_count_due: string | null;
  is_active: boolean;
}

export interface PutawayRule {
  id: string;
  workspace_id: string;
  warehouse_id: string | null;
  sequence: number;
  product_id: string | null;
  category_id: string | null;
  location_id: string | null;
  basis: 'fixed' | 'capacity' | 'dimensions' | 'velocity';
  is_active: boolean;
}

export const locationService = {
  async list(workspaceId: string): Promise<WarehouseLocation[]> {
    const { data, error } = await supabase
      .from('warehouse_locations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('path', { nullsFirst: false })
      .order('code');
    if (error) throw error;
    return (data ?? []) as WarehouseLocation[];
  },

  async create(l: Partial<WarehouseLocation> & { workspace_id: string; warehouse_id: string; code: string }) {
    const { error } = await supabase.from('warehouse_locations').insert(l);
    if (error) throw error;
  },

  async rules(workspaceId: string): Promise<PutawayRule[]> {
    const { data, error } = await supabase
      .from('putaway_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sequence');
    if (error) throw error;
    return (data ?? []) as PutawayRule[];
  },

  async saveRule(r: Partial<PutawayRule> & { workspace_id: string }) {
    const { error } = await supabase.from('putaway_rules').upsert(r, { onConflict: 'id' });
    if (error) throw error;
  },

  /** Where this receipt goes, and which rule said so. */
  async suggestPutaway(itemId: string, quantity?: number): Promise<PutawaySuggestion> {
    const { data, error } = await supabase.rpc('suggest_putaway' as never, {
      p_item: itemId,
      p_quantity: quantity ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as PutawaySuggestion;
  },

  /**
   * Freeze a count.
   *
   * The claim IS the stamp — `where frozen_at is null` plus a row count — so a lost race aborts
   * instead of moving the line everything after it is measured against.
   */
  async freezeCount(countId: string) {
    const { data, error } = await supabase.rpc('freeze_stock_count' as never, {
      p_count: countId,
    } as never);
    if (error) throw error;
    return data as unknown as { status: string; lines?: number; reason: string };
  },

  /** What moved after the freeze — the whole reason to freeze. */
  async countDrift(countId: string): Promise<CountDrift> {
    const { data, error } = await supabase.rpc('stock_count_drift' as never, {
      p_count: countId,
    } as never);
    if (error) throw error;
    return data as unknown as CountDrift;
  },
};
