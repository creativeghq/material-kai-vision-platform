import { useMemo } from 'react';
import { useModule } from '@/modules/_core';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  WORKSPACE_INVITE_ROLES, WORKSPACE_ROLE_META,
  type WorkspaceInviteRole, type RoleModuleSlug,
} from '@/auth/workspaceRoles';

/** The invitable roles whose portal module is on in the active workspace; one useModule per ROLE_MODULE_SLUGS entry. */
export function useOfferableInviteRoles(): WorkspaceInviteRole[] {
  const { enabled: hrEnabled } = useModule('hr');
  const { enabled: stockEnabled } = useModule('stock');
  const { enabled: emailMarketingEnabled } = useModule('email-marketing');
  const { enabled: realEstateEnabled } = useModule('real-estate');
  const { enabled: quotesEnabled } = useModule('quotes');
  const { enabled: salesFinanceEnabled } = useModule('sales-finance');

  return useMemo(() => {
    const moduleEnabled: Record<RoleModuleSlug, boolean> = {
      hr: hrEnabled,
      stock: stockEnabled,
      'email-marketing': emailMarketingEnabled,
      'real-estate': realEstateEnabled,
      quotes: quotesEnabled,
      'sales-finance': salesFinanceEnabled,
    };
    return WORKSPACE_INVITE_ROLES.filter((r) => {
      const slug = WORKSPACE_ROLE_META[r].requiresModule as RoleModuleSlug | undefined;
      return slug ? moduleEnabled[slug] : true;
    });
  }, [hrEnabled, stockEnabled, emailMarketingEnabled, realEstateEnabled, quotesEnabled, salesFinanceEnabled]);
}

/** The viewer's role in `workspaceId`, or null when they are not a member of it. */
export function useViewerWorkspaceRole(workspaceId: string | null | undefined): string | null {
  const { memberships } = useWorkspace();
  return memberships.find((m) => m.workspaceId === workspaceId)?.role ?? null;
}

/** Whether the viewer may send invitations for `workspaceId` — the same owner/admin test every invite RPC applies. */
export function useCanInvite(workspaceId: string | null | undefined): boolean {
  const role = useViewerWorkspaceRole(workspaceId);
  return role === 'owner' || role === 'admin';
}
