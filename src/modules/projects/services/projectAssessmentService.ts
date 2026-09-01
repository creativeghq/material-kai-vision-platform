/**
 * AI Assessment — the client side (#397).
 *
 * THIS FILE FORMATS. It does not derive anything. Every number, every status and the verdict
 * itself come from `get_project_assessment_snapshot`, and the dimension scores come from
 * `score_project_assessment` — one derivation, in SQL, where it can be tested. The one rule that
 * matters here: if you find yourself computing a percentage, a total or a verdict in this file,
 * it belongs in the RPC instead. A wrong number is a valid number, and nothing on this side of
 * the wire would catch it.
 *
 * Both the preview and the run go through the `project-assessment` edge function rather than
 * straight to the RPC, because that function is where `assertEntitled` lives. PostgREST is
 * reachable directly, so a client-side check would be a filter, not a boundary.
 */
import { supabase } from '@/integrations/supabase/client';
import { todayLocalISO } from '@/utils/datetime';
import type {
  AssessmentDimension, AssessmentVerdict, AssessmentRunStatus, ActionState, ActionEffort,
  SignalSeverity, SignalStatus,
} from '../assessmentVocabulary';

/** One derived signal. A value, or a stated reason there is none — never a hidden row. */
export interface AssessmentSignal {
  code: string;
  dimension: AssessmentDimension;
  severity: SignalSeverity;
  status: SignalStatus;
  title: string;
  value: number | null;
  unit: string | null;
  /** Set exactly when status is `no_data` or `not_applicable`. */
  reason: string | null;
  detail: Record<string, unknown>;
  /** A project tab key — resolved to `/projects/:id?tab=<key>` by the reader. */
  destination: string | null;
}

export interface DimensionScore {
  /** null means the dimension could not be judged — NOT zero, and never rendered as one. */
  score: number | null;
  judged_signals: number;
  attention_signals: number;
  status: 'ok' | 'attention' | 'not_judged';
  reason: string | null;
}

export interface AssessmentSnapshot {
  as_of: string;
  project: Record<string, unknown>;
  counts: Record<string, number | null>;
  entitlements: Record<string, boolean>;
  pnl: Record<string, unknown>;
  signals: AssessmentSignal[];
  verdict: AssessmentVerdict;
  overall_score: number | null;
  judged_dimensions: number;
  worst_severity: SignalSeverity | null;
  dimensions: Record<AssessmentDimension, DimensionScore>;
}

