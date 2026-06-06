import { supabase } from '@/integrations/supabase/client';

export interface CommissionLine {
  on_workspace: string;
  rank: string;
  commission_pct: number;
  commission_amount: number;
  paid_to_parent: string | null;
}

export interface WorkspacePrice {
  mode: 'own_product' | 'operator_catalog';
  base_price: number | null;
  currency: string;
  ancestor_commission_pct: number;
  cost_basis: number | null;
  commission_breakdown: CommissionLine[];
}

export interface CommissionSummary {
  total_earned: number;
  currency: string;
  lines: number;
  by_seller: { seller: string; amount: number; lines: number }[];
}

export const marketplacePricingService = {
  /** Cascade cost of a product to a given workspace (C2: operator base + Σ ancestor commission). */
  async getProductPrice(workspaceId: string, productId: string): Promise<WorkspacePrice | null> {
    const { data, error } = await supabase.rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
    });
    if (error) throw error;
    return (data as WorkspacePrice) ?? null;
  },

  /** Commission earned by a workspace as beneficiary (parent's cut on children's catalog sales). */
  async getCommissionSummary(workspaceId: string): Promise<CommissionSummary> {
    const { data, error } = await supabase.rpc('get_commission_summary', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data as CommissionSummary) ?? { total_earned: 0, currency: 'EUR', lines: 0, by_seller: [] };
  },
};
