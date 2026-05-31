import { lazy } from 'react';
import { CreditCard, Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const StripeConfigPanel = lazy(() =>
  import('./components/StripeConfigPanel').then(m => ({ default: m.StripeConfigPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Stripe',
      path: '/admin/modules/payments-stripe/settings',
      icon: CreditCard,
      location: 'admin-dashboard',
      adminCategory: 'Finance & Billing',
      adminDescription:
        'Stripe as a payment provider. Webhook URL, dashboard quick links, product/price IDs. Keys live on the Keys tab.',
      adminCount: 'Payments',
    },
  ],
  // Keys tab is auto-mounted by ModuleSettingsPage (renders SecretsManagerCard
  // for STRIPE_* secrets scoped to payments-stripe). This panel adds the
  // Configure tab with the non-secret operational surface.
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: StripeConfigPanel },
  ],
};

export default definition;
