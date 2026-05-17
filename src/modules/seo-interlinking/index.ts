// SEO Inter-linking module — connects a user's website sitemap to the SEO article
// pipeline so generated drafts can suggest real internal links by semantic match.
//
// The admin page is now mounted inside Operations Dashboard as the
// `seo-interlinking` tab. The legacy /admin/modules/seo-interlinking route
// is kept as a redirect so old links / bookmarks still resolve.
// Per-user management still lives in Profile → Websites tab (ConnectedWebsitesTab).

import { lazy } from 'react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SeoInterlinkingRedirect = lazy(() => import('./SeoInterlinkingRedirect'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/seo-interlinking',
      component: SeoInterlinkingRedirect,
      requireAdmin: true,
    },
  ],
  navItems: [],
};

export default definition;
