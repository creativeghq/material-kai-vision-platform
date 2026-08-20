import { supabase } from '@/integrations/supabase/client';

export interface WorkspacePrice {
  mode: 'own_product' | 'operator_catalog';
  audience?: 'seller' | 'buyer';
  /** What this workspace pays (its cost basis, resolved down the resale chain). */
  cost_basis: number | null;
  base_price: number | null;
  /** This workspace's retail (explicit list_price, else computed cost×markup). */
  retail: number | null;
  retail_source?: string;
  discount_pct?: number;
  /** retail × (1 − discount) — equals retail when no customer is passed. */
  final_sell: number | null;
  suggested_sell?: number | null;
  margin_amount: number | null;
  margin_pct: number | null;
  currency: string;
  supply_mode?: string;
  /** True when no sell price can be produced (no explicit list, no markupable cost).
   *  The line becomes a "call for price" candidate. */
  unpriced?: boolean;
  /** The product's owning workspace (products.workspace_id) — the upstream RFQ target
   *  when this is operator_catalog. Seller audience only. */
  owner_workspace_id?: string | null;
}

export const marketplacePricingService = {
  /** Resolve this workspace's Purchase (cost_basis) + Retail + margin for a product
   *  (operator base resolved down the resale chain). Optional customer applies discount. */
  async getProductPrice(
    workspaceId: string,
    productId: string,
    opts: {
      companyId?: string | null;
      contactId?: string | null;
      /** #374 Phase 4 — which variant to price. Omit for the product-wide row. */
      variantKey?: string | null;
    } = {},
  ): Promise<WorkspacePrice | null> {
    const { data, error } = await supabase.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_company_id: opts.companyId ?? undefined,
      p_contact_id: opts.contactId ?? undefined,
      p_variant_key: opts.variantKey ?? null,
    });
    if (error) throw error;
    return (data as unknown as WorkspacePrice) ?? null;
  },

  /** Set THIS workspace's retail (list_price) for a product — per-workspace catalog price.
   *  Works for the product owner AND a reseller pricing a resold product. */
  async setListPrice(
    workspaceId: string,
    productId: string,
    listPrice: number | null,
    opts: {
      currency?: string;
      unit?: string | null;
      discountPercent?: number | null;
      /**
       * #374 Phase 4 — WHICH variant this price is for. null (the default) is the
       * "applies to any variant" row, which is what every caller wrote before this existed;
       * the unique index is (workspace_id, product_id, variant_key) NULLS NOT DISTINCT
       * precisely because those are different prices rather than duplicates.
       */
      variantKey?: string | null;
    } = {},
  ): Promise<void> {
    const { error } = await supabase.from('product_prices').upsert({
      workspace_id: workspaceId,
      product_id: productId,
      variant_key: opts.variantKey ?? null,
      list_price: listPrice,
      currency: opts.currency ?? 'EUR',
      unit: opts.unit ?? null,
      // The catalog discount shown on the product (ProductPricingCard / PriceLookupDrawer).
      // This is NOT the discount the pricing engine applies — verified against the live
      // RPC, `get_product_price_for_workspace` resolves discount from the CUSTOMER only
      // (crm_contacts/crm_companies override → pricing_level_discounts → workspace level) and
      // never reads this column, returning discount_source 'none' when only this is set.
      // `discount_price` is no longer written here or anywhere: it is GENERATED ALWAYS from
      // list_price + discount_percent, so the pair can no longer go inconsistent and sending
      // the column raises 428C9.
      ...(opts.discountPercent !== undefined ? { discount_percent: opts.discountPercent } : {}),
      confirmed_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,product_id,variant_key' });
    if (error) throw error;
  },
};
