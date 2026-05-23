import { lazy } from 'react';
import { DollarSign } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const FinancePage = lazy(() => import('../../pages/Admin/FinancePage'));
const InvoiceDetailPage = lazy(() => import('../../pages/Admin/InvoiceDetailPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    { path: '/admin/finance', component: FinancePage, requireAdmin: true },
    { path: '/admin/finance/invoices/:invoiceId', component: InvoiceDetailPage, requireAdmin: true },
  ],
  navItems: [
    {
      label: 'Finance',
      path: '/admin/finance',
      icon: DollarSign,
      location: 'admin-dashboard',
      adminCategory: 'Finance & Billing',
      adminDescription: 'Revenue, profit, receivables, payables, follow-up queue, cash flow, P&L.',
      adminCount: 'AR / AP / P&L',
    },
  ],
};

export default definition;
