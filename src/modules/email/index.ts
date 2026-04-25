import { lazy } from 'react';
import { Mail } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const EmailManagementPage = lazy(() =>
  import('./pages/EmailManagementPage').then(m => ({ default: m.EmailManagement })),
);
const EmailTemplateBuilderPage = lazy(() =>
  import('./pages/EmailTemplateBuilderPage').then(m => ({ default: m.EmailTemplateBuilder })),
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
};

export default definition;
