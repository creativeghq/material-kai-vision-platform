// Contracts & e-Signature module. Contracts span HR, Finance and Projects, so they get their own
// top-level page (/contracts) — the per-entity ContractsSection views (project detail, employee
// dialog, customer) are contextual sub-views that feed the same list. Registering the
// ModuleDefinition surfaces it in /admin/modules (enable toggle + settings + billing) and in the
// workspace App Launcher when enabled + entitled. The DB `modules` row (is_addon=true) +
// assertEntitled('contracts') are the real paid gate.
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { FileSignature } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const ContractsPage = lazy(() => import('./pages/ContractsPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/contracts', component: ContractsPage },
  ],
  navItems: [
    {
      label: 'Contracts',
      path: '/contracts',
      icon: FileSignature,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
