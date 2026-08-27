/**
 * The background-agent value-sets, written ONCE (#391).
 *
 * `AgentRunStatus` and `LogLevel` were declared identically in `backgroundAgents.ts` and
 * `supabase/functions/_shared/agents/types.ts` — the same two lines on both sides of the
 * Vite/Deno boundary, agreeing only by memory.
 *
 * NOT UNIFIED WITH `configSchemas.logLevel`
 * ------------------------------------------
 * That one is `z.enum(['error', 'warn', 'info', 'debug'])` — the same four values in a
 * different order — and it is the PLATFORM'S logging configuration, not the level on an
 * `agent_run_logs` row. Identical values are not one fact. #391 is explicit about this:
 * unify by MEANING, never by signature, because two vocabularies that happen to match
 * today must stay free to diverge. Folding them together would make a change to one
 * silently change the other.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `agent_runs_status_check` and `agent_run_logs_level_check`. The status set is also
 * exactly the `processing_status` ENUM, which is why the sweep grouped them: one fact
 * enforced in two places, so this source must equal both. Pinned by
 * `tests/unit/agentVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

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
