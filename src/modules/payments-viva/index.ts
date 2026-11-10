import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const VivaSettingsPanel = lazy(() =>
  import('./components/VivaSettingsPanel').then(m => ({ default: m.VivaSettingsPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
  // Unlike payments-stripe, there is no platform-level key to manage here: Viva is BYOK,
  // so every credential is per-workspace and lives on this panel (and Profile → Keys).
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: VivaSettingsPanel },
  ],
};

export default definition;
