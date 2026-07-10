import manifest from './manifest.json';
import type { ModuleDefinition, ModuleManifest } from '../_core';

// #256 — Flows toolkit. A paid add-on on the #251 framework whose primary surface is the KAI
// agent chat (the `manage_flows` tool + FlowFormModal), NOT a dedicated page — so it contributes
// no routes/navItems for v1. The DB `modules` row (enabled=true, is_addon=true) is what makes it
// appear in Profile → Modules for a workspace owner to activate; activation grants the
// workspace entitlement the agent tool checks. A read-only "Automations" management page is a
// deferred v2 follow-up.
const definition: ModuleDefinition = {
  manifest: manifest as ModuleManifest,
  routes: [],
  navItems: [],
};

export default definition;
