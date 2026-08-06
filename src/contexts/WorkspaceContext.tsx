import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ADMIN_ROLES } from '@/auth/roles';
import { workspaceManagementService, REFERRAL_STORAGE_KEY, INVITE_STORAGE_KEY } from '@/services/workspaceManagementService';
import { ACTIVE_WORKSPACE_KEY } from '@/utils/activeWorkspace';
import { toast } from 'sonner';

/**
 * WorkspaceContext — the single source of truth for the *active* workspace and
 * the current user's standing within the marketplace tree.
 *
 * Three role axes, kept deliberately distinct (this is the fix for the
 * "every owner looked like a platform admin" conflation):
 *   1. workspaceRole   — the user's role IN the active workspace (owner|admin|member|client).
 *                        Drives "can I manage THIS workspace" decisions.
 *   2. isPlatformOperator — owner/admin of the ROOT (Materials Hub) workspace, and
 *                        nobody else. Drives "can I administer the PLATFORM" decisions
 *                        (the /admin/* surfaces, module toggles, operator finance).
 *   3. marketplaceRank — operator | dealer | architect, derived from the active
 *                        workspace's node flags. Drives catalog behaviour.
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
  /** The user's global account role name (roles.name): user|sales|supplier|architect|finance|admin.
   *  This is the access TIER set under Admin → CRM → Users; it drives the persona. */
  accountRole: string | null;
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

const activeKey = ACTIVE_WORKSPACE_KEY;

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
    },
  };
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setActiveWorkspaceId(null);
      setAccountRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Redeem a pending referral / role-carrying invite before reading memberships.
    // The token is consumed (removed) ONLY on a definitive server response — success OR a permanent
    // rejection (expired/used, ok:false). A THROW (network/transient) keeps the token so the next
    // context load retries. Deleting it up-front loses the user's workspace role permanently on a
    // transient failure, with no feedback.
    const redeemPending = async (
      storageKey: string,
      redeem: (code: string) => Promise<{ ok: boolean; error?: string }>,
      label: string,
    ) => {
      let code: string | null = null;
      try { code = localStorage.getItem(storageKey); } catch { return; /* localStorage unavailable */ }
      if (!code) return;
      try {
        const res = await redeem(code);
        // definitive response (ok true or false) → consume it
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
        if (!res?.ok) {
          toast.error(`Could not apply your ${label}`, {
            description: res?.error || 'The link may have expired or already been used.',
          });
        }
      } catch {
        // transient failure — keep the token; the next load will retry.
        toast.error(`Couldn't apply your ${label} — retrying shortly`, {
          description: 'Check your connection; it will be applied automatically.',
        });
      }
    };
    await redeemPending(REFERRAL_STORAGE_KEY, (c) => workspaceManagementService.redeemReferral(c), 'referral');
    await redeemPending(INVITE_STORAGE_KEY, (c) => workspaceManagementService.redeemInvite(c), 'invitation');

    // These two are INDEPENDENT, and both gate `loading`, which every route sits behind via
    // AuthGuard — so awaiting them in sequence adds a full round trip to the first paint of every
    // authenticated page. `roles(name)` embeds the account role rather than costing a second hop
    // through user_profiles, which keeps the whole thing to one round trip.
    const [membersRes, profileRes] = await Promise.all([
      supabase
        .from('workspace_members')
        .select(
          'role, status, workspace:workspaces(id, name, slug, is_root, parent_workspace_id, can_supply_products, catalog_access)',
        )
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('user_profiles')
        .select('role_id, roles(name)')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const { data, error } = membersRes;

    if (error) {
      // Fail soft: no memberships rather than a hard crash. RLS or a transient
      // network error shouldn't blank the whole app.
      setMemberships([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }

    let rows = (data ?? []).map(mapMembership).filter(Boolean) as WorkspaceMembership[];

    // Safety net (#211): a user with zero memberships is stranded — the invite-first
    // signup path skips own-workspace creation, so if the invite then failed to redeem
    // (revoked/expired between signup and first load), nothing owns them a workspace.
    // ensure_own_workspace() idempotently provisions the personal workspace the signup
    // trigger would have made; then re-read memberships once.
    if (rows.length === 0) {
      try {
        await supabase.rpc('ensure_own_workspace');
        const { data: retry } = await supabase
          .from('workspace_members')
          .select(
            'role, status, workspace:workspaces(id, name, slug, is_root, parent_workspace_id, can_supply_products, catalog_access)',
          )
          .eq('user_id', user.id)
          .eq('status', 'active');
        rows = (retry ?? []).map(mapMembership).filter(Boolean) as WorkspaceMembership[];
      } catch { /* fail soft — the next context load retries */ }
    }
    setMemberships(rows);

    // Account role (the access tier set under Users), already resolved by the embed in the
    // Promise.all above — no second hop. Kept fail-soft: an unreadable profile means "no account
    // role", never a blocked app.
    try {
      const prof = profileRes.data as { role_id?: string | null; roles?: { name?: string } | { name?: string }[] | null } | null;
      const embedded = Array.isArray(prof?.roles) ? prof?.roles[0] : prof?.roles;
      if (prof?.role_id) {
        setAccountRole(embedded?.name ?? null);
      } else {
        setAccountRole(null);
      }
    } catch {
      setAccountRole(null);
    }

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
      const params = new URLSearchParams(window.location.search);
      const code = params.get('ref');
      if (code) localStorage.setItem(REFERRAL_STORAGE_KEY, code);
      const invite = params.get('invite');
      if (invite) localStorage.setItem(INVITE_STORAGE_KEY, invite);
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
    accountRole,
    switchWorkspace,
    refresh: load,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
