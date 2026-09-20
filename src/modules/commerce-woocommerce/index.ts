import { ShoppingBasket } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'WooCommerce',
      path: '/commerce?platform=woocommerce',
      icon: ShoppingBasket,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
