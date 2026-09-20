// The channel modules own no route: they point into this one with ?platform=.
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Plug } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SalesChannelsPage = lazy(() => import('./pages/SalesChannelsPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/commerce', component: SalesChannelsPage },
  ],
  navItems: [
    {
      label: 'Sales Channels',
      path: '/commerce',
      icon: Plug,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
