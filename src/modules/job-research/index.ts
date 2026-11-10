// Job Research module — backend-driven feature. Tracked job searches surface in
// Background Agents (`agent_type='job-research'`) and in KAI conversations
// (digest chat-posts + tool replies). No dedicated admin route — registration
// exists so `is_module_enabled('job-research')` has a frontend counterpart and
// admins can toggle it from /admin/modules.

import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
