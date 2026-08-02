import { LineChart } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Investments is an entitlement-gated add-on that surfaces as tabs INSIDE the Real Estate
// module (the "Investments" portfolio tab + per-listing "Investment" tab), not as its own route.
// No routes/settingsPanels of its own; the DB `modules` row + this registration drive the catalog,
// admin Modules page, and per-workspace entitlement. An admin-dashboard card aids discovery.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Investments',
      path: '/properties',
      icon: LineChart,
      location: 'admin-dashboard',
      adminCategory: 'Operations',
      adminDescription: 'Real Estate add-on: per-property yield / cap rate / cash-on-cash / cash-flow analysis + portfolio roll-up. Managed from the Real Estate app.',
      adminCount: 'Real Estate',
    },
  ],
};

export default definition;
