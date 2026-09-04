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

export type { AppLinkSet, LauncherQuickStart, LinkGate } from '@/config/launcher-links';

export function useLauncherLinks() {
  const { isModuleAvailable } = useEntitlements();
  const { can, isWorkspaceManager } = usePermissions();
  const gate = useMemo<LinkGate>(
    () => ({ isModuleAvailable, can, isWorkspaceManager }),
    [isModuleAvailable, can, isWorkspaceManager],
  );
  const appLinks = useCallback((app: LauncherApp) => appLinkSet(app, gate), [gate]);
  const hubShortcuts = useCallback((hubKey: string | null) => hubShortcutSet(hubKey, gate), [gate]);
  return { appLinks, hubShortcuts, gate };
}
