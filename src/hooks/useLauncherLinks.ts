/**
 * The launcher's inner links, bound to the signed-in person and the active workspace. The
 * derivation itself is `src/config/launcher-links.ts` (pure, tested); this only supplies the gate —
 * entitlements, capabilities, workspace-admin — from the live hooks. Both Apps surfaces, desktop
 * popover and mobile panel, read through here and nothing else.
 */
import { useCallback, useMemo } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePermissions } from '@/hooks/usePermissions';
import type { LauncherApp } from '@/hooks/useLauncherApps';
import { appLinkSet, hubShortcutSet, type LinkGate } from '@/config/launcher-links';

export type { AppLinkSet, LauncherQuickStart, LinkGate, LauncherSectionGroup } from '@/config/launcher-links';
// Re-exported so both Apps surfaces reach the derivation through this hook and nothing else —
// the same reason `appLinks` lives here rather than being rebuilt per surface.
export { groupSections } from '@/config/launcher-links';

export function useLauncherLinks() {
  const { isModuleAvailable } = useEntitlements();
  const { can, isWorkspaceManager, isAccountant } = usePermissions();
  const gate = useMemo<LinkGate>(
    () => ({ isModuleAvailable, can, isWorkspaceManager, isAccountant }),
    [isModuleAvailable, can, isWorkspaceManager, isAccountant],
  );
  const appLinks = useCallback((app: LauncherApp) => appLinkSet(app, gate), [gate]);
  const hubShortcuts = useCallback((hubKey: string | null) => hubShortcutSet(hubKey, gate), [gate]);
  return { appLinks, hubShortcuts, gate };
}
