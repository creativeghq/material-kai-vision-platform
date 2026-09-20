import { ShoppingBag } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Shopify',
      path: '/commerce?platform=shopify',
      icon: ShoppingBag,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
