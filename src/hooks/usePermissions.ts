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
  const { isPlatformOperator, rank, workspaceRole, accountRole, loading } = useWorkspace();

  return useMemo(() => {
    const persona = resolvePersona({ isPlatformOperator, rank, workspaceRole, accountRole });
    const can = (capability: Capability) => personaCan(persona, capability);

    // Finer axes are derived from the resolved persona (which the account role
    // drives), so a Supplier/Architect/Finance/Sales account role grants the right
    // gates even without a workspace-tree node. operator stays root-only.
    //
    // `isAccountant` = the INVITED EXTERNAL accountant (workspace role) — a RESTRICT
    // flag (#202: no expense approval / no settings). The internal `finance` account
    // role also resolves to the accountant persona (Finance surface) but is NOT
    // isAccountant, so it keeps approval rights (server: is_workspace_finance_manager
    // already allows finance + owner/admin).
    const isAccountant = workspaceRole === 'accountant';
    const isSalesRep = persona === 'sales';
    const isBusinessNode = persona === 'operator' || persona === 'dealer' || persona === 'architect';
    // Manages THIS node: a workspace owner/admin, or any business-tier persona.
    const isWorkspaceManager = (!!workspaceRole && ADMIN_ROLES.includes(workspaceRole)) || isBusinessNode;
    const canSupplyProducts = persona === 'operator' || persona === 'dealer';

    return {
      loading,
      persona,
      can,
      canAny: (...caps: Capability[]) => caps.some(can),
      isOperator: persona === 'operator',
      isEndUser: persona === 'end_user',
      isAccountant,
      isSalesRep,
      isWorkspaceManager,
      canSupplyProducts,
      // Day-to-day finance ops: managers + anyone on the Finance surface (finance role
      // or invited accountant).
      canOperateFinance: isWorkspaceManager || persona === 'accountant',
      canManageNetwork: isBusinessNode,
    };
  }, [isPlatformOperator, rank, workspaceRole, accountRole, loading]);
}
