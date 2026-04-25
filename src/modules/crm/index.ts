import { lazy } from 'react';
import { Users } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const CRMPage = lazy(() => import('./pages/CRMPage'));
const ContactDetailPage = lazy(() => import('./pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CompanyDetailPage = lazy(() => import('./pages/CompanyDetailPage').then(m => ({ default: m.CompanyDetailPage })));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage').then(m => ({ default: m.UserDetailPage })));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/crm',                  component: CRMPage,           requireAdmin: true },
    { path: '/admin/crm/contacts/:id',     component: ContactDetailPage, requireAdmin: true },
    { path: '/admin/crm/companies/:id',    component: CompanyDetailPage, requireAdmin: true },
    { path: '/admin/crm/users/:id',        component: UserDetailPage,    requireAdmin: true },
  ],
  navItems: [
    {
      label: manifest.name,
      path: '/admin/crm',
      icon: Users,
      location: 'admin-dashboard',
      adminCategory: 'CRM & User Management',
      adminDescription: 'Manage users, roles, subscriptions, contacts, companies.',
      adminCount: 'CRM System',
    },
  ],
};

export default definition;
