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
  loading: boolean;
}

export function useFactoryRole(): FactoryRole {
  // Workspace role + platform-operator come from WorkspaceContext (active workspace),
  // which fixes the old .maybeSingle() crash for users in more than one workspace.
  const { workspaceRole, isPlatformOperator, loading } = useWorkspace();

  return {
    isAdmin: isAdminRole(workspaceRole),
    isPlatformOperator,
    loading,
  };
}
