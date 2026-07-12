import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// #256 — Flows toolkit. Primary CREATE surface is the KAI agent chat (`manage_flows` +
// FlowFormModal); this route is the lightweight management view (list / pause / delete the
// workspace's automations). The `/automations` route carries NO requireAdmin, so
// buildModuleRoutes() wraps it in EntitlementGuard — the active workspace must own the
// 'flows-toolkit' module, else an upsell is shown. The App-Launcher nav entry lives in
// SIDEBAR_NAV_ITEMS (moduleSlug:'flows-toolkit', surface:'app'), so navItems stays empty here
// (same convention as HR / Email Marketing).
const FlowsPage = lazy(() => import('./pages/FlowsPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/automations', component: FlowsPage },
  ],
  navItems: [],
};

export default definition;
