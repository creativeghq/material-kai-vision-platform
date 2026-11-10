/** Shapes returned by `admin_agent_harness_overview` and `admin_agent_conversation_trace`. */

export interface HarnessKpis {
  turns: number;
  turns_prev: number;
  aux_calls: number;
  conversations: number;
  users: number;
  workspaces: number;
  cost_usd: number;
  cost_usd_prev: number;
  billed_usd: number;
  credits: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  latency_p95_prev_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  turn_errors: number;
  tool_calls: number;
  tool_failed: number;
  tool_zero: number;
  tool_calls_prev: number;
  tool_failed_prev: number;
  requests: number;
  requests_failed: number;
  requests_by_status: Record<string, number>;
  no_response: number;
  rating_up: number;
  rating_down: number;
  server_recovered: number;
  client_cancelled: number;
}

export interface HarnessSeriesPoint {
  bucket: string;
  turns: number;
  cost_usd: number;
  tool_calls: number;
  tool_failed: number;
  requests_failed: number;
}

export interface HarnessAgentRow {
  agent: string;
  turns: number;
  aux_calls: number;
  conversations: number;
  users: number;
  cost_usd: number;
  aux_cost_usd: number;
  credits: number;
  p50_ms: number | null;
  p95_ms: number | null;
  errors: number;
  models: string[] | null;
  last_at: string;
}

export interface HarnessModelRow {
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  p95_ms: number | null;
  unpriced: number;
}

export interface HarnessToolRow {
  tool: string;
  calls: number;
  failed: number;
  zero: number;
  agents: string[] | null;
  p50_ms: number | null;
  p95_ms: number | null;
  last_error: string | null;
  last_at: string;
}

export type HarnessFailureKind = 'tool' | 'turn' | 'request' | 'no_response' | 'background' | 'flow';

export interface HarnessFailure {
  kind: HarnessFailureKind;
  at: string;
  title: string;
  detail: string | null;
  agent?: string | null;
  conversation_id?: string | null;
  run_id?: string | null;
  flow_id?: string | null;
  user_id?: string | null;
}

export interface HarnessEvalBatch {
  batch_id: string | null;
  at: string;
  runs: number;
  passed: number;
  credits: number;
  p95_ms: number | null;
  failure_classes: Record<string, number>;
}

export interface HarnessEvalCase {
  case_key: string;
  title: string;
  agent: string;
  passed: boolean | null;
  at: string | null;
  routed_agent: string | null;
  failure_classes: string[] | null;
  failures: Array<{ cls?: string; message?: string }> | null;
  tools_called: string[] | null;
  latency_ms: number | null;
  credits: number | null;
  conversation_id: string | null;
  error: string | null;
}

export interface HarnessBackgroundAgent {
  id: string;
  name: string;
  agent_type: string;
  enabled: boolean;
  trigger_type: string;
  schedule: string | null;
  event_type: string | null;
  model: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  runs: number;
  failed: number;
  p95_ms: number | null;
  cost_usd: number;
  credits: number;
}

export interface HarnessStuckRun {
  run_id: string;
  agent: string | null;
  status: string;
  started_at: string | null;
  last_heartbeat: string | null;
  recovery_attempts: number | null;
}

export interface HarnessFlowRow {
  flow_id: string;
  name: string;
  trigger_type: string;
  is_global: boolean;
  runs: number;
  failed: number;
  p95_ms: number | null;
  last_at: string;
}

export interface HarnessMemory {
  active: number;
  superseded: number;
  expired: number;
  created_in_window: number;
  recalled_in_window: number;
  never_recalled: number;
  unembedded: number;
  by_type: Record<string, number>;
  by_agent: Record<string, number>;
}

export interface HarnessConversationRow {
  id: string;
  agent: string | null;
  title: string | null;
  user_email: string | null;
  created_at: string;
  last_at: string | null;
  messages: number | null;
  turns: number;
  tool_calls: number;
  tool_failed: number;
  tool_zero: number;
  cost_usd: number;
  max_latency_ms: number | null;
  rating_down: number;
  is_eval: boolean;
}

export interface HarnessAttention {
  severity: 'error' | 'warning';
  area: string;
  title: string;
  detail: string;
  section: string;
}

export interface HarnessOverview {
  window: { days: number; since: string; requests_since: string; requests_capped: boolean };
  kpis: HarnessKpis;
  series: HarnessSeriesPoint[];
  agents: HarnessAgentRow[];
  models: HarnessModelRow[];
  tools: HarnessToolRow[];
  failures: HarnessFailure[];
  evals: { cases_active: number; batches: HarnessEvalBatch[]; latest: HarnessEvalCase[] };
  background: { agents: HarnessBackgroundAgent[]; stuck: HarnessStuckRun[] };
  flows: { by_status: Record<string, number>; top: HarnessFlowRow[] };
  memory: HarnessMemory;
  conversations: HarnessConversationRow[];
  attention: HarnessAttention[];
}

export interface TraceMessage {
  id: string;
  role: string;
  content: string | null;
  created_at: string;
  model: string | null;
  agent: string | null;
  requested_agent: string | null;
  routed: boolean | null;
  turn_id: string | null;
  response_ms: number | null;
  rating: string | null;
  payload_keys: string[] | null;
  attachments: number;
}

export interface TraceTurn {
  id: string;
  at: string;
  turn_number: number | null;
  agent_type: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number;
  credits: number | null;
  latency_ms: number | null;
  tools_called: Array<{ name: string; duration_ms?: number }> | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TraceToolCall {
  id: string;
  at: string;
  tool: string;
  agent: string | null;
  args: unknown;
  result: unknown;
  result_count: number | null;
  zero_result: boolean | null;
  success: boolean;
  error: string | null;
  duration_ms: number | null;
}

export interface ConversationTrace {
  conversation: {
    id: string;
    agent: string | null;
    title: string | null;
    user_id: string | null;
    user_email: string | null;
    created_at: string;
    last_at: string | null;
    messages: number | null;
    toolkits: string[] | null;
    is_archived: boolean;
  } | null;
  messages: TraceMessage[];
  turns: TraceTurn[];
  tool_calls: TraceToolCall[];
  evals: Array<{ case_key: string; passed: boolean; at: string; failures: unknown; failure_classes: string[] | null; error: string | null }>;
  checkpoint_bytes: number | null;
}
