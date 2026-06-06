import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

/**
 * Current user's role, sourced from the ACTIVE workspace (via WorkspaceContext).
 *
 * - `role` / `isAdmin` describe standing in the *active* workspace (owner/admin of
 *   THIS node). This replaces the old `.maybeSingle()` query that crashed the
 *   moment a user belonged to more than one workspace.
 * - `isPlatformOperator` is the distinct platform-level axis: owner/admin of the
 *   ROOT (Materials Hub) workspace, and nobody else. Use THIS to gate /admin/*
 *   surfaces, module toggles, and operator-only finance — not `isAdmin`.
 *
 * Today (single root workspace) `isAdmin` and `isPlatformOperator` coincide, so
 * migrating a gate from one to the other is a no-op until the marketplace tree
 * actually has dealers/architects beneath the root.
 */
export const useUserRole = () => {
  const { user } = useAuth();
  const { workspaceRole, isPlatformOperator, loading } = useWorkspace();

  const role = user ? (workspaceRole ?? 'member') : 'guest';

  return {
    isAdmin: isAdminRole(role),
    isPlatformOperator,
    role,
    user,
    loading,
  };
};
