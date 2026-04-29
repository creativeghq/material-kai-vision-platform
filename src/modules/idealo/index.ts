import { lazy } from 'react';
import { ShoppingCart } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const IdealoPage = lazy(() => import('./pages/IdealoPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/idealo',
      component: IdealoPage,
      requireAdmin: true,
    },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/modules/idealo',
      icon: ShoppingCart,
      location: 'admin-dashboard',
      adminCategory: 'Modules',
      adminDescription: manifest.description,
      adminCount: manifest.priceTier.toUpperCase(),
    },
  ],
};

export default definition;
