import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<string>('member');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole('guest');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (cancelled) return;
      setRole(member?.role || 'member');
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return {
    isAdmin: isAdminRole(role),
    role,
    user,
    loading,
  };
};
