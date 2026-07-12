import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const StockPage = lazy(() => import('./pages/StockPage'));

// Stock Management module — the warehouse/inventory feature promoted out of the Finance tab into a
// first-class PAID ADD-ON (mirrors HR #252). The `/stock` route carries NO requireAdmin, so
// buildModuleRoutes() wraps it in EntitlementGuard: the active workspace must own the 'stock' module,
// else an upsell card is shown. The nav entry lives in SIDEBAR_NAV_ITEMS (moduleSlug:'stock',
// requireCapability:'warehouse.manage') so it appears only when entitled — navItems stays empty here
// (same convention as CRM / HR).
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/warehouse', component: StockPage },
  ],
  navItems: [],
};

export default definition;
