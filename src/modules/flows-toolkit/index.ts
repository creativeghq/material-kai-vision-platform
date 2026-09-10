import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Flows toolkit. The `/automations` page is both the management list AND the visual
// builder (the shared admin xyflow builder in tenantMode — palette trimmed to the tenant-safe
// subset; the DB tenant-write RLS + flows_tenant_allowlist_guard trigger are the real fence).
const FlowsPage = lazy(() => import('./pages/FlowsPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/automations', component: FlowsPage },
  ],
  navItems: [],
};

export default definition;
