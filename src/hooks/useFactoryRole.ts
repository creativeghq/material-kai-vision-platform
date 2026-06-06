import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isAdmin as isAdminRole } from '@/auth/roles';

interface FactoryRole {
  isFactory: boolean;
  /** Admin of the ACTIVE workspace (owner/admin) — NOT necessarily a platform operator. */
  isAdmin: boolean;
  /** Owner/admin of the ROOT workspace. Gate platform surfaces (/admin) on this. */
  isPlatformOperator: boolean;
  factoryClaimedName: string | null;
  professionalType: string | null;
  loading: boolean;
}

export function useFactoryRole(): FactoryRole {
  const { user } = useAuth();
  // Workspace role + platform-operator come from WorkspaceContext (active workspace),
  // which fixes the old .maybeSingle() crash for users in more than one workspace.
  const { workspaceRole, isPlatformOperator, loading: wsLoading } = useWorkspace();
  const [profile, setProfile] = useState<{ factory_verified?: boolean; factory_claimed_name?: string | null; professional_type?: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setProfileLoading(false); return; }
    let cancelled = false;
    supabase
      .from('user_profiles')
      .select('factory_verified, factory_claimed_name, professional_type')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => { if (!cancelled) { setProfile(data ?? null); setProfileLoading(false); } });
    return () => { cancelled = true; };
  }, [user?.id]);

  return {
    isFactory: !!(profile?.factory_verified && profile?.professional_type === 'supplier'),
    isAdmin: isAdminRole(workspaceRole),
    isPlatformOperator,
    factoryClaimedName: profile?.factory_claimed_name ?? null,
    professionalType: profile?.professional_type ?? null,
    loading: wsLoading || profileLoading,
  };
}
