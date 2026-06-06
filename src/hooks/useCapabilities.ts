import { useWorkspace, type MarketplaceRank } from '@/contexts/WorkspaceContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { ADMIN_ROLES } from '@/auth/roles';

/**
 * #195 — the single source of truth for "what can the current user do", derived from
 * the three role axes (platform role, workspace role, marketplace rank). Replaces
 * scattered `isAdmin` / `isFactory` checks so gating is consistent and correct as the
 * marketplace tree grows. Prefer these booleans over re-deriving role logic in components.
 */
export interface Capabilities {
  loading: boolean;
  /** Marketplace rank of the active workspace. */
  rank: MarketplaceRank | null;
  /** Owner/admin of the ROOT workspace — gate /admin/* platform surfaces on THIS. */
  isPlatformOperator: boolean;
  /** Owner/admin of the ACTIVE workspace (manage this workspace's data). */
  isWorkspaceManager: boolean;
  /** A business node (operator/dealer/architect), not a pure end-user. */
  isBusinessNode: boolean;
  /** Can add own products (operator or dealer). */
  canSupplyProducts: boolean;
  /** Can manage this workspace's finance / e-invoicing. */
  canManageFinance: boolean;
  /** Can manage downline (operator/dealer who owns/admins the node). */
  canManageNetwork: boolean;
  /** A restricted end-user (member without workspace-admin). */
  isEndUser: boolean;
  /** Verified factory/supplier (factory analytics). */
  isFactory: boolean;
}

export function useCapabilities(): Capabilities {
  const { rank, workspaceRole, isPlatformOperator, loading: wsLoading } = useWorkspace();
  const { isFactory, loading: frLoading } = useFactoryRole();

  const isWorkspaceManager = !!workspaceRole && ADMIN_ROLES.includes(workspaceRole);
  const isBusinessNode = rank === 'operator' || rank === 'dealer' || rank === 'architect';
  const canSupplyProducts = rank === 'operator' || rank === 'dealer';

  return {
    loading: wsLoading || frLoading,
    rank,
    isPlatformOperator,
    isWorkspaceManager,
    isBusinessNode,
    canSupplyProducts,
    canManageFinance: isWorkspaceManager,
    canManageNetwork: isWorkspaceManager && canSupplyProducts,
    isEndUser: !isWorkspaceManager && !isPlatformOperator,
    isFactory,
  };
}
