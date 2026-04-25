/**
 * Header-action slot for module-contributed components.
 *
 * Modules whose `headerActions[]` is non-empty get their components
 * mounted in the platform Header (right-aligned action row next to
 * the avatar) and the shared PageHeader. Disabled modules disappear
 * automatically — same pattern as `useAdminDashboardCards()`.
 */

import React, { Suspense, useMemo } from 'react';
import { registeredModules } from './registry';
import { useEnabledModules } from './useEnabledModules';

export const ModuleHeaderActions: React.FC = () => {
  const { enabledSlugs } = useEnabledModules();

  const items = useMemo(() => {
    const out: Array<{ key: string; Component: React.LazyExoticComponent<React.ComponentType<unknown>> }> = [];
    for (const mod of registeredModules) {
      if (!enabledSlugs.has(mod.manifest.slug)) continue;
      for (const action of mod.headerActions ?? []) {
        out.push({ key: `${mod.manifest.slug}:${action.id}`, Component: action.component });
      }
    }
    return out;
  }, [enabledSlugs]);

  if (items.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {items.map(({ key, Component }) => (
        <Component key={key} />
      ))}
    </Suspense>
  );
};
