// Oxygen module — Greek e-invoicing pre-invoice (notice) integration with oxygen.gr.
//
// Public API (named exports):
//   - <OxygenPreInvoiceButton quote={quote} onSynced={fn} /> — drop-in admin button
//   - oxygenService — programmatic API
//
// Module registry (default export): consumed by src/modules/_core/registry.ts
//   - manifest, routes, navItems → registers the module on /admin/modules

import { lazy } from 'react';
import { FileText } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const OxygenModulePage = lazy(() => import('./pages/OxygenModulePage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/oxygen',
      component: OxygenModulePage,
      requireAdmin: true,
    },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/modules/oxygen',
      icon: FileText,
      location: 'admin-dashboard',
      adminCategory: 'Modules',
      adminDescription: manifest.description,
      adminCount: manifest.priceTier.toUpperCase(),
    },
  ],
};

export default definition;

// Named exports — used by mount points that don't go through the route registry,
// e.g. QuoteDetailAdminPage.tsx imports the button directly.
export { OxygenPreInvoiceButton } from './components/OxygenPreInvoiceButton';
export { CustomerLinkDialog } from './components/CustomerLinkDialog';
export { oxygenService } from './services/oxygenService';
export type { OxygenSyncResult, QuoteCustomerLink, QuoteOxygenView } from './types';
