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
    // `presentation_catalogs` / `catalog_source_pdfs` all carry
    // workspace_id — a catalog is the tenant's own sales collateral.
    { path: '/catalogs', component: CatalogsListPage, requireWorkspaceAdmin: true },
    { path: '/catalogs/sources', component: CatalogSourcesPage, requireWorkspaceAdmin: true },
    { path: '/catalogs/:id', component: CatalogBuilderPage, requireWorkspaceAdmin: true },
  ],
  navItems: [],
};

export default definition;
