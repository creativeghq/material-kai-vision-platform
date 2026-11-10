// myAADE module — Greek business-lookup integration via ΑΑΔΕ RgWsPublic2 (SOAP/TAXISnet).
// Public API (named exports):
//   - aadeService — programmatic API for ΑΑΔΕ lookups
// Module registry (default export): consumed by src/modules/_core/registry.ts
//   - manifest, routes, navItems → registers the module on /admin/modules
//   - /admin/modules/myaade/settings is auto-mounted by ModuleSettingsPage

import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MyAadeModulePage = lazy(() => import('./pages/MyAadeModulePage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/myaade',
      component: MyAadeModulePage,
      requireAdmin: true,
    },
  ],
  navItems: [],
};

export default definition;

export { aadeService } from './services/aadeService';
export type { AadeLookupResult, AadeBasicRec, AadeFirmActivity } from './services/aadeService';
