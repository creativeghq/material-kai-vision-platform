/**
 * Background Agent Framework — Core Types
 *
 * Defines the interfaces every agent runner must implement and
 * the execution context it receives at runtime.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── DB row shapes ────────────────────────────────────────────────────────────

export type AgentTriggerType = 'cron' | 'event' | 'manual' | 'chain';
export type AgentRunStatus   = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type LogLevel         = 'debug' | 'info' | 'warn' | 'error';

export interface BackgroundAgentRecord {
  id:                     string;
  name:                   string;
  description:            string | null;
  agent_type:             string;               // registry key
  trigger_type:           AgentTriggerType;
  schedule:               string | null;
  event_type:             string | null;
  parent_agent_id:        string | null;
  model:                  string;
  system_prompt_override: string | null;
  config:                 Record<string, unknown>;
  enabled:                boolean;
  workspace_id:           string | null;
  created_by:             string | null;
  last_run_at:            string | null;
  last_run_status:        string | null;
  run_count:              number;
}

export interface AgentRunRecord {
  id:                  string;
  agent_id:            string;
  status:              AgentRunStatus;
  triggered_by:        string;
  trigger_event_type:  string | null;
  input_data:          Record<string, unknown>;
  output_data:         Record<string, unknown> | null;
  error_message:       string | null;
  model_used:          string | null;
  input_tokens:        number;
  output_tokens:       number;
  credits_debited:     number;
  started_at:          string | null;
  completed_at:        string | null;
  duration_ms:         number | null;
  last_heartbeat:      string;
  recovery_attempts:   number;
  delegated_to_python: boolean;
  python_job_id:       string | null;
  parent_run_id:       string | null;
  workspace_id:        string | null;
  created_at:          string;
}

// ── Execution context passed to every runner ─────────────────────────────────

export interface AgentRunContext {
  /** Service-role Supabase client */
  supabase:         SupabaseClient;
  agentConfig:      BackgroundAgentRecord;
  run:              AgentRunRecord;
  /** Parsed input data for this run */
  input:            Record<string, unknown>;
  workspaceId:      string | null;
  /**
   * The user this run is acting FOR — the verified JWT caller when there is one, otherwise the
   * `dispatched_by` recorded by whoever queued the run (#363 `EE-9`).
   *
   * Attribution and billing only. It is NOT a capability and must never widen what a run can
   * reach: `workspaceId` above is the authorization boundary. Null means genuinely nobody — a
   * cron-triggered agent running on a schedule — never "we had one and did not pass it".
   */
  actingUserId?:    string | null;
  mivaaGatewayUrl:  string;
  mivaaApiKey:      string;
  anthropicApiKey:  string;
  /**
   * Append a structured log entry to agent_run_logs.
   * Fire-and-forget — safe to call without await if you don't need confirmation.
   */
  log(level: LogLevel, message: string, data?: Record<string, unknown>): Promise<void>;
  /**
   * Update last_heartbeat on the run row so auto-recovery won't kill this run.
   * Call every ~10 s inside long loops.
   */
  heartbeat(): Promise<void>;
}

// ── Result every runner must return ─────────────────────────────────────────

export interface AgentRunResult {
  success:         boolean;
  /** Stored in agent_runs.output_data */
  output:          Record<string, unknown>;
  inputTokens:     number;
  outputTokens:    number;
  creditsDebited:  number;
  /**
   * When true the framework will look for chained agents
   * (trigger_type='chain', parent_agent_id=this agent's id)
   * and trigger them with `output` as their input.
   */
  triggerChain?:   boolean;
}

// ── Interface every agent runner must implement ──────────────────────────────

export interface AgentRunner {
  /** Must match the agent_type value stored in background_agents.agent_type */
  readonly agentType:    string;
  readonly name:         string;
  readonly description:  string;
  /** Informational — shown in the UI when creating agents of this type */
  readonly defaultTools: string[];
  readonly defaultModel: string;

  /**
   * Execute the agent task.
   *
   * Throw `DelegateToMivaaError` if the task is expected to take >25 s
   * (i.e. it can't complete within the edge-function timeout).
   * The runner framework will fire-and-forget the task to the Python backend.
   */
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}

// ── Sentinel: runner signals Python should handle this ───────────────────────

export class DelegateToMivaaError extends Error {
  readonly payload: Record<string, unknown>;
  constructor(reason: string, payload: Record<string, unknown> = {}) {
    super(reason);
    this.name = 'DelegateToMivaaError';
    this.payload = payload;
  }
}

// ── Sentinel: heartbeat detected the run was cancelled by an admin ──────────
// Thrown by ctx.heartbeat() when agent_runs.status has been set to 'cancelled'
// out-of-band (typically by the admin dashboard). Runners should let it bubble;
// the runner framework finalizes status='cancelled' without marking the run failed.

export class CancelledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was cancelled`);
    this.name = 'CancelledError';
  }
}

// ── Agent type catalog entry (used by frontend dropdowns) ───────────────────

export interface AgentTypeCatalogEntry {
  agentType:    string;
  name:         string;
  description:  string;
  defaultTools: string[];
  defaultModel: string;
}
