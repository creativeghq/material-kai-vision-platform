// #251 — the App Launcher's data source. Merges two sources, both gated for the active persona:
//  1. SIDEBAR_NAV_ITEMS marked surface:'app' (CRM, Finance, Quotes, … — moved off the top bar),
//     filtered through the same capability/module/role gates as the top nav.
//  2. Registered optional modules that declare a location:'workspace' navItem (HR, Docs, …),
//     filtered by global-enabled ∩ workspace-entitled.
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SIDEBAR_NAV_ITEMS, filterNavItems } from '@/config/nav-items';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspaceModuleNav } from '@/modules/_core';

export interface AppNavEntry {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
}

export function useAppNavItems(): { entries: AppNavEntry[]; loading: boolean } {
  const { isFactory, isAdmin, isPlatformOperator } = useFactoryRole();
  const { can, isAccountant, isSalesRep } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const { entries: moduleEntries, loading } = useWorkspaceModuleNav();

  return useMemo(() => {
    const gated = filterNavItems(SIDEBAR_NAV_ITEMS, {
      isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, isModuleAvailable, can,
    })
      .filter((i) => i.surface === 'app')
      .map((i) => ({ id: i.id, label: i.label, path: i.path, icon: i.icon }));

    const mods = moduleEntries.map((e) => ({
      id: e.slug, label: e.label, path: e.path, icon: e.icon, description: e.description,
    }));

    const seen = new Set<string>();
    const entries = [...gated, ...mods]
      .filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { entries, loading };
  }, [isFactory, isAdmin, isPlatformOperator, isAccountant, isSalesRep, isModuleAvailable, can, moduleEntries, loading]);
}
