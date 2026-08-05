import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { CreditCard, Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const RevolutMerchantSettingsPanel = lazy(() =>
  import('./components/RevolutMerchantSettingsPanel').then(m => ({ default: m.RevolutMerchantSettingsPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Revolut Checkout',
      path: '/admin/modules/payments-revolut/settings',
      icon: CreditCard,
      location: 'admin-dashboard',
      adminCategory: 'Finance & Billing',
      adminDescription:
        'Revolut Merchant checkout — cards, Revolut Pay, Apple/Google Pay, Pay by Bank. Per-workspace BYOK secret key.',
      adminCount: 'Payments',
    },
  ],
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: RevolutMerchantSettingsPanel },
  ],
};

export default definition;
