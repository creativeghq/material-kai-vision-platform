import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const HRPage = lazy(() => import('./pages/HRPage'));

// #252 — HR module (first paid add-on on the #251 framework). The `/hr` route carries NO
// requireAdmin, so buildModuleRoutes() wraps it in EntitlementGuard (tenant-facing): the active
// workspace must own the 'hr' module, else an upsell card is shown. The nav entry lives in
// SIDEBAR_NAV_ITEMS (moduleSlug:'hr', requireCapability:'hr.view') so it appears only when the
// workspace is entitled — navItems is intentionally empty here (same convention as the CRM module).
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/hr', component: HRPage },
  ],
  navItems: [],
};

export default definition;
