import { Store } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Skroutz',
      path: '/commerce?platform=skroutz',
      icon: Store,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
