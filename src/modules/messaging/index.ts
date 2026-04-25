import { lazy } from 'react';
import { MessageSquare } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const MessagingManagementPage = lazy(() =>
  import('./pages/MessagingManagementPage').then(m => ({ default: m.MessagingManagement })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/messaging', component: MessagingManagementPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Messaging (SMS/WhatsApp)',
      path: '/admin/messaging',
      icon: MessageSquare,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription: 'Send SMS and WhatsApp campaigns with Twilio integration.',
      adminCount: 'Twilio',
    },
  ],
};

export default definition;
