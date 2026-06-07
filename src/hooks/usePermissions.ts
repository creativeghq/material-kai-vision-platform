/**
 * #195 — the single capability hook. Resolves the current persona from the active
 * workspace and exposes `can(capability)`. Replaces ad-hoc `isAdmin()` / role-string
 * checks across the app.
 *
 *   const { can, persona } = usePermissions();
 *   if (can('crm.view')) { … }
 *
 * `loading` mirrors WorkspaceContext — gate on it before trusting `can()` so surfaces
 * don't flash for a frame while memberships resolve.
 */
import { useMemo } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { resolvePersona, personaCan, type Capability, type Persona } from '@/auth/capabilities';

export interface PermissionsApi {
  loading: boolean;
  persona: Persona;
  can: (capability: Capability) => boolean;
  canAny: (...capabilities: Capability[]) => boolean;
  isOperator: boolean;
  isEndUser: boolean;
}

export function usePermissions(): PermissionsApi {
  const { isPlatformOperator, rank, workspaceRole, loading } = useWorkspace();

  return useMemo(() => {
    const persona = resolvePersona({ isPlatformOperator, rank, workspaceRole });
    const can = (capability: Capability) => personaCan(persona, capability);
    return {
      loading,
      persona,
      can,
      canAny: (...caps: Capability[]) => caps.some(can),
      isOperator: persona === 'operator',
      isEndUser: persona === 'end_user',
    };
  }, [isPlatformOperator, rank, workspaceRole, loading]);
}
