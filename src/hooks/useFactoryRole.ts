import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

/**
 * Workspace admin flags for nav gating.
 *
 * This used to also resolve an `isFactory` role from `user_profiles.factory_verified` +
 * `professional_type`, for the sole benefit of the `/factory-analytics` nav tile. No account has
 * ever held `factory_verified`, so that tile rendered for nobody, and the lookup cost every nav
 * consumer — Sidebar, MobileBottomNav, GlobalSearch, the app launcher — an extra `user_profiles`
 * round-trip on render to compute a flag that was always false. Per-supplier analytics now live on
 * the CRM company record (#350), which needs no platform-user identity at all.
 *
 * The name is kept because four call sites read it and the flags it still returns are unchanged.
 */
interface FactoryRole {
  /** Admin of the ACTIVE workspace (owner/admin) — NOT necessarily a platform operator. */
  isAdmin: boolean;
  /** Owner/admin of the ROOT workspace. Gate platform surfaces (/admin) on this. */
  isPlatformOperator: boolean;
  /**
   * The ACTIVE workspace supplies products (`workspaces.can_supply_products`) — i.e. it is a
   * supplier, not only a buyer. Gate supplier surfaces on this rather than on `isAdmin`: it is a
   * fact about the workspace, so every member of a supplier shares it and no member of a buyer
   * workspace has it. Free to read — WorkspaceContext already selects the column with the
   * membership, so this adds no round-trip (the lookup this hook used to do for `isFactory`, and
   * which #350 removed, is exactly what we are not reintroducing).
   */
  isSupplierWorkspace: boolean;
  loading: boolean;
}

export function useFactoryRole(): FactoryRole {
  // Workspace role + platform-operator come from WorkspaceContext (active workspace),
  // which fixes the old .maybeSingle() crash for users in more than one workspace.
  const { workspaceRole, isPlatformOperator, activeWorkspace, loading } = useWorkspace();

  return {
    isAdmin: isAdminRole(workspaceRole),
    isPlatformOperator,
    isSupplierWorkspace: !!activeWorkspace?.canSupplyProducts,
    loading,
  };
}
