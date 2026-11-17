import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Finance is WORKSPACE-based, so it lives on the front end only (/finance,
// /finance/invoices/:id in App.tsx) — not under /admin. The module entry remains
// so the `sales-finance` secrets (Novus master key) surface at the module's
// settings → Keys page for the operator.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
