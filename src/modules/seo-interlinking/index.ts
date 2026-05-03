// SEO Inter-linking module — connects a user's website sitemap to the SEO article
// pipeline so generated drafts can suggest real internal links by semantic match.
//
// Public surface:
//   - Module admin page at /admin/modules/seo-interlinking (lists ALL connected
//     sites across users, shows last crawl status, lets admin trigger a recrawl)
//   - Per-user management lives in Profile → Websites tab (ConnectedWebsitesTab)

import { lazy } from 'react';
import { Globe } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SeoInterlinkingModulePage = lazy(() => import('./pages/SeoInterlinkingModulePage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    {
      path: '/admin/modules/seo-interlinking',
      component: SeoInterlinkingModulePage,
      requireAdmin: true,
    },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/modules/seo-interlinking',
      icon: Globe,
      location: 'admin-dashboard',
      adminCategory: 'Modules',
      adminDescription: manifest.description,
      adminCount: manifest.priceTier.toUpperCase(),
    },
  ],
};

export default definition;
