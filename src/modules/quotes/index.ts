import { legacyAdminRedirect } from '@/modules/_core/legacyAdminRedirect';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { FileText, Image as ImageIcon } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const QuotesPage = lazy(() => import('./pages/QuotesPage').then(m => ({ default: m.QuotesPage })));
const QuoteDetailCustomerPage = lazy(() =>
  import('./pages/QuoteDetailCustomerPage').then(m => ({ default: m.QuoteDetailCustomerPage })),
);
const QuotePreviewPage = lazy(() =>
  import('./pages/QuotePreviewPage').then(m => ({ default: m.QuotePreviewPage })),
);
const QuoteRequestsPage = lazy(() =>
  import('./pages/QuoteRequestsPage').then(m => ({ default: m.QuoteRequestsPage })),
);
const QuoteRequestsAdminPage = lazy(() =>
  import('./pages/QuoteRequestsAdminPage').then(m => ({ default: m.QuoteRequestsAdmin })),
);
const QuoteDetailAdminPage = lazy(() =>
  import('./pages/QuoteDetailAdminPage').then(m => ({ default: m.QuoteDetailPage })),
);
const StatusTagsManagementPage = lazy(() =>
  import('./pages/StatusTagsManagementPage').then(m => ({ default: m.StatusTagsManagement })),
);
const UpsellsManagementPage = lazy(() =>
  import('./pages/UpsellsManagementPage').then(m => ({ default: m.UpsellsManagement })),
);
const TimelineStepsManagementPage = lazy(() =>
  import('./pages/TimelineStepsManagementPage').then(m => ({ default: m.TimelineStepsManagement })),
);
const QuoteSettingsPage = lazy(() =>
  import('./pages/QuoteSettingsPage').then(m => ({ default: m.QuoteSettingsPage })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/quotes', component: QuotesPage },
    { path: '/quotes/:id', component: QuoteDetailCustomerPage },
    { path: '/quotes/:id/preview', component: QuotePreviewPage },
    { path: '/quotes/requests', component: QuoteRequestsPage },
    // The BACK-OFFICE half of the same module: the seller's queue and the vocabulary their quotes
    // are built from (status tags, upsells, timeline steps, defaults). All of it is the tenant's
    // own configuration, so it sits beside /quotes rather than in the operator console — behind
    // AdminGuard the workspace that sells the quotes could not edit its own status tags.
    { path: '/quotes/requests/manage', component: QuoteRequestsAdminPage, requireWorkspaceAdmin: true },
    { path: '/quotes/manage/:id', component: QuoteDetailAdminPage, requireWorkspaceAdmin: true },
    { path: '/quotes/settings', component: QuoteSettingsPage, requireWorkspaceAdmin: true },
    { path: '/quotes/settings/status-tags', component: StatusTagsManagementPage, requireWorkspaceAdmin: true },
    { path: '/quotes/settings/upsells', component: UpsellsManagementPage, requireWorkspaceAdmin: true },
    { path: '/quotes/settings/timeline-steps', component: TimelineStepsManagementPage, requireWorkspaceAdmin: true },
    { path: '/admin/quote-requests', component: legacyAdminRedirect('/quotes/requests/manage') },
    { path: '/admin/quotes/:id', component: legacyAdminRedirect('/quotes/manage/:id') },
    { path: '/admin/status-tags', component: legacyAdminRedirect('/quotes/settings/status-tags') },
    { path: '/admin/upsells', component: legacyAdminRedirect('/quotes/settings/upsells') },
    { path: '/admin/timeline-steps', component: legacyAdminRedirect('/quotes/settings/timeline-steps') },
    { path: '/admin/quote-settings', component: legacyAdminRedirect('/quotes/settings') },
  ],
  navItems: [
    {
      label: 'Quote Requests',
      path: '/quotes/requests/manage',
      icon: FileText,
      location: 'admin-dashboard',
      adminCategory: 'CRM & User Management',
      adminDescription: 'View and manage customer quote requests with pricing.',
      adminCount: 'Quote System',
    },
  ],
  // Module Settings page (/admin/modules/quotes/settings) auto-mounts these
  // alongside the "Keys" tab. PDF template uploads + company info + default
  // VAT now live there instead of being hidden at /admin/quote-settings
  // (the original route still works — same component).
  settingsPanels: [
    {
      id: 'pdf-templates',
      label: 'PDF & Templates',
      icon: ImageIcon,
      component: QuoteSettingsPage,
    },
  ],
};

export default definition;
