import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Share2 } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SocialMediaAccountsPage = lazy(() =>
  import('./pages/SocialMediaAccountsPage').then(m => ({ default: m.SocialMediaAccountsPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    // `social_accounts` is workspace-scoped — these are the tenant's own connected accounts.
    { path: '/social-media/accounts', component: SocialMediaAccountsPage, requireWorkspaceAdmin: true },
    { path: '/admin/social-media/accounts', component: legacyAdminRedirect('/social-media/accounts') },
  ],
  navItems: [
    {
      label: 'Social Media Accounts',
      path: '/social-media/accounts',
      icon: Share2,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription:
        'View all workspace social accounts connected via Zernio. Users connect their own accounts from their profile.',
      adminCount: 'Zernio',
    },
  ],
};

export default definition;
