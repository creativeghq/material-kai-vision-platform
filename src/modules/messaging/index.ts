import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { MessageSquare, Webhook } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MessagingManagementPage = lazy(() =>
  import('./pages/MessagingManagementPage').then(m => ({ default: m.MessagingManagement })),
);

// Shared with the other Zernio module — one account serves both social and WhatsApp, so the
// webhook is registered once and the profile ceiling is one number for the whole platform.
const ZernioWebhookPanel = lazy(() =>
  import('@/components/Admin/Zernio/ZernioWebhookPanel').then(m => ({ default: m.ZernioWebhookPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    // `messaging_channels` / `messaging_logs` are workspace-scoped: every workspace configures
    // its OWN sender. Behind AdminGuard only the platform operator could open this, so a customer
    // who bought the module could not set it up at all.
    { path: '/messaging', component: MessagingManagementPage, requireWorkspaceAdmin: true },
    { path: '/admin/messaging', component: legacyAdminRedirect('/messaging') },
  ],
  navItems: [
    {
      label: 'Messaging (WhatsApp)',
      path: '/messaging',
      icon: MessageSquare,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription: 'Send WhatsApp campaigns and capture replies via Zernio.',
      adminCount: 'Zernio',
    },
  ],
  // Operator-side setup for the shared Zernio account. The register-webhook button also exists on
  // the Channels tab of /messaging, but that is a TENANT page behind a workspace-admin guard and
  // is not reachable from the app menu — the operator pasting the secret is here, on the Keys tab.
  settingsPanels: [
    { id: 'delivery', label: 'Delivery & plan', icon: Webhook, component: ZernioWebhookPanel },
  ],
};

export default definition;
