import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const UserDetailPage = lazy(() => import('./pages/UserDetailPage').then(m => ({ default: m.UserDetailPage })));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    // `public.roles` is the GLOBAL account tier, true in every workspace at once, so a platform
    // account is operator tooling: it lives under Admin → Users, behind AdminGuard.
    { path: '/admin/users/:id', component: UserDetailPage, requireAdmin: true },
  ],
  navItems: [],
};

export default definition;
