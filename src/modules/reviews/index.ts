// Reviews & Ratings module. An EMBEDDED feature (no standalone page): it surfaces inside the
// product detail modal (Reviews tab) and profile pages. Registering the ModuleDefinition makes it
// appear in /admin/modules as an enable/disable governance card; the DB `modules` row + the
// backend `is_module_enabled('reviews')` check are what actually gate it. No routes / nav items
// because there is no dedicated page — reviews live where the products and profiles are.
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
