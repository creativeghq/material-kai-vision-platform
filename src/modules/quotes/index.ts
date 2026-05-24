import { lazy } from 'react';
import { FileText } from 'lucide-react';
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
    { path: '/admin/quote-requests', component: QuoteRequestsAdminPage, requireAdmin: true },
    { path: '/admin/quotes/:id', component: QuoteDetailAdminPage, requireAdmin: true },
    { path: '/admin/status-tags', component: StatusTagsManagementPage, requireAdmin: true },
    { path: '/admin/upsells', component: UpsellsManagementPage, requireAdmin: true },
    { path: '/admin/timeline-steps', component: TimelineStepsManagementPage, requireAdmin: true },
    { path: '/admin/quote-settings', component: QuoteSettingsPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Quote Requests',
      path: '/admin/quote-requests',
      icon: FileText,
      location: 'admin-dashboard',
      adminCategory: 'CRM & User Management',
      adminDescription: 'View and manage customer quote requests with pricing.',
      adminCount: 'Quote System',
    },
  ],
};

export default definition;
