// App Launcher data source (rich variant). Splits the workspace's optional modules into
//  • active     — entitled + persona-usable → click to open.
//  • available  — persona-usable but NOT entitled → click to enable (owner) / request (member).
// Gating reuses the canonical filterNavItems(): once with real entitlements (active), once with
// entitlement forced open (all persona-usable) — the difference is what's available to add.
// Catalog metadata (subheading + add-on price) is joined from public.modules by slug.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SIDEBAR_NAV_ITEMS, filterNavItems, HUBS, type SidebarNavItem, type HubId, type Hub } from '@/config/nav-items';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceModuleNav } from '@/modules/_core';
import {
  fetchModuleCatalog, activateModule, requestModule, formatAddonPrice, type ModuleCatalogRow,
} from '@/services/moduleActivationService';

export interface LauncherApp {
  id: string;
  moduleSlug?: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  path: string;
  active: boolean;
  isAddon?: boolean;
  priceLabel?: string;
  /** Hub grouping. Undefined → catch-all "More" group in the launcher. */
  hub?: HubId;
}

export interface EnableResult { ok: boolean; message: string; checkout?: boolean }

export interface LauncherApi {
  active: LauncherApp[];
  available: LauncherApp[];
  loading: boolean;
  /** Owner/admin can enable directly; members can only request. */
  canManage: boolean;
  /** module slug currently being enabled (for a spinner), else null. */
  enabling: string | null;
  enable: (app: LauncherApp) => Promise<EnableResult>;
}

/** A Hub plus the apps assigned to it. `hub: null` is the catch-all "More" group. */
export interface HubGroup {
  hub: Hub | null;
  apps: LauncherApp[];
}

/**
 * Group launcher apps into Hubs, preserving HUBS order. Within each hub,
 * active apps sort before available (add-on) apps, then alphabetically. Empty hubs are dropped.
 * Apps with no `hub` (e.g. registry workspace nav items) collect into a trailing "More" group.
 */
export function groupAppsByHub(apps: LauncherApp[]): HubGroup[] {
  const byHub = new Map<HubId | '__none__', LauncherApp[]>();
  for (const app of apps) {
    const key = app.hub ?? '__none__';
    const list = byHub.get(key) ?? [];
    list.push(app);
    byHub.set(key, list);
  }
  const sortApps = (list: LauncherApp[]) =>
    [...list].sort((a, b) => (Number(b.active) - Number(a.active)) || a.label.localeCompare(b.label));

  const groups: HubGroup[] = [];
  for (const hub of HUBS) {
    const list = byHub.get(hub.id);
    if (list?.length) groups.push({ hub, apps: sortApps(list) });
  }
  const orphans = byHub.get('__none__');
  if (orphans?.length) groups.push({ hub: null, apps: sortApps(orphans) });
  return groups;
}

export function useLauncherApps(): LauncherApi {
  const { isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isRealEstateAgent } = usePermissions();
  const { isModuleAvailable, loading: entLoading } = useEntitlements();
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  // Only a workspace OWNER (or platform operator) can activate/purchase a module server-side
  // (isOwnerOrOperator in stripe-api/handlers/modules.ts). Gate the launcher's Enable action to match,
  // so a non-owner manager gets the "request activation" path instead of a server 403.
  const canActivateModules = workspaceRole === 'owner' || isPlatformOperator;
  const { entries: moduleEntries } = useWorkspaceModuleNav();

  const [catalog, setCatalog] = useState<Map<string, ModuleCatalogRow>>(new Map());
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [localActivated, setLocalActivated] = useState<Set<string>>(new Set());
  const [enabling, setEnabling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModuleCatalog()
      .then((rows) => { if (!cancelled) setCatalog(new Map(rows.map((r) => [r.slug, r]))); })
      .catch(() => { /* non-fatal: launcher still lists apps, just without subheadings/price */ })
      .finally(() => { if (!cancelled) setCatalogLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async (app: LauncherApp): Promise<EnableResult> => {
    if (!activeWorkspaceId || !app.moduleSlug) return { ok: false, message: 'No workspace selected' };
    setEnabling(app.moduleSlug);
    try {
      if (canActivateModules) {
        const res = await activateModule(activeWorkspaceId, app.moduleSlug);
        if (res.checkout_url) { window.location.href = res.checkout_url; return { ok: true, checkout: true, message: 'Redirecting to checkout…' }; }
        setLocalActivated((prev) => new Set(prev).add(app.moduleSlug!));
        return { ok: true, message: `${app.label} enabled` };
      }
      const r = await requestModule(activeWorkspaceId, app.moduleSlug);
      return { ok: true, message: r.notified > 0 ? 'Requested — the workspace owner has been notified' : 'Request sent' };
    } catch (e) {
      return { ok: false, message: (e as Error).message || 'Could not enable this app' };
    } finally {
      setEnabling(null);
    }
  }, [activeWorkspaceId, canActivateModules]);

  const api = useMemo(() => {
    const base = { isAdmin, isPlatformOperator, isAccountant, isSalesRep, isRealEstateAgent, can };
    const activeItems = filterNavItems(SIDEBAR_NAV_ITEMS, { ...base, isModuleAvailable })
      .filter((i) => i.surface === 'app');
    const usableItems = filterNavItems(SIDEBAR_NAV_ITEMS, { ...base, isModuleAvailable: () => true })
      .filter((i) => i.surface === 'app');
    const activeIds = new Set(activeItems.map((i) => i.id));

    const enrich = (i: SidebarNavItem, active: boolean): LauncherApp => {
      const cat = i.moduleSlug ? catalog.get(i.moduleSlug) : undefined;
      return {
        id: i.id,
        moduleSlug: i.moduleSlug,
        label: i.label,
        icon: i.icon,
        path: i.path,
        description: cat?.summary || cat?.description || i.description || undefined,
        active,
        isAddon: cat?.is_addon,
        priceLabel: cat?.is_addon ? (formatAddonPrice(cat.addon_price_cents, cat.addon_currency, cat.billing_interval) || undefined) : undefined,
        hub: i.hub,
      };
    };

    const activeFromNav = activeItems.map((i) => enrich(i, true));
    const navPaths = new Set(activeFromNav.map((a) => a.path));
    // Registry modules that expose a workspace nav item but aren't in SIDEBAR_NAV_ITEMS.
    const activeFromModules: LauncherApp[] = moduleEntries
      .filter((e) => !navPaths.has(e.path))
      .map((e) => ({
        id: e.slug, moduleSlug: e.slug, label: e.label, icon: e.icon, path: e.path,
        description: e.description || catalog.get(e.slug)?.summary || undefined, active: true,
      }));

    const active = [...activeFromNav, ...activeFromModules].sort((a, b) => a.label.localeCompare(b.label));

    const available = usableItems
      .filter((i) => !!i.moduleSlug && !activeIds.has(i.id) && !localActivated.has(i.moduleSlug!))
      .map((i) => enrich(i, false))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      active, available,
      loading: entLoading || !catalogLoaded,
      canManage: canActivateModules,
      enabling,
      enable,
    };
  }, [isAdmin, isPlatformOperator, isAccountant, isSalesRep, isRealEstateAgent, can, isModuleAvailable,
      moduleEntries, catalog, catalogLoaded, entLoading, localActivated, canActivateModules, enabling, enable]);

  return api;
}
