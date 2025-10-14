import { useAuth } from '@/contexts/AuthContext';

export const useUserRole = () => {
  const { user } = useAuth();

  const isAdmin = () => {
    if (!user) return false;
    const role = user.raw_user_meta_data?.role;
    return role === 'admin' || role === 'owner';
  };

  const getUserRole = () => {
    if (!user) return 'guest';
    return user.raw_user_meta_data?.role || 'member';
  };

  return {
    isAdmin: isAdmin(),
    role: getUserRole(),
    user
  };
};
