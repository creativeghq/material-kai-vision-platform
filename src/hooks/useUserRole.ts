import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

/** Current user's role, sourced from the ACTIVE workspace (via WorkspaceContext). */
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
