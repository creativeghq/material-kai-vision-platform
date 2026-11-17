import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// SEO Toolkit moved into Operations Dashboard as a tab. The standalone route
// is preserved as a redirect so old links / bookmarks still work.
const SeoToolkitRedirect = lazy(() => import('./SeoToolkitRedirect'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/seo',
      component: SeoToolkitRedirect,
      requireAdmin: true,
    },
  ],
  navItems: [],
};

export default definition;
