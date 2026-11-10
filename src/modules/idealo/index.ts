import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const IdealoPage = lazy(() => import('./pages/IdealoPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/idealo',
      component: IdealoPage,
      requireAdmin: true,
    },
  ],
  navItems: [],
};

export default definition;
