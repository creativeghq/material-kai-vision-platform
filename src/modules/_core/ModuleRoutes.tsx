import React from 'react';
import { Route } from 'react-router-dom';

import { AuthGuard } from '@/components/core/AuthGuard';
import { AdminGuard } from '@/components/core/AdminGuard';
import { EntitlementGuard } from '@/components/core/EntitlementGuard';
import { Layout } from '@/components/core/Layout';
import { PageErrorBoundary } from '@/components/core/ErrorBoundary';
import { PageLoader } from '@/components/core/PageLoader';

import { registeredModules } from './registry';
import { useModule } from './useEnabledModules';

const ModuleGate: React.FC<{ slug: string; children: React.ReactNode }> = ({ slug, children }) => {
  const { enabled, isLoading } = useModule(slug);
  // Show the shared loader (not a blank screen) while the module-enabled lookup resolves, so
  // navigating to a module route matches the loading state every other page shows.
  if (isLoading) return <PageLoader />;
  if (!enabled) {
    return (
      <div className="container mx-auto py-12 text-center text-sm text-muted-foreground">
        This module is disabled. Enable it from <a href="/admin/modules" className="text-primary">/admin/modules</a>.
      </div>
    );
  }
  return <>{children}</>;
};

/**
 * Generates <Route> elements for every registered module.
 * Use as a direct child of <Routes> in App.tsx.
 */
export function buildModuleRoutes(): React.ReactElement[] {
  const elements: React.ReactElement[] = [];

  for (const mod of registeredModules) {
    for (const route of mod.routes) {
      const Component = route.component;
      const requireAdmin = route.requireAdmin ?? false;

      // Admin routes are operator platform-management surfaces → gated by AdminGuard only.
      // Tenant-facing module routes additionally require the ACTIVE workspace to OWN the module
      // (#212/#214) — EntitlementGuard shows an upsell otherwise. (The operator root is entitled
      // to everything, and free-tier modules are available to all, so neither is affected.)
      const tree = (
        <AuthGuard>
          <ModuleGate slug={mod.manifest.slug}>
            {requireAdmin ? (
              <AdminGuard>
                <Layout>
                  <Component />
                </Layout>
              </AdminGuard>
            ) : (
              <EntitlementGuard moduleSlug={mod.manifest.slug} moduleName={mod.manifest.name}>
                <Layout>
                  <Component />
                </Layout>
              </EntitlementGuard>
            )}
          </ModuleGate>
        </AuthGuard>
      );

      elements.push(
        <Route
          key={`${mod.manifest.slug}:${route.path}`}
          path={route.path}
          element={
            <PageErrorBoundary name={`Module: ${mod.manifest.name}`}>
              {tree}
            </PageErrorBoundary>
          }
        />,
      );
    }
  }

  return elements;
}
