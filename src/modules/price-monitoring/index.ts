import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const PriceMonitoringPage = lazy(() => import('./PriceMonitoringPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/price-monitoring', component: PriceMonitoringPage as any, requireWorkspaceAdmin: true },
  ],
  navItems: [],
};

export default definition;
