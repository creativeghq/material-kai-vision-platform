import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { CreditCard, Building2, Receipt } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const BusinessDetailsPanel = lazy(() =>
  import('./components/BusinessDetailsPanel').then(m => ({ default: m.BusinessDetailsPanel })),
);
const ProvidersPanel = lazy(() =>
  import('./components/ProvidersPanel').then(m => ({ default: m.ProvidersPanel })),
);
const InvoicingPanel = lazy(() =>
  import('./components/InvoicingPanel').then(m => ({ default: m.InvoicingPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
  // The Module Settings page auto-mounts a Keys tab (SecretsManagerCard for
  // any secret linked to this module via platform_secret_module_links — Stripe
  // keys appear here as informational; the primary location is payments-stripe).
  // Business — legal entity printed on invoices + used as Stripe statement
  //   descriptor source. Single source of truth on finance_settings.
  // Providers — lists every enabled module with provides.payments=true.
  settingsPanels: [
    { id: 'business', label: 'Business', icon: Building2, component: BusinessDetailsPanel },
    { id: 'providers', label: 'Providers', icon: CreditCard, component: ProvidersPanel },
    { id: 'invoicing', label: 'Invoicing', icon: Receipt, component: InvoicingPanel },
  ],
};

export default definition;
