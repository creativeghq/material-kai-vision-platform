import { supabase } from '@/integrations/supabase/client';

export interface CreateChildInput {
  name: string;
  parentId: string;
  canSupplyProducts: boolean;
  catalogAccess: 'operator_catalog' | 'own_products_only';
  commissionPct: number;
}

export const workspaceManagementService = {
  /** Mint a child workspace (operator → dealer, dealer → architect). Caller must own/admin the parent. */
  async createChild(input: CreateChildInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_child_workspace', {
      p_name: input.name,
      p_parent_id: input.parentId,
      p_can_supply_products: input.canSupplyProducts,
      p_catalog_access: input.catalogAccess,
      p_commission_pct: input.commissionPct,
    });
    if (error) throw error;
    return data as string;
  },

  /** All workspaces in the caller's manageable subtree. */
  async listManageable(): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_manageable_workspaces');
    if (error) throw error;
    return data ?? [];
  },

  /** Edit a direct child's per-edge settings (caller must own/admin the parent). */
  async updateChildSettings(
    workspaceId: string,
    patch: { catalogAccess?: 'operator_catalog' | 'own_products_only'; commissionPct?: number; canSupplyProducts?: boolean },
  ): Promise<void> {
    const { error } = await supabase.rpc('update_child_workspace_settings', {
      p_workspace_id: workspaceId,
      p_catalog_access: patch.catalogAccess ?? null,
      p_commission_pct: patch.commissionPct ?? null,
      p_can_supply_products: patch.canSupplyProducts ?? null,
    });
    if (error) throw error;
  },
};
