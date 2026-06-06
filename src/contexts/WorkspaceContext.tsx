import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLES } from '@/auth/roles';
import { workspaceManagementService, REFERRAL_STORAGE_KEY } from '@/services/workspaceManagementService';

/**
 * WorkspaceContext — the single source of truth for the *active* workspace and
 * the current user's standing within the marketplace tree (#194 / #195).
 *
 * Three role axes, kept deliberately distinct (this is the fix for the
 * "every owner looked like a platform admin" conflation):
 *   1. workspaceRole   — the user's role IN the active workspace (owner|admin|member|client).
 *                        Drives "can I manage THIS workspace" decisions.
 *   2. isPlatformOperator — owner/admin of the ROOT (Materials Hub) workspace, and
 *                        nobody else. Drives "can I administer the PLATFORM" decisions
 *                        (the /admin/* surfaces, module toggles, operator finance).
 *   3. marketplaceRank — operator | dealer | architect, derived from the active
 *                        workspace's node flags. Drives catalog/commission behaviour.
 *
 * Active-workspace selection is persisted per-user in localStorage for now; the
 * durable home is `app_metadata.workspace_id` on the JWT (a later increment that
 * lets MIVAA + RLS read the active workspace server-side).
 */

export type MarketplaceRank = 'operator' | 'dealer' | 'architect';

export interface WorkspaceNode {
  id: string;
  name: string;
  slug: string | null;
  isRoot: boolean;
  parentWorkspaceId: string | null;
  canSupplyProducts: boolean;
  /** What this node may sell from (set by its parent): operator_catalog | own_products_only. */
  catalogAccess: 'operator_catalog' | 'own_products_only';
  /** Parent's commission cut on this node's operator-catalog sales (%). */
  commissionPct: number;
}

export interface WorkspaceMembership {
  workspaceId: string;
  role: string;
  workspace: WorkspaceNode;
}

interface WorkspaceContextType {
  loading: boolean;
  /** All active memberships for the signed-in user. */
  memberships: WorkspaceMembership[];
  /** The currently-selected workspace, or null while loading / for a user with none. */
  activeWorkspace: WorkspaceNode | null;
  activeWorkspaceId: string | null;
  /** The user's role in the active workspace (owner|admin|member|client). */
  workspaceRole: string | null;
  /** Marketplace rank of the active workspace. */
  rank: MarketplaceRank | null;
  /** True iff the active workspace is the Materials Hub root. */
  isRootWorkspace: boolean;
  /** Platform-operator = owner/admin of the ROOT workspace (independent of active selection). */
  isPlatformOperator: boolean;
  /** Switch the active workspace; rejects ids the user isn't a member of. */
  switchWorkspace: (workspaceId: string) => void;
  /** Re-fetch memberships (after creating a child workspace, role change, etc.). */
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = (): WorkspaceContextType => {
  const ctx = useContext(WorkspaceContext);
  if (ctx === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};

const activeKey = (userId: string) => `mk_active_workspace_${userId}`;

function rankOf(node: WorkspaceNode | null): MarketplaceRank | null {
  if (!node) return null;
  if (node.isRoot) return 'operator';
  return node.canSupplyProducts ? 'dealer' : 'architect';
}

/** Map a raw `workspace_members` + embedded `workspaces` row into our shape. */
function mapMembership(row: any): WorkspaceMembership | null {
  const ws = row?.workspace;
  if (!ws?.id) return null;
  return {
    workspaceId: ws.id,
    role: row.role ?? 'member',
    workspace: {
      id: ws.id,
      name: ws.name ?? 'Workspace',
      slug: ws.slug ?? null,
      isRoot: !!ws.is_root,
      parentWorkspaceId: ws.parent_workspace_id ?? null,
      canSupplyProducts: !!ws.can_supply_products,
      catalogAccess: ws.catalog_access === 'own_products_only' ? 'own_products_only' : 'operator_catalog',
      commissionPct: typeof ws.commission_pct === 'number' ? ws.commission_pct : Number(ws.commission_pct ?? 0),
    },
  };
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Redeem a pending referral (signed-up under a dealer/architect) before reading memberships.
    try {
      const ref = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (ref) {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        await workspaceManagementService.redeemReferral(ref).catch(() => {});
      }
    } catch { /* localStorage unavailable */ }

    const { data, error } = await supabase
      .from('workspace_members')
      .select(
        'role, status, workspace:workspaces(id, name, slug, is_root, parent_workspace_id, can_supply_products, catalog_access, commission_pct)',
      )
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (error) {
      // Fail soft: no memberships rather than a hard crash. RLS or a transient
      // network error shouldn't blank the whole app.
      setMemberships([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }

    const rows = (data ?? []).map(mapMembership).filter(Boolean) as WorkspaceMembership[];
    setMemberships(rows);

    // Resolve the active workspace: persisted choice (if still valid) → root → first.
    let next: string | null = null;
    try {
      const persisted = localStorage.getItem(activeKey(user.id));
      if (persisted && rows.some((m) => m.workspaceId === persisted)) next = persisted;
    } catch {
      /* localStorage unavailable (private mode) — fall through to defaults */
    }
    if (!next) next = rows.find((m) => m.workspace.isRoot)?.workspaceId ?? rows[0]?.workspaceId ?? null;
    setActiveWorkspaceId(next);
    setLoading(false);
  }, [user?.id]);

  // Capture a ?ref= referral code into storage so it survives signup/login.
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get('ref');
      if (code) localStorage.setItem(REFERRAL_STORAGE_KEY, code);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      if (!user) return;
      if (!memberships.some((m) => m.workspaceId === workspaceId)) return; // not a member — ignore
      setActiveWorkspaceId(workspaceId);
      try {
        localStorage.setItem(activeKey(user.id), workspaceId);
      } catch {
        /* ignore persistence failure */
      }
    },
    [user?.id, memberships],
  );

  const activeMembership = memberships.find((m) => m.workspaceId === activeWorkspaceId) ?? null;
  const activeWorkspace = activeMembership?.workspace ?? null;
  const isPlatformOperator = memberships.some(
    (m) => m.workspace.isRoot && ADMIN_ROLES.includes(m.role),
  );

  const value: WorkspaceContextType = {
    loading: loading || authLoading,
    memberships,
    activeWorkspace,
    activeWorkspaceId,
    workspaceRole: activeMembership?.role ?? null,
    rank: rankOf(activeWorkspace),
    isRootWorkspace: !!activeWorkspace?.isRoot,
    isPlatformOperator,
    switchWorkspace,
    refresh: load,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
