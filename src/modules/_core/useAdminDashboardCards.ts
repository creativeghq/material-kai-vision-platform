/** Admin-dashboard slot for module-contributed cards. */

import { useMemo } from 'react';
import { registeredModules } from './registry';
import { useEnabledModules } from './useEnabledModules';
import type { ModuleNavItem } from './ModuleDefinition';

export interface AdminDashboardCard {
  /** Card heading shown on /admin. */
  title: string;
  /** One-line description rendered below the heading. */
  description: string;
  /** Lucide icon component. */
  icon: ModuleNavItem['icon'];
  /** Click target (route path). */
  path: string;
  /** Status pill text — typically 'active'. */
  status: string;
  /** Small bottom-left tag rendered next to the "Manage" button. */
  count: string;
  /** Category heading the card sits under. */
  category: string;
}

export function useAdminDashboardCards(): AdminDashboardCard[] {
  const { enabledSlugs } = useEnabledModules();

  return useMemo(() => {
    const cards: AdminDashboardCard[] = [];
    for (const mod of registeredModules) {
      if (!enabledSlugs.has(mod.manifest.slug)) continue;
      for (const nav of mod.navItems) {
        if (nav.location !== 'admin-dashboard') continue;
        cards.push({
          title: nav.label,
          description: nav.adminDescription ?? mod.manifest.description,
          icon: nav.icon,
          path: nav.path,
          status: 'active',
          count: nav.adminCount ?? mod.manifest.priceTier.toUpperCase(),
          category: nav.adminCategory ?? mod.manifest.category,
        });
      }
    }
    return cards;
  }, [enabledSlugs]);
}
