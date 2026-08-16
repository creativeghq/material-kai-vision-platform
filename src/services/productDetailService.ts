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
};
