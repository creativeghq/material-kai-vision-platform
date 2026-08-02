// SEO Inter-linking module — connects a user's website sitemap to the SEO article
// pipeline so generated drafts can suggest real internal links by semantic match.
// The admin page is now mounted inside Operations Dashboard → SEO Toolkit as
// the `interlinking` sub-tab. The legacy /admin/modules/seo-interlinking route
// is kept as a redirect so old links / bookmarks still resolve.
// Workspace-shared management lives in Profile → Websites tab (WebsitesTab), where
// each connected website opens a per-site SEO dashboard (articles, keyword research,
// toolkit runs, domain audits).

import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
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
