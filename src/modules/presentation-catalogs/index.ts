import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
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
  // Single entry point: catalogs are surfaced under Operations → Catalogs
  // (/admin/operations?tab=catalogs), which links into the builder routes above.
  // The standalone admin-dashboard grid item was removed to avoid a duplicate entry.
  navItems: [],
};

export default definition;
