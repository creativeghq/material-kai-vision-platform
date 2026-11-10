import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MentionMonitoringDashboard = lazy(() =>
  import('@/components/business/mention-monitoring/MentionMonitoringDashboard'),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      // `tracked_mentions` is workspace-scoped: what a tenant watches is theirs.
      path: '/mention-monitoring',
      component: MentionMonitoringDashboard as any,
      requireWorkspaceAdmin: true,
    },
    { path: '/admin/mention-monitoring', component: legacyAdminRedirect('/mention-monitoring') },
  ],
  navItems: [],
};

export default definition;
