import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// Property Management is an entitlement-gated add-on that surfaces as tabs INSIDE the Real
// Estate module (the "Property Mgmt" / per-listing "Lettings" tabs), not as its own route. It has
// no routes/settingsPanels of its own; the DB `modules` row + this registration drive the catalog,
// admin Modules page, and per-workspace entitlement.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
