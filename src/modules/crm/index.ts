import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const UserDetailPage = lazy(() => import('./pages/UserDetailPage').then(m => ({ default: m.UserDetailPage })));
// `/admin/crm/*` → `/crm/*`. See CrmLegacyRedirect for why the admin half was retired.
const CrmRootRedirect = lazy(() => import('./pages/CrmLegacyRedirect').then(m => ({ default: m.CrmRootRedirect })));
const CrmCategoriesRedirect = lazy(() => import('./pages/CrmLegacyRedirect').then(m => ({ default: m.CrmCategoriesRedirect })));
const CrmContactRedirect = lazy(() => import('./pages/CrmLegacyRedirect').then(m => ({ default: m.CrmContactRedirect })));
const CrmCompanyRedirect = lazy(() => import('./pages/CrmLegacyRedirect').then(m => ({ default: m.CrmCompanyRedirect })));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    // CRM is workspace work, so it lives at `/crm/*` (App.tsx, capability `crm.view`) and these
    // are redirects for the links that outlived the move. `requireAdmin` is deliberately OFF:
    // an old `/admin/crm/...` link under AdminGuard bounced exactly the staff — sales,
    // accountant, hr — the move exists to let through.
    { path: '/admin/crm',               component: CrmRootRedirect },
    { path: '/admin/crm/categories',    component: CrmCategoriesRedirect },
    { path: '/admin/crm/contacts/:id',  component: CrmContactRedirect },
    { path: '/admin/crm/companies/:id', component: CrmCompanyRedirect },
    // The exception, and a real one: `public.roles` is the GLOBAL account tier (supplier /
    // architect / admin) — one value true in every workspace at once — and `crm-api` refuses to
    // mutate it for anyone who is not a global operator. That is operator tooling, not tenant
    // work, so it keeps its /admin address and its AdminGuard.
    { path: '/admin/crm/users/:id',     component: UserDetailPage, requireAdmin: true },
  ],
  // No admin-dashboard tile: CRM is a top-nav surface (/crm, capability-gated crm.view).
  navItems: [],
};

export default definition;
