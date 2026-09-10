/** The background-agent value-sets, written ONCE (#391). */

/** `agent_runs_status_check`, and the `processing_status` enum. */
export const AGENT_RUN_STATUSES = [
  'pending', 'processing', 'completed', 'failed', 'cancelled',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/**
 * The statuses that mean "still going".
 *
 * Named rather than written inline as `['pending', 'processing']`, which is what
 * `backgroundAgents` did in its in-flight query. That is a DERIVED subset, not a second
 * vocabulary — but an inline one drifts the moment a sixth status appears and nobody
 * remembers which literal lists needed it.
 */
export const ACTIVE_AGENT_RUN_STATUSES = ['pending', 'processing'] as const;

/** `agent_run_logs_level_check`. Ordered least to most severe. */
export const AGENT_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof AGENT_LOG_LEVELS)[number];

export function isAgentRunStatus(v: unknown): v is AgentRunStatus {
  return typeof v === 'string' && (AGENT_RUN_STATUSES as readonly string[]).includes(v);
}
export function isAgentLogLevel(v: unknown): v is LogLevel {
  return typeof v === 'string' && (AGENT_LOG_LEVELS as readonly string[]).includes(v);
}

/**
 * `background_agents_trigger_type_check`.
 *
 * NOT the same as `TriggerType` in `src/services/flows/types.ts`. That one is the flows
 * vocabulary — 130 event names an automation can fire on. This is how a BACKGROUND AGENT
 * is started. They share a column name and nothing else, and the flows union is two
 * orders of magnitude larger; unifying them by name would be the signature-matching
 * mistake #391 warns about.
 */
export const AGENT_TRIGGER_TYPES = ['cron', 'event', 'manual', 'chain'] as const;
export type AgentTriggerType = (typeof AGENT_TRIGGER_TYPES)[number];

export function isAgentTriggerType(v: unknown): v is AgentTriggerType {
  return typeof v === 'string' && (AGENT_TRIGGER_TYPES as readonly string[]).includes(v);
}
