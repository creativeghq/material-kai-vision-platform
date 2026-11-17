// The App Launcher's data source. Returns the launcher entries for the
// active workspace: registered modules that (a) are globally published AND
// (b) are entitled to the active workspace AND (c) declare a `location:'workspace'`
// navItem. This is how optional modules surface WITHOUT a top-nav item.
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { registeredModules } from './registry';
import { useEnabledModules } from './useEnabledModules';
import { useEntitlements } from '@/hooks/useEntitlements';

export interface WorkspaceModuleNavEntry {
  slug: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
}

export function useWorkspaceModuleNav(): { entries: WorkspaceModuleNavEntry[]; loading: boolean } {
  const { enabledSlugs, isLoading: modulesLoading } = useEnabledModules();
  const { availableSlugs, loading: entLoading } = useEntitlements();

  const entries = useMemo(() => {
    const out: WorkspaceModuleNavEntry[] = [];
    for (const mod of registeredModules) {
      const slug = mod.manifest.slug;
      if (!enabledSlugs.has(slug)) continue; // globally published
      if (!availableSlugs.has(slug)) continue; // entitled to the active workspace
      const nav = mod.navItems.find((n) => n.location === 'workspace');
      if (!nav) continue;
      out.push({
        slug,
        label: nav.label,
        path: nav.path,
        icon: nav.icon,
        description: nav.adminDescription || mod.manifest.description,
      });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [enabledSlugs, availableSlugs]);

  return { entries, loading: modulesLoading || entLoading };
}
