// SEO Inter-linking module — connects a user's website sitemap to the SEO article
// pipeline so generated drafts can suggest real internal links by semantic match.

import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
