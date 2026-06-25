/**
 * Background Agent Registry
 *
 * Maps agent_type strings (stored in background_agents.agent_type)
 * to concrete AgentRunner implementations.
 *
 * To add a new agent:
 *   1. Create `your-agent.ts` implementing AgentRunner
 *   2. Import and add it here
 *   3. (If the agent belongs to a feature module) tag it in
 *      `MODULE_AGENT_SLUG` below so it's gated on module-enabled.
 *   4. It immediately appears in the UI's "Agent Type" dropdown.
 */

import type { AgentRunner, AgentTypeCatalogEntry } from './types.ts';
import { ProductEnrichmentAgent }   from './product-enrichment-agent.ts';
import { MaterialTaggerAgent }      from './material-tagger-agent.ts';
import { KaiTaskAgent }             from './kai-task-agent.ts';
import { SocialAnalyticsSyncAgent } from '../modules/social-media/agents/social-analytics-sync-agent.ts';
import { SocialInsightsSyncAgent }  from '../modules/social-media/agents/social-insights-sync-agent.ts';
import { FactoryEnrichmentAgent }   from './factory-enrichment-agent.ts';
import { ModelHealthCheckAgent }    from './model-health-check-agent.ts';
import { TechRadarAgent }           from './tech-radar-agent.ts';
import { EmbeddingBackfillAgent }   from './embedding-backfill-agent.ts';
import { isModuleEnabled, moduleSupabaseClient } from '../modules/registry.ts';

const RUNNERS: AgentRunner[] = [
  new KaiTaskAgent(),
  new ProductEnrichmentAgent(),
  new MaterialTaggerAgent(),
  new SocialAnalyticsSyncAgent(),
  new SocialInsightsSyncAgent(),
  new FactoryEnrichmentAgent(),
  new ModelHealthCheckAgent(),
  new TechRadarAgent(),
  new EmbeddingBackfillAgent(),
];

/**
 * agent_type → module slug, for agents that belong to a toggleable module.
 * Agents NOT in this map are platform-tier and always run regardless of
 * module state (e.g. ProductEnrichmentAgent, MaterialTaggerAgent).
 *
 * When you add a module-bound agent, register it here so the runner +
 * scheduler can fail-closed when the module is disabled.
 */
export const MODULE_AGENT_SLUG: Readonly<Record<string, string>> = {
  'social-analytics-sync': 'social-media',
  'social-insights-sync':  'social-media',
};

/** Keyed map for fast O(1) lookup by agent_type */
export const AGENT_REGISTRY: ReadonlyMap<string, AgentRunner> = new Map(
  RUNNERS.map(r => [r.agentType, r]),
);

/**
 * Module-aware runner lookup. Returns the runner for `agentType`, or
 * `{ runner: undefined, skipped: ... }` when the agent doesn't exist
 * or its owning module is disabled. Callers should record the
 * `skipped` reason in `agent_runs.status_reason` for observability.
 *
 * Direct `AGENT_REGISTRY.get(...)` is intentionally not exposed via
 * a wrapper — every consumer must respect the module gate.
 */
export async function getRunnerGated(
  agentType: string,
): Promise<
  | { runner: AgentRunner }
  | { runner: undefined; skipped: 'unknown_agent_type' }
  | { runner: undefined; skipped: 'module_disabled'; moduleSlug: string }
> {
  const runner = AGENT_REGISTRY.get(agentType);
  if (!runner) return { runner: undefined, skipped: 'unknown_agent_type' };

  const moduleSlug = MODULE_AGENT_SLUG[agentType];
  if (!moduleSlug) return { runner };

  const enabled = await isModuleEnabled(moduleSupabaseClient(), moduleSlug);
  if (!enabled) return { runner: undefined, skipped: 'module_disabled', moduleSlug };
  return { runner };
}

/**
 * Catalog of all registered agent types — sent to the frontend
 * so it can populate the "Agent Type" dropdown without importing
 * the full implementations. Tagged with module ownership where applicable.
 */
export const AGENT_TYPE_CATALOG: AgentTypeCatalogEntry[] = RUNNERS.map(r => ({
  agentType:    r.agentType,
  name:         r.name,
  description:  r.description,
  defaultTools: r.defaultTools,
  defaultModel: r.defaultModel,
}));
