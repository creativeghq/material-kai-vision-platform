// Contracts & e-Signature module. The feature is embedded across Finance, Projects, and HR (one
// ContractsSection per context), so it has no dedicated page — the App Launcher tile deep-links to
// the Finance → Contracts hub. Registering the ModuleDefinition surfaces it in /admin/modules
// (enable toggle + settings + billing) and in the workspace App Launcher when enabled + entitled.
// The DB `modules` row (is_addon=true) + assertEntitled('contracts') are the real paid gate.
import { FileSignature } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Contracts',
      path: '/finance?tab=contracts',
      icon: FileSignature,
      location: 'workspace',
      adminDescription: manifest.description,
    },
  ],
};

export default definition;
