import { supabase } from '@/integrations/supabase/client';

import type { Product } from '@/components/features/products/types';

/**
 * The sanctioned single-product read (#368 PD-2).
 *
 * WHAT THIS REPLACES. The Related tab opened a stacked modal by running
 * `.from('products').select('*')`, ignoring `error`, and casting the row straight to `Product`.
 * Three defects in four lines:
 *
 *   - `select('*')` is every column, and `products` carries `cost`, `cost_source`,
 *     `markup_percent`, `supplier_company_id` and `attributes_raw` (the raw supplier feed).
 *     The RLS grant on the table is workspace MEMBERSHIP, so those went to anyone in the
 *     workspace — a warehouse hand, a project client — the moment they clicked a recommendation.
 *     The modal's own permission model gates exactly that data everywhere else.
 *   - the ignored `error` is the swallowed-failure signature: a failed fetch left the previous
 *     product on screen, or opened an empty modal, with nothing said.
 *   - the cast asserted a shape the row does not have. `Product` carries `images`, `pricing`,
 *     `stock` and `tags`, none of which are columns.
 *
 * `get_product_detail` answers with an allowlisted projection, walks the jsonb for internal
 * keys, and verifies membership against the caller's JWT rather than trusting the id — so a
 * recommendation for a product in another workspace returns null instead of its contents.
 */

export interface ProductDetail extends Partial<Product> {
  id: string;
  name: string;
  workspace_id?: string | null;
  /** True when the RPC judged the caller entitled to cost/margin/supplier data. */
  viewer_can_see_internal?: boolean;
  cost?: number | null;
  cost_currency?: string | null;
}

/** The cost basis of one product, as `get_product_costs` returns it. */
export interface ProductCost {
  cost: number | null;
  cost_currency: string | null;
  cost_source: string | null;
  cost_updated_at: string | null;
  markup_percent: number | null;
}

export const productDetailService = {
  /**
   * Returns null when the product does not exist OR the caller may not see it — deliberately
   * the same answer, so an id cannot be probed. Throws on a real transport/permission failure
   * so the caller can say so rather than rendering an empty shell.
   */
  async fetch(productId: string): Promise<ProductDetail | null> {
    if (!productId) return null;
    const { data, error } = await supabase.rpc('get_product_detail' as never, {
      p_product_id: productId,
    } as never);
    if (error) throw error;
    if (!data) return null;
    return data as unknown as ProductDetail;
  },

  /**
   * The cost basis for a set of products, keyed by product id.
   *
   * `products.cost`, `cost_currency`, `cost_source`, `cost_updated_at` and `markup_percent` are
   * not selectable from `products` by `authenticated` at all (#358) — this RPC is the only path
   * the browser has to them, and it gates per row on `is_workspace_sell_side`.
   *
   * A product the caller is not sell-side for is ABSENT from the map, and a failed read returns
   * an empty one. Both mean "cost unknown"; neither means "cost is zero". Render a dash.
   */
  async costs(productIds: Array<string | null | undefined>): Promise<Map<string, ProductCost>> {
    const ids = [...new Set(productIds.filter(Boolean))] as string[];
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.rpc('get_product_costs' as never, {
      p_product_ids: ids,
    } as never);
    if (error) {
      console.error('[productDetailService] get_product_costs failed - cost is unknown, not zero:', error);
      return new Map();
    }
    const out = new Map<string, ProductCost>();
    for (const row of (data ?? []) as Array<ProductCost & { product_id: string }>) {
      out.set(row.product_id, {
        cost: row.cost != null ? Number(row.cost) : null,
        cost_currency: row.cost_currency ?? null,
        cost_source: row.cost_source ?? null,
        cost_updated_at: row.cost_updated_at ?? null,
        markup_percent: row.markup_percent != null ? Number(row.markup_percent) : null,
      });
    }
    return out;
  },
};
