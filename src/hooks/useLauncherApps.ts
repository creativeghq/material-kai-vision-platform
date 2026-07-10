// #251 — App Launcher data source (rich variant). Splits the workspace's optional modules into
//  • active     — entitled + persona-usable → click to open.
//  • available  — persona-usable but NOT entitled → click to enable (owner) / request (member).
// Gating reuses the canonical filterNavItems(): once with real entitlements (active), once with
// entitlement forced open (all persona-usable) — the difference is what's available to add.
// Catalog metadata (subheading + add-on price) is joined from public.modules by slug.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SIDEBAR_NAV_ITEMS, filterNavItems, type SidebarNavItem } from '@/config/nav-items';
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

export function useLauncherApps(): LauncherApi {
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep, isWorkspaceManager } = usePermissions();
  const { isModuleAvailable, loading: entLoading } = useEntitlements();
  const { activeWorkspaceId } = useWorkspace();
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
      if (isWorkspaceManager) {
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
  }, [activeWorkspaceId, isWorkspaceManager]);

  const api = useMemo(() => {
    const base = { isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, can };
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
        priceLabel: cat?.is_addon ? (formatAddonPrice(cat.addon_price_cents, cat.addon_currency) || undefined) : undefined,
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
      canManage: isWorkspaceManager,
      enabling,
      enable,
    };
  }, [isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, can, isModuleAvailable,
      moduleEntries, catalog, catalogLoaded, entLoading, localActivated, isWorkspaceManager, enabling, enable]);

  return api;
}
