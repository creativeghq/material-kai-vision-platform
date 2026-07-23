import { KeyRound } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// #281 — Property Management is an entitlement-gated add-on that surfaces as tabs INSIDE the Real
// Estate module (the "Property Mgmt" / per-listing "Lettings" tabs), not as its own route. It has
// no routes/settingsPanels of its own; the DB `modules` row + this registration drive the catalog,
// admin Modules page, and per-workspace entitlement. An admin-dashboard card aids discovery.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Property Management',
      path: '/properties',
      icon: KeyRound,
      location: 'admin-dashboard',
      adminCategory: 'Operations',
      adminDescription: 'Real Estate add-on: tenancies, rent ledger, maintenance and landlord statements. Managed from the Real Estate app.',
      adminCount: 'Real Estate',
    },
  ],
};

export default definition;
