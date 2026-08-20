import { supabase } from '@/integrations/supabase/client';
import { convertToBase, convertPrice, availableUnits, type ProductUom } from '@/lib/uom';

/**
 * Units of measure and quantity price breaks for a product.
 *
 * The platform buys and sells the same article in different units — a gypsum board is invoiced
 * per m², counted per piece and shipped per pallet — and until now nothing related them. A
 * supplier line of 288 m² became 288 *pieces* on the stock row, because `record_stock_movement`
 * takes a bare number and no unit. That is the platform's worst failure shape: a wrong number
 * that is a perfectly valid number, which no constraint and no typecheck can see.
 *
 * The ladder is DERIVED in SQL (`get_product_uom`), never assembled here. Only the irreducible
 * facts are stored — pieces per box, boxes per pallet — and area per piece comes from the
 * product's own dimensions. TypeScript formats; SQL derives.
 *
 * The one rule callers must respect: **a missing factor is not 1.** `convertToBase` returns null
 * when the ladder cannot relate two units, and that has to be surfaced, never defaulted.
 */

export interface ProductPackaging {
  product_id: string;
  workspace_id: string;
  base_unit: string;
  pieces_per_box: number | null;
  boxes_per_pallet: number | null;
  m2_per_piece_override: number | null;
  kg_per_piece: number | null;
  notes: string | null;
}

export interface PriceBreak {
  id: string;
  workspace_id: string;
  product_id: string;
  min_quantity: number;
  unit: string;
  discount_percent: number | null;
  unit_price: number | null;
  currency: string;
  level_key: string | null;
  is_active: boolean;
  notes: string | null;
  /**
   * #374 — which variant this break is for. null is the "applies to any variant" break, which
   * is what every row was before. `get_product_price_break` prefers an exact-variant row and
   * falls back to the null one, so "5 pallets of anything" and "5 pallets of Nero" coexist.
   */
  variant_key: string | null;
}

export const productUomService = {
  /** The derived ladder. Safe to call for a product with no packaging row — returns base only. */
  async getUom(productId: string): Promise<ProductUom> {
    const { data, error } = await supabase.rpc('get_product_uom', { p_product_id: productId });
    if (error) throw error;
    return data as unknown as ProductUom;
  },

  async getPackaging(productId: string): Promise<ProductPackaging | null> {
    const { data, error } = await supabase
      .from('product_packaging').select('*').eq('product_id', productId).maybeSingle();
    if (error) throw error;
    return (data ?? null) as ProductPackaging | null;
  },

  async savePackaging(
    workspaceId: string,
    productId: string,
    patch: Partial<Omit<ProductPackaging, 'product_id' | 'workspace_id'>>,
  ): Promise<void> {
    const { error } = await supabase.from('product_packaging').upsert(
      { product_id: productId, workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'product_id' },
    );
    if (error) throw error;
  },

  /** @see src/lib/uom.ts — pure, and the only place the null-means-refuse rule is written. */
  convertToBase,
  convertPrice,
  availableUnits,

  // ── Quantity price breaks ───────────────────────────────────────────────────────────────

  /** Breaks for one variant. Pass `variantKey = null` for the product-wide ladder. */
  async listBreaks(workspaceId: string, productId: string, variantKey: string | null = null): Promise<PriceBreak[]> {
    const base = supabase
      .from('product_price_breaks').select('*')
      .eq('workspace_id', workspaceId).eq('product_id', productId);
    const { data, error } = await (variantKey ? base.eq('variant_key', variantKey) : base.is('variant_key', null))
      .order('min_quantity');
    if (error) throw error;
    return (data ?? []) as PriceBreak[];
  },

  async saveBreak(row: Partial<PriceBreak> & { workspace_id: string; product_id: string }): Promise<void> {
    const payload = {
      workspace_id: row.workspace_id,
      product_id: row.product_id,
      min_quantity: row.min_quantity,
      unit: row.unit ?? 'pcs',
      // The CHECK constraint allows exactly one of these; normalise blank input to null so a
      // half-filled form fails loudly at the constraint instead of storing a zero discount.
      discount_percent: row.discount_percent ?? null,
      unit_price: row.unit_price ?? null,
      currency: row.currency ?? 'EUR',
      level_key: row.level_key ?? null,
      variant_key: row.variant_key ?? null,
      is_active: row.is_active ?? true,
      notes: row.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = row.id
      ? await supabase.from('product_price_breaks').update(payload).eq('id', row.id)
      : await supabase.from('product_price_breaks').insert(payload);
    if (error) throw error;
  },

  async deleteBreak(id: string): Promise<void> {
    const { error } = await supabase.from('product_price_breaks').delete().eq('id', id);
    if (error) throw error;
  },

  /** What the resolver would actually charge for this quantity — the same RPC quotes use. */
  async previewPrice(
    workspaceId: string, productId: string, quantity: number, unit: string,
    variantKey: string | null = null,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_audience: 'seller',
      p_quantity: quantity,
      p_unit: unit,
      // The preview must price the SAME variant the breaks above are being edited for, or it
      // reassures the operator with a number the resolver would not actually charge.
      p_variant_key: variantKey,
    });
    if (error) throw error;
    return (data ?? null) as Record<string, unknown> | null;
  },
};

export type { ProductUom };
