import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface FactoryRole {
  isFactory: boolean;
  isAdmin: boolean;
  factoryClaimedName: string | null;
  professionalType: string | null;
  loading: boolean;
}

export function useFactoryRole(): FactoryRole {
  const { user } = useAuth();
  const [state, setState] = useState<FactoryRole>({
    isFactory: false,
    isAdmin: false,
    factoryClaimedName: null,
    professionalType: null,
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setState({ isFactory: false, isAdmin: false, factoryClaimedName: null, professionalType: null, loading: false });
      return;
    }

    let cancelled = false;

    const load = async () => {
      const [profileResult, memberResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('factory_verified, factory_claimed_name, professional_type')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('workspace_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const profile = profileResult.data;
      const member = memberResult.data;

      const FACTORY_TYPES = ['manufacturer', 'brand', 'supplier'];

      setState({
        isFactory: !!(profile?.factory_verified && FACTORY_TYPES.includes(profile?.professional_type ?? '')),
        isAdmin: member?.role === 'admin' || member?.role === 'owner',
        factoryClaimedName: profile?.factory_claimed_name ?? null,
        professionalType: profile?.professional_type ?? null,
        loading: false,
      });
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  return state;
}
