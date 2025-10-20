import { useAuth } from '@/contexts/AuthContext';

export const useUserRole = () => {
  const { user } = useAuth();

  const isAdmin = () => {
    if (!user) return false;
    // Check both user_metadata and raw_user_meta_data for role
    const userMetaRole = user.user_metadata?.role;
    const rawMetaRole = user.raw_user_meta_data?.role;
    const role = userMetaRole || rawMetaRole;
    return role === 'admin' || role === 'owner';
  };

  const getUserRole = () => {
    if (!user) return 'guest';
    // Check both user_metadata and raw_user_meta_data for role
    const userMetaRole = user.user_metadata?.role;
    const rawMetaRole = user.raw_user_meta_data?.role;
    return userMetaRole || rawMetaRole || 'member';
  };

  return {
    isAdmin: isAdmin(),
    role: getUserRole(),
    user,
  };
};