export interface AssessmentAction {
  id: string;
  assessment_id: string;
  project_id: string;
  signal_code: string;
  dimension: AssessmentDimension;
  priority: number;
  title: string;
  rationale: string | null;
  effort: ActionEffort | null;
  impact: SignalSeverity | null;
  destination: string | null;
  due_hint: string | null;
  state: ActionState;
  task_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AssessmentRecord {
  id: string;
  project_id: string;
  run_status: AssessmentRunStatus;
  verdict: AssessmentVerdict | null;
  overall_score: number | null;
  scores: {
    dimensions?: Record<AssessmentDimension, DimensionScore>;
    judged_dimensions?: number;
    worst_severity?: SignalSeverity | null;
  };
  facts: Record<string, unknown>;
  signals: AssessmentSignal[];
  headline: string | null;
  narrative: string | null;
  model: string | null;
  credits_used: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const RECORD_COLUMNS =
  'id, project_id, run_status, verdict, overall_score, scores, facts, signals, headline, ' +
  'narrative, model, credits_used, error_message, created_at, completed_at';

const ACTION_COLUMNS =
  'id, assessment_id, project_id, signal_code, dimension, priority, title, rationale, effort, ' +
  'impact, destination, due_hint, state, task_id, resolved_at, created_at';

/** A 402 from the edge function means "not entitled" or "no credits" — both are actionable. */
export class AssessmentBlocked extends Error {
  constructor(message: string, readonly code: 'not_entitled' | 'insufficient_credits') {
    super(message);
    this.name = 'AssessmentBlocked';
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('project-assessment', { body });
  if (error) {
    // supabase-js hides the response body on a non-2xx, so the useful half is dug out here.
    // Reporting "Edge Function returned a non-2xx status code" at somebody who is out of credits
    // is the same defect as an empty state with no way out of it.
    let detail = '';
    let code = '';
    try {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.json === 'function') {
        const parsed = await res.clone().json();
        detail = parsed?.error || parsed?.message || '';
        code = parsed?.code || '';
      }
    } catch { /* the message below still names the failure */ }
    if (code === 'not_entitled') throw new AssessmentBlocked(detail || 'This workspace is not entitled to AI Assessment.', 'not_entitled');
    if (detail && /credit/i.test(detail)) throw new AssessmentBlocked(detail, 'insufficient_credits');
    throw new Error(detail || error.message || 'The assessment service could not be reached.');
  }
  return data as T;
}

export const projectAssessmentService = {
  /**
   * The derivation, live and free. `todayLocalISO()` — never `new Date().toISOString()` — because
   * this decides what is overdue, and the UTC day is yesterday for a Greek operator between local
   * midnight and 03:00 (CLAUDE.md rule 1b).
   */
  async preview(projectId: string): Promise<AssessmentSnapshot> {
    const out = await invoke<{ snapshot: AssessmentSnapshot }>({
      project_id: projectId, mode: 'preview', today: todayLocalISO(),
    });
    return out.snapshot;
  },

  /** The paid run: one Claude turn over the derived signals. Throws AssessmentBlocked on 402. */
  async run(projectId: string): Promise<{
    assessment_id: string; already_running?: boolean; verdict?: AssessmentVerdict;
    overall_score?: number; headline?: string; actions_stored?: number; credits_used?: number;
  }> {
    return await invoke({ project_id: projectId, mode: 'run', today: todayLocalISO() });
  },

  /** The most recent COMPLETE report. A run that failed is not a report. */
  async latest(projectId: string): Promise<AssessmentRecord | null> {
    const { data, error } = await supabase
      .from('project_assessments')
      .select(RECORD_COLUMNS)
      .eq('project_id', projectId)
      .eq('run_status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not load the assessment: ${error.message}`);
    return (data as AssessmentRecord | null) ?? null;
  },

  /**
   * Past runs, newest first — INCLUDING the failed ones. A failed run is the thing that explains
   * a missing report; hiding it leaves the operator looking at a gap with no reason attached.
   */
  async history(projectId: string, limit = 10): Promise<AssessmentRecord[]> {
    const { data, error } = await supabase
      .from('project_assessments')
      .select('id, project_id, run_status, verdict, overall_score, headline, model, credits_used, error_message, created_at, completed_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Could not load the assessment history: ${error.message}`);
    return (data ?? []) as AssessmentRecord[];
  },

  async actionsFor(assessmentId: string): Promise<AssessmentAction[]> {
    const { data, error } = await supabase
      .from('project_assessment_actions')
      .select(ACTION_COLUMNS)
      .eq('assessment_id', assessmentId)
      .order('priority', { ascending: true });
    if (error) throw new Error(`Could not load the actions: ${error.message}`);
    return (data ?? []) as AssessmentAction[];
  },

  /**
   * Turn an action into a real task. Idempotent in SQL: the action is CLAIMED before the task is
   * written, so a double-tap or a retry after a dropped connection returns the task that exists
   * rather than cutting a second one.
   */
  async applyAction(actionId: string, dueDate?: string | null): Promise<{ task_id: string | null; already: boolean }> {
    const { data, error } = await supabase.rpc('apply_assessment_action', {
      p_action_id: actionId,
      p_due_date: dueDate ?? null,
      p_room_id: null,
    });
    if (error) throw new Error(`Could not add the task: ${error.message}`);
    const out = data as { task_id?: string | null; already?: boolean };
    return { task_id: out?.task_id ?? null, already: out?.already === true };
  },

  async resolveAction(actionId: string, state: 'open' | 'done' | 'dismissed'): Promise<void> {
    const { error } = await supabase.rpc('resolve_assessment_action', {
      p_action_id: actionId,
      p_state: state,
    });
    if (error) throw new Error(`Could not update the action: ${error.message}`);
  },
};
