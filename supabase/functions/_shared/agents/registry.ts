/**
 * Background Agent Registry
 *
 * Maps agent_type strings (stored in background_agents.agent_type)
 * to concrete AgentRunner implementations.
 *
 * To add a new agent:
 *   1. Create `your-agent.ts` implementing AgentRunner
 *   2. Import and add it here
 *   3. It immediately appears in the UI's "Agent Type" dropdown
 */

import type { AgentRunner, AgentTypeCatalogEntry } from './types.ts';
import { ProductEnrichmentAgent } from './product-enrichment-agent.ts';
import { MaterialTaggerAgent }    from './material-tagger-agent.ts';
import { KaiTaskAgent }           from './kai-task-agent.ts';

const RUNNERS: AgentRunner[] = [
  new KaiTaskAgent(),
  new ProductEnrichmentAgent(),
  new MaterialTaggerAgent(),
];

/** Keyed map for fast O(1) lookup by agent_type */
export const AGENT_REGISTRY: ReadonlyMap<string, AgentRunner> = new Map(
  RUNNERS.map(r => [r.agentType, r]),
);

/** Returns the runner for a given agent_type, or undefined if not registered */
export function getRunner(agentType: string): AgentRunner | undefined {
  return AGENT_REGISTRY.get(agentType);
}

/**
 * Catalog of all registered agent types — sent to the frontend
 * so it can populate the "Agent Type" dropdown without importing
 * the full implementations.
 */
export const AGENT_TYPE_CATALOG: AgentTypeCatalogEntry[] = RUNNERS.map(r => ({
  agentType:    r.agentType,
  name:         r.name,
  description:  r.description,
  defaultTools: r.defaultTools,
  defaultModel: r.defaultModel,
}));
