import { lazy } from 'react';
import { DollarSign, Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const FinancePage = lazy(() => import('../../pages/Admin/FinancePage'));
const InvoiceDetailPage = lazy(() => import('../../pages/Admin/InvoiceDetailPage'));
const FinanceSettingsPanel = lazy(() =>
  import('./components/FinanceSettingsPanel').then(m => ({ default: m.FinanceSettingsPanel })),
);

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
  // Statement template uploads + invoice/PO numbering + dunning defaults +
  // mailer config — all live in SettingsTab today, also auto-mounted on the
  // generic Module Settings page so admins find them in one place.
  settingsPanels: [
    {
      id: 'finance-defaults',
      label: 'Statement & Numbering',
      icon: Sliders,
      component: FinanceSettingsPanel,
    },
  ],
};

export default definition;
