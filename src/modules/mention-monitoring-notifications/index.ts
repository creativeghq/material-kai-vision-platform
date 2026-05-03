import { BellRing } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

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
