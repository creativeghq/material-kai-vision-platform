import { lazy } from 'react';
import { Share2 } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SocialMediaAccountsPage = lazy(() =>
  import('./pages/SocialMediaAccountsPage').then(m => ({ default: m.SocialMediaAccountsPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/social-media/accounts', component: SocialMediaAccountsPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Social Media Accounts',
      path: '/admin/social-media/accounts',
      icon: Share2,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription:
        'View all workspace social accounts connected via Late.dev. Users connect their own accounts from their profile.',
      adminCount: 'Late.dev',
    },
  ],
};

export default definition;
