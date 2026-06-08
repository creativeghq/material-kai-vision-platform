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
import { ADMIN_ROLES } from '@/auth/roles';
import { resolvePersona, personaCan, type Capability, type Persona } from '@/auth/capabilities';

export interface PermissionsApi {
  loading: boolean;
  persona: Persona;
  can: (capability: Capability) => boolean;
  canAny: (...capabilities: Capability[]) => boolean;
  isOperator: boolean;
  isEndUser: boolean;
  // ── Finer, axis-derived gates (formerly the separate useCapabilities hook, merged here as
  //    the single permission source — #208). These depend on the marketplace RANK and the raw
  //    workspace role, which the coarse persona capabilities intentionally collapse, so they
  //    live as explicit booleans rather than persona capabilities. ──
  /** Invited accountant (#202): Finance only — operate, never manage settings. */
  isAccountant: boolean;
  /** Invited sales rep (#201): Sales portal only. */
  isSalesRep: boolean;
  /** Owner/admin of the ACTIVE workspace (vs. a plain member). */
  isWorkspaceManager: boolean;
  /** Can add/price own products (operator or dealer rank). */
  canSupplyProducts: boolean;
  /** Day-to-day finance operations — record payments + submit to myDATA — without settings.
   *  True for workspace managers AND the invited accountant. */
  canOperateFinance: boolean;
  /** Can manage the downline (a managing owner/admin of a supplying node). */
  canManageNetwork: boolean;
}

export function usePermissions(): PermissionsApi {
  const { isPlatformOperator, rank, workspaceRole, loading } = useWorkspace();

  return useMemo(() => {
    const persona = resolvePersona({ isPlatformOperator, rank, workspaceRole });
    const can = (capability: Capability) => personaCan(persona, capability);

    const isWorkspaceManager = !!workspaceRole && ADMIN_ROLES.includes(workspaceRole);
    const canSupplyProducts = rank === 'operator' || rank === 'dealer';
    const isAccountant = workspaceRole === 'accountant';

    return {
      loading,
      persona,
      can,
      canAny: (...caps: Capability[]) => caps.some(can),
      isOperator: persona === 'operator',
      isEndUser: persona === 'end_user',
      isAccountant,
      isSalesRep: workspaceRole === 'sales',
      isWorkspaceManager,
      canSupplyProducts,
      canOperateFinance: isWorkspaceManager || isAccountant,
      canManageNetwork: isWorkspaceManager && canSupplyProducts,
    };
  }, [isPlatformOperator, rank, workspaceRole, loading]);
}
