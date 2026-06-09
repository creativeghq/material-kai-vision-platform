import { lazy } from 'react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const CRMPage = lazy(() => import('./pages/CRMPage'));
const ContactDetailPage = lazy(() => import('./pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CompanyDetailPage = lazy(() => import('./pages/CompanyDetailPage').then(m => ({ default: m.CompanyDetailPage })));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage').then(m => ({ default: m.UserDetailPage })));
const CategoriesRedirect = lazy(() => import('./pages/CategoriesRedirect'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/crm',                  component: CRMPage,            requireAdmin: true },
    { path: '/admin/crm/categories',       component: CategoriesRedirect, requireAdmin: true },
    { path: '/admin/crm/contacts/:id',     component: ContactDetailPage,  requireAdmin: true },
    { path: '/admin/crm/companies/:id',    component: CompanyDetailPage,  requireAdmin: true },
    { path: '/admin/crm/users/:id',        component: UserDetailPage,     requireAdmin: true },
  ],
  // No admin-dashboard tile: CRM is already a top-nav surface (/crm, capability-gated
  // crm.view) rendering the same CRMPage. Front-nav items aren't duplicated under /admin.
  // The /admin/crm/* routes above are kept only for internal detail-page deep-links.
  navItems: [],
};

export default definition;
