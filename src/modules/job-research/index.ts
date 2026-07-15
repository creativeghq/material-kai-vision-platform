// Job Research module — backend-driven feature. Tracked job searches surface in
// Background Agents (`agent_type='job-research'`) and in KAI conversations
// (digest chat-posts + tool replies). No dedicated admin route — registration
// exists so `is_module_enabled('job-research')` has a frontend counterpart and
// admins can toggle it from /admin/modules.

import { Briefcase } from 'lucide-react';
import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [
    {
      label: 'Job Research',
      path: '/admin/ai-configs?tab=background-agents',
      icon: Briefcase,
      location: 'admin-dashboard',
      adminCategory: 'Data Management',
      adminDescription:
        'Per-user job-discovery agent (Google Jobs + Perplexity + RSS + career pages) with consolidated daily digests.',
      adminCount: 'Background Agent',
    },
  ],
};

export default definition;
