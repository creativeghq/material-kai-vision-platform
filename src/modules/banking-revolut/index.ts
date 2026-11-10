import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const RevolutSettingsPanel = lazy(() =>
  import('./components/RevolutSettingsPanel').then(m => ({ default: m.RevolutSettingsPanel })),
);
const RevolutCallbackPage = lazy(() => import('./pages/RevolutCallbackPage'));

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [
    // OAuth consent return — the URI registered in the Revolut dashboard.
    { path: '/revolut/callback', component: RevolutCallbackPage },
  ],
  navItems: [],
  // BYOK like payments-viva: nothing platform-level to configure; every credential is
  // per-workspace and lives on this panel (and Profile → Keys).
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: RevolutSettingsPanel },
  ],
};

export default definition;
