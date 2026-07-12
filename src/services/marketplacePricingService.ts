import { supabase } from '@/integrations/supabase/client';

export interface WorkspacePrice {
  mode: 'own_product' | 'operator_catalog';
  base_price: number | null;
  currency: string;
  cost_basis: number | null;
}

export const marketplacePricingService = {
  /** Cascade cost of a product to a given workspace (operator base resolved down the resale chain). */
  async getProductPrice(workspaceId: string, productId: string): Promise<WorkspacePrice | null> {
    const { data, error } = await supabase.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
    });
    if (error) throw error;
    return (data as WorkspacePrice) ?? null;
  },
};
