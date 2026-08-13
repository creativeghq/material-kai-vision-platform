import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
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
    // `workspace_email_config` + `email_logs` are per workspace — this is where a tenant verifies
    // its own sending domain, which the operator cannot do on their behalf.
    { path: '/emails', component: EmailManagementPage, requireWorkspaceAdmin: true },
    { path: '/emails/templates/:id/edit', component: EmailTemplateBuilderPage, requireWorkspaceAdmin: true },
    { path: '/admin/emails', component: legacyAdminRedirect('/emails') },
    { path: '/admin/email-templates/:id/edit', component: legacyAdminRedirect('/emails/templates/:id/edit') },
  ],
  navItems: [
    {
      label: 'Email Management',
      path: '/emails',
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
