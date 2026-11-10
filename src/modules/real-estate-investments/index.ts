import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Investments is an entitlement-gated add-on that surfaces as tabs INSIDE the Real Estate
// module (the "Investments" portfolio tab + per-listing "Investment" tab), not as its own route.
// No routes/settingsPanels of its own; the DB `modules` row + this registration drive the catalog,
// admin Modules page, and per-workspace entitlement.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
