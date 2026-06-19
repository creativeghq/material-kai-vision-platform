import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Mail, AtSign } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const EmailManagementPage = lazy(() =>
  import('./pages/EmailManagementPage').then(m => ({ default: m.EmailManagement })),
);
const EmailTemplateBuilderPage = lazy(() =>
  import('./pages/EmailTemplateBuilderPage').then(m => ({ default: m.EmailTemplateBuilder })),
);
const EmailSettingsPanel = lazy(() =>
  import('./components/EmailSettingsPanel').then(m => ({ default: m.EmailSettingsPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/emails', component: EmailManagementPage, requireAdmin: true },
    { path: '/admin/email-templates/:id/edit', component: EmailTemplateBuilderPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Email Management',
      path: '/admin/emails',
      icon: Mail,
      location: 'admin-dashboard',
      adminCategory: 'Communications',
      adminDescription:
        'Manage email domains, templates, and monitor delivery analytics with Resend.',
      adminCount: 'Resend',
    },
  ],
  // Default sender settings (`email_settings` table). Was previously hidden
  // behind a modal triggered from the email management page — now also
  // surfaced on the generic Module Settings page so admins find it.
  settingsPanels: [
    {
      id: 'sender-defaults',
      label: 'Default Sender',
      icon: AtSign,
      component: EmailSettingsPanel,
    },
  ],
};

export default definition;
