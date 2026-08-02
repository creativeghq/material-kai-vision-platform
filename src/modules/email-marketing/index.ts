import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Email Marketing (tenant-facing add-on on the #251 framework). Routes carry NO requireAdmin,
// so buildModuleRoutes() wraps them in EntitlementGuard: the active workspace must own the
// 'email-marketing' module, else an upsell is shown. The nav entry lives in SIDEBAR_NAV_ITEMS
// (moduleSlug:'email-marketing', requireCapability:'marketing.email'), so navItems is empty here.
// Sending is workspace-scoped + BYOK-only (own Resend); the reused GrapesJS builder + campaign
// send path stay shared with the admin `email` module (component-sharing, not forking).
const EmailMarketingPage = lazy(() => import('./pages/EmailMarketingPage'));
const MarketingTemplateBuilderPage = lazy(() => import('./pages/MarketingTemplateBuilderPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/marketing/email', component: EmailMarketingPage },
    { path: '/marketing/email/templates/:id/edit', component: MarketingTemplateBuilderPage },
  ],
  navItems: [],
};

export default definition;
