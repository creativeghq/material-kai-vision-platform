import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Share2, Webhook } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SocialMediaAccountsPage = lazy(() =>
  import('./pages/SocialMediaAccountsPage').then(m => ({ default: m.SocialMediaAccountsPage })),
);

// Shared with the other Zernio module — one account serves both social and WhatsApp, so the
// webhook is registered once and the profile ceiling is one number for the whole platform.
const ZernioWebhookPanel = lazy(() =>
  import('@/components/Admin/Zernio/ZernioWebhookPanel').then(m => ({ default: m.ZernioWebhookPanel })),
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
  // The Keys tab is auto-mounted by ModuleSettingsPage (ZERNIO_* are scoped here via
  // primary_module_slug). This adds the half that pasting a key does not do: telling Zernio
  // where to deliver events, and showing whether the plan still has a profile left for the
  // next tenant. Same panel on the Messaging module — one Zernio account serves both.
  settingsPanels: [
    { id: 'delivery', label: 'Delivery & plan', icon: Webhook, component: ZernioWebhookPanel },
  ],
};

export default definition;
