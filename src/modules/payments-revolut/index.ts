import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { Sliders } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const RevolutMerchantSettingsPanel = lazy(() =>
  import('./components/RevolutMerchantSettingsPanel').then(m => ({ default: m.RevolutMerchantSettingsPanel })),
);

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
  settingsPanels: [
    { id: 'configure', label: 'Configure', icon: Sliders, component: RevolutMerchantSettingsPanel },
  ],
};

export default definition;
