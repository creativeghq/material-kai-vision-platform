import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Share2, Webhook, Star } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const SocialMediaAccountsPage = lazy(() =>
  import('./pages/SocialMediaAccountsPage').then(m => ({ default: m.SocialMediaAccountsPage })),
);

const ReviewsPage = lazy(() =>
  import('./pages/ReviewsPage').then(m => ({ default: m.ReviewsPage })),
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
    // Reviews are workspace-scoped like the accounts, but NOT admin-only: answering a review is
    // day-to-day work for whoever runs the desk, not a configuration change.
    { path: '/social-media/reviews', component: ReviewsPage },
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
    {
      label: 'Reviews',
      path: '/social-media/reviews',
      icon: Star,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription:
        'Reviews left on your connected Google Business profile. Reply straight to the platform.',
      adminCount: 'Google',
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
