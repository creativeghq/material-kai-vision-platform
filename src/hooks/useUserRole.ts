import { useAuth } from '@/contexts/AuthContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

export const useUserRole = () => {
  const { user } = useAuth();

  const getUserRole = () => {
    if (!user) return 'guest';
    // Check both user_metadata and raw_user_meta_data — historical drift means
    // either path may carry the role depending on when the user signed up.
    const userMetaRole = user.user_metadata?.role;
    const rawMetaRole = user.raw_user_meta_data?.role;
    return userMetaRole || rawMetaRole || 'member';
  };

  const role = getUserRole();
  return {
    isAdmin: isAdminRole(role),
    role,
    user,
  };
};
