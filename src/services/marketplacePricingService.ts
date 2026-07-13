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
}

export const marketplacePricingService = {
  /** Resolve this workspace's Purchase (cost_basis) + Retail + margin for a product
   *  (operator base resolved down the resale chain). Optional customer applies discount. */
  async getProductPrice(
    workspaceId: string,
    productId: string,
    opts: { companyId?: string | null; contactId?: string | null } = {},
  ): Promise<WorkspacePrice | null> {
    const { data, error } = await supabase.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_company_id: opts.companyId ?? undefined,
      p_contact_id: opts.contactId ?? undefined,
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
    opts: { currency?: string; unit?: string | null } = {},
  ): Promise<void> {
    const { error } = await supabase.from('product_prices').upsert({
      workspace_id: workspaceId,
      product_id: productId,
      list_price: listPrice,
      currency: opts.currency ?? 'EUR',
      unit: opts.unit ?? null,
      confirmed_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,product_id' });
    if (error) throw error;
  },
};
