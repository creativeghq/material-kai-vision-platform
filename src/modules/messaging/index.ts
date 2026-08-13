import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { MessageSquare } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MessagingManagementPage = lazy(() =>
  import('./pages/MessagingManagementPage').then(m => ({ default: m.MessagingManagement })),
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
};

export default definition;
