import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const RealEstatePage = lazy(() => import('./pages/RealEstatePage'));

// #249 — Real Estate module (purchasable add-on on the #251 framework, sibling of HR #252). The
// `/properties` route carries NO requireAdmin, so buildModuleRoutes() wraps it in EntitlementGuard
// (tenant-facing): the active workspace must own the 'real-estate' module, else an upsell card
// shows. The nav entry lives in SIDEBAR_NAV_ITEMS (moduleSlug:'real-estate',
// requireCapability:'realestate.view') so it appears only when the workspace is entitled —
// navItems is intentionally empty here (same convention as the HR/CRM modules).
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/properties', component: RealEstatePage },
  ],
  navItems: [],
};

export default definition;
