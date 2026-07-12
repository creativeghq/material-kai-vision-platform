import { supabase } from '@/integrations/supabase/client';

export interface CreateChildInput {
  name: string;
  parentId: string;
  canSupplyProducts: boolean;
  catalogAccess: 'operator_catalog' | 'own_products_only';
}

export const workspaceManagementService = {
  /** Mint a child workspace (operator → dealer, dealer → architect). Caller must own/admin the parent. */
  async createChild(input: CreateChildInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_child_workspace', {
      p_name: input.name,
      p_parent_id: input.parentId,
      p_can_supply_products: input.canSupplyProducts,
      p_catalog_access: input.catalogAccess,
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
    patch: { catalogAccess?: 'operator_catalog' | 'own_products_only'; canSupplyProducts?: boolean },
  ): Promise<void> {
    const { error } = await supabase.rpc('update_child_workspace_settings', {
      p_workspace_id: workspaceId,
      p_catalog_access: patch.catalogAccess ?? null,
      p_can_supply_products: patch.canSupplyProducts ?? null,
    });
    if (error) throw error;
  },

  /** Owner/admin: get-or-create this workspace's referral code (enables referral join). */
  async generateReferral(workspaceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_workspace_referral', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data as string;
  },

  /** Signed-in user redeems a referral code → becomes a member of that workspace. */
  async redeemReferral(code: string): Promise<{ ok: boolean; workspace_name?: string; error?: string }> {
    const { data, error } = await supabase.rpc('redeem_workspace_referral', { p_code: code });
    if (error) throw error;
    return data as any;
  },

  /** Owner/admin mints a role-carrying invite (#201/#202); returns the code. */
  async createInvite(workspaceId: string, role: 'member' | 'accountant' | 'sales'): Promise<string> {
    const { data, error } = await supabase.rpc('create_workspace_invite', { p_workspace_id: workspaceId, p_role: role });
    if (error) throw error;
    return data as string;
  },

  /** Signed-in user redeems an invite → joins the workspace with the invite's role. */
  async redeemInvite(code: string): Promise<{ ok: boolean; workspace_id?: string; role?: string; error?: string }> {
    const { data, error } = await supabase.rpc('redeem_workspace_invite', { p_code: code });
    if (error) throw error;
    return data as any;
  },

  /** Operator/ancestor grants or revokes a module entitlement for a workspace (#181). */
  async setEntitlement(workspaceId: string, moduleSlug: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_workspace_entitlement', {
      p_workspace_id: workspaceId, p_module_slug: moduleSlug, p_enabled: enabled,
    });
    if (error) throw error;
  },

  /** Map of workspace_id → enabled for a given module entitlement. */
  async getEntitlements(moduleSlug: string): Promise<Record<string, boolean>> {
    const { data } = await supabase
      .from('workspace_module_entitlements')
      .select('workspace_id, enabled')
      .eq('module_slug', moduleSlug);
    return Object.fromEntries((data ?? []).map((r: any) => [r.workspace_id, r.enabled]));
  },
};

/** Stash a referral code seen in the URL (?ref=) until the user is authenticated. */
export const REFERRAL_STORAGE_KEY = 'mk_pending_referral';

/** Stash an invite code seen in the URL (?invite=) until the user is authenticated. */
export const INVITE_STORAGE_KEY = 'mk_pending_invite';

