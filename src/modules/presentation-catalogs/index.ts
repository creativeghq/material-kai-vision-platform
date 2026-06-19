import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { BookOpen } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const CatalogsListPage = lazy(() =>
  import('./pages/CatalogsListPage').then((m) => ({ default: m.CatalogsListPage })),
);
const CatalogBuilderPage = lazy(() =>
  import('./pages/CatalogBuilderPage').then((m) => ({ default: m.CatalogBuilderPage })),
);
const CatalogSourcesPage = lazy(() =>
  import('./pages/CatalogSourcesPage').then((m) => ({ default: m.CatalogSourcesPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/catalogs', component: CatalogsListPage, requireAdmin: true },
    { path: '/admin/catalogs/sources', component: CatalogSourcesPage, requireAdmin: true },
    { path: '/admin/catalogs/:id', component: CatalogBuilderPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Presentation Catalogs',
      path: '/admin/catalogs',
      icon: BookOpen,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription: 'Build email-gated catalog landing pages and PDFs from manufacturer source PDFs.',
      adminCount: 'Catalogs',
    },
  ],
};

export default definition;
