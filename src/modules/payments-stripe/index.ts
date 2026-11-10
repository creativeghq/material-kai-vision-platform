import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const StripeConfigPanel = lazy(() =>
  import('./components/StripeConfigPanel').then(m => ({ default: m.StripeConfigPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
  // Keys tab is auto-mounted by ModuleSettingsPage (renders SecretsManagerCard
  // for STRIPE_* secrets scoped to payments-stripe). This panel adds the
  // Configure tab with the non-secret operational surface.
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: StripeConfigPanel },
  ],
};

export default definition;
