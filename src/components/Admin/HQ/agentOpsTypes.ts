export type CaseStatus = 'open' | 'investigating' | 'awaiting_review' | 'escalated' | 'resolved' | 'dismissed';
export type CaseActor = 'system' | 'jarvis' | 'stark' | 'veritas' | 'operator';

export interface OpsCase {
  id: string;
  source_kind: 'integrity_check' | 'provider' | 'job' | 'background_agent' | 'agent_tool';
  source_key: string;
  title: string;
  summary: string | null;
  severity: 'critical' | 'warning' | 'info';
  status: CaseStatus;
  holder: 'jarvis' | 'stark' | 'veritas' | 'operator' | null;
  round: number;
  evidence_count: number | null;
  outcome: 'fixed' | 'needs_operator' | 'needs_code_change' | 'not_a_problem' | null;
  verdict: 'confirmed' | 'rejected' | null;
  diagnosis: string | null;
  resolution: string | null;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
  last_event: { actor: CaseActor; kind: string; at: string; note: string | null; conversation_id: string | null } | null;
}

export interface OpsReview {
  id: string;
  triggered_by: 'operator' | 'cron';
  conversation_id: string;
  cases: number;
  created_at: string;
  turn_status: string | null;
  total_ms: number | null;
  turn_error: string | null;
  tool_calls: number | null;
  never_started: boolean;
}

export interface OpsAgentRow {
  id: string;
  name: string;
  role: string;
  kind: 'dispatcher' | 'sub_agent' | 'analysis_sub_agent' | 'background_agent';
  runs: number;
  ok: number;
  failed: number;
  avg_ms: number | null;
  cost_usd: number | null;
  last_at: string | null;
  note: string | null;
}

export interface OpsRun {
  id: string;
  agent: string;
  status: string;
  triggered_by: string | null;
  created_at: string;
  duration_ms: number | null;
  error: string | null;
  total_cost_usd: number | null;
}

export interface OpsDesk {
  settings: { auto_review: boolean; review_batch: number; updated_at: string };
  cases: OpsCase[];
  reviews: OpsReview[];
  agents: OpsAgentRow[];
  runs: OpsRun[];
}

export interface OpsCaseEvent {
  id: string;
  created_at: string;
  actor: CaseActor;
  kind: string;
  note: string | null;
  data: Record<string, unknown> | null;
  conversation_id: string | null;
}

export interface OpsCaseDetail {
  case: OpsCase & { root_cause: string | null; proposed_fix: string | null; verdict_note: string | null };
  evidence: Record<string, unknown>;
  safe_fix_available: boolean;
  events: OpsCaseEvent[];
}

export const STATUS_META: Record<CaseStatus, { label: string; badge: 'error' | 'warning' | 'info' | 'success' | 'neutral' }> = {
  escalated: { label: 'Needs You', badge: 'error' },
  open: { label: 'Open', badge: 'warning' },
  investigating: { label: 'With Stark', badge: 'info' },
  awaiting_review: { label: 'With Veritas', badge: 'info' },
  resolved: { label: 'Resolved', badge: 'success' },
  dismissed: { label: 'Dismissed', badge: 'neutral' },
};

export const OUTCOME_LABEL: Record<NonNullable<OpsCase['outcome']>, string> = {
  fixed: 'Fixed',
  not_a_problem: 'Not a Problem',
  needs_operator: 'Needs Operator',
  needs_code_change: 'Needs Code Change',
};

export const SOURCE_LABEL: Record<OpsCase['source_kind'], string> = {
  integrity_check: 'Integrity Check',
  provider: 'Provider',
  job: 'Job',
  background_agent: 'Background Agent',
  agent_tool: 'Agent Tool',
};

export const ACTOR_LABEL: Record<CaseActor, string> = {
  system: 'System',
  jarvis: 'JARVIS',
  stark: 'Stark',
  veritas: 'Veritas',
  operator: 'Operator',
};
