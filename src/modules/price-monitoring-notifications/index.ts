import { BellRing } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// No dedicated admin page yet — preferences are inlined into ProductMonitorTab.
// The module slot exists so the registry can gate the dispatcher, surface
// enable/disable from the modules admin page, and own the slug for credit
// logging / module discovery.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/modules',
      icon: BellRing,
      location: 'admin-dashboard',
      adminCategory: 'Modules',
      adminDescription: manifest.description,
      adminCount: manifest.priceTier.toUpperCase(),
    },
  ],
};

export default definition;
