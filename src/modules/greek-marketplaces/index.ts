import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const GreekMarketplacesPage = lazy(() => import('./pages/GreekMarketplacesPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/greek-marketplaces',
      component: GreekMarketplacesPage,
      requireAdmin: true,
    },
  ],
  navItems: [],
};

export default definition;
