// deno-lint-ignore-file no-explicit-any
/**
 * Running one AI assessment — the shared body behind every entry point and every subject.
 *
 * Three subjects (project / finance / real_estate), three paid modules, three prompts — and ONE
 * implementation of the thing that actually happens. Copying this per module would have produced
 * three claim implementations, three ways to validate an action and three places to get the
 * reserve/settle order wrong; the SQL side is generalised for the same reason (`assessments`
 * carries a `subject_type`, not one table per domain).
 *
 * THE SPLIT. `get_assessment_snapshot` derives every factual claim in SQL: the signals, the six
 * dimension scores, and the verdict. The model turn below writes only the headline, the narrative
 * and the ranked actions. It never counts, never scores and never decides the verdict — a wrong
 * number is a valid number, so the arithmetic stays where it can be tested and where the existing
 * money derivations (`get_project_pnl`, `vw_ar_aging`, `get_order_settlements`,
 * `get_property_performance`) already live.
 *
 * ORDER (invariant 10): reserve → start → model → claim → settle. The reservation happens before
 * the upstream call; failure refunds the ceiling and marks the run `failed` WITH THE REASON, so a
 * half-written report is never mistaken for a verdict.
 *
 * Callers own the two gates that differ per entry point: tenancy binding (an edge function's
 * `userCanAccessWorkspace`, a tool's subject resolver) and module entitlement.
 */
import type { DbClient } from './supabase-client.ts';
import { callClaudeMessages } from './ai-client.ts';
import { creditsForTokens } from './ai-logger.ts';
import { loadPrompt, renderPromptTemplate } from './prompt-utils.ts';
import { reserveCredits, refundCredits, settleCredits } from './credit-reserve.ts';
import {
  ACTION_EFFORTS,
  ASSESSMENT_SUBJECT_MODULE,
  ASSESSMENT_SUBJECT_PROMPT,
  type AssessmentSubject,
} from './assessmentVocabulary.generated.ts';

export { ASSESSMENT_SUBJECT_MODULE };
export type { AssessmentSubject };

/**
 * Opus, deliberately. This turn reads 18–38 signals and has to rank consequences across money,
 * time and relationships — the judgement IS the product, and it is one call per explicit button
 * press rather than anything on a hot path. It is also a model `ai_model_pricing` carries a rate
 * for; a model with no row settles as UNPRICED, and unpriced is not free.
 */
export const ASSESSMENT_MODEL = 'claude-opus-5';

/**
 * Credit ceiling reserved up front. Shape of a run: ~5k input tokens and ~1.5k output, about 9
 * credits at the Opus rate. The ceiling is what a nearly-empty wallet is refused against, so it
 * sits above a realistic worst case and the surplus is refunded by `settleCredits`.
 */
export const ASSESSMENT_CREDIT_CEILING = 20;

/** One forced tool call. No free-form JSON, no salvage parser (invariant 9). */
const ASSESSMENT_TOOL = {
  name: 'emit_assessment',
  description:
    'Return the written assessment: a headline, a narrative, and the ranked actions to take next.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'One sentence, under 120 characters, naming the most important thing right now.',
      },
      narrative: {
        type: 'string',
        description: '2-4 short paragraphs of plain text. No markdown, no bullet lists.',
      },
      actions: {
        type: 'array',
        description: 'What to do, most consequential first. At most 8.',
        items: {
          type: 'object',
          properties: {
            signal_code: {
              type: 'string',
              description: 'The code of the signal this action answers, copied exactly.',
            },
            title: { type: 'string', description: 'Imperative, under 90 characters.' },
            rationale: { type: 'string', description: 'One or two sentences, using the numbers.' },
            effort: { type: 'string', enum: [...ACTION_EFFORTS] },
            due_hint: {
              type: 'string',
              description: 'YYYY-MM-DD, only when the data implies a real date. Otherwise omit.',
            },
          },
          required: ['signal_code', 'title', 'rationale', 'effort'],
        },
      },
    },
    required: ['headline', 'narrative', 'actions'],
  },
} as const;

export interface AssessmentRunResult {
  ok: true;
  assessment_id: string;
  subject_type: AssessmentSubject;
  subject_id: string;
  /** True when a run was already in flight and this request was handed that one instead. */
  already_running: boolean;
  verdict?: string | null;
  overall_score?: number | null;
  headline?: string | null;
  narrative?: string | null;
  actions_stored?: number;
  credits_used?: number;
  /** The ceiling was kept because the model has no `ai_model_pricing` row. Not a free call. */
  unpriced_model?: boolean;
}

/**
 * Resolve a project from an id or a fuzzy name, WITHIN THIS WORKSPACE (#395).
 *
 * `project_id` is a model-supplied argument and the client is service-role, so without the
 * workspace filter the only thing between a turn and another tenant's project is `user_id` — a
 * user identity, not a tenancy binding. Someone who belongs to two workspaces reached, from a
 * workspace-A session, every project they own in workspace B. When both are given, the id wins.
 *
 * Shared with `tools/project-tools.ts`, which used to carry its own copy.
 */
export async function resolveProjectId(
  supabase: DbClient,
  userId: string,
  workspaceId: string | null,
  projectId?: string,
  projectName?: string,
): Promise<string | null> {
  if (projectId) {
    let q = supabase.from('projects').select('id').eq('id', projectId).eq('user_id', userId);
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data } = await q.maybeSingle();
    return (data as any)?.id || null;
  }
  if (projectName) {
    let q = supabase.from('projects').select('id').eq('user_id', userId);
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data } = await q
      .ilike('name', `%${projectName}%`)
      .order('last_activity_at', { ascending: false })
      .limit(1);
    return (data && (data as any[])[0]?.id) || null;
  }
  return null;
}

/**
 * Resolve a property by id or fuzzy name, WITHIN THIS WORKSPACE.
 *
 * Same shape and same reason as the project resolver above: the id arrives from the model and the
 * client is service-role, so the workspace filter IS the tenancy boundary rather than a
 * convenience. Matches title first, then the reference code an agent is more likely to say.
 */
export async function resolvePropertyId(
  supabase: DbClient,
  workspaceId: string | null,
  propertyId?: string,
  query?: string,
): Promise<string | null> {
  if (!workspaceId) return null;
  if (propertyId) {
    const { data } = await supabase
      .from('properties').select('id')
      .eq('id', propertyId).eq('workspace_id', workspaceId).maybeSingle();
    return (data as any)?.id || null;
  }
  if (query) {
    const { data } = await supabase
      .from('properties').select('id')
      .eq('workspace_id', workspaceId)
      .or(`title.ilike.%${query}%,reference_code.ilike.%${query}%,town.ilike.%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(1);
    return (data && (data as any[])[0]?.id) || null;
  }
  return null;
}

/**
 * What the model is shown. The stored `facts` keep everything; this drops the two per-person
 * payroll breakdowns a project P&L carries, which are long, name people, and answer nothing the
 * model is being asked.
 */
function modelInput(snapshot: any): Record<string, unknown> {
  const out: Record<string, unknown> = {
    as_of: snapshot?.as_of,
    subject: snapshot?.subject,
    project: snapshot?.project,
    counts: snapshot?.counts,
    entitlements: snapshot?.entitlements,
    verdict: snapshot?.verdict,
    overall_score: snapshot?.overall_score,
    judged_dimensions: snapshot?.judged_dimensions,
    dimensions: snapshot?.dimensions,
    signals: snapshot?.signals,
  };
  if (snapshot?.pnl) {
    const pnl = { ...snapshot.pnl };
    if (pnl.labor) {
      const labor = { ...pnl.labor };
      delete labor.by_user;
      if (labor.payroll) {
        const payroll = { ...labor.payroll };
        delete payroll.by_worker;
        labor.payroll = payroll;
      }
      pnl.labor = labor;
    }
    out.pnl = pnl;
  }
  // Drop the keys a subject simply does not have, rather than sending nulls the model has to
  // reason about.
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** The free half: the derivation, with no model call and no credit. */
export async function previewAssessment(
  supabase: DbClient,
  subjectType: AssessmentSubject,
  subjectId: string,
  today: string | null,
): Promise<any> {
  const { data, error } = await supabase.rpc('get_assessment_snapshot', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_today: today,
  });
  if (error) throw new Error(`Deriving the assessment failed: ${error.message}`);
  return data;
}

/**
 * The paid run. THROWS on failure, after refunding the ceiling and naming the failure on the row.
 *
 * @param today the OPERATOR's calendar day (`YYYY-MM-DD`) or null. `current_date` in Postgres is
 *   the UTC day, and between local midnight and 03:00 in Greece that is YESTERDAY — on a
 *   derivation whose job includes deciding what is overdue (CLAUDE.md rule 1b). The RPC bounds it
 *   to +/-2 days so a supplied value cannot move a verdict.
 */
export async function runAssessment(
  supabase: DbClient,
  opts: {
    subjectType: AssessmentSubject;
    subjectId: string;
    workspaceId: string;
    userId: string;
    today?: string | null;
    onProgress?: (status: string) => void;
  },
): Promise<AssessmentRunResult> {
  const { subjectType, subjectId, workspaceId, userId } = opts;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(opts.today || '') ? opts.today! : null;

  // Loaded BEFORE the reservation, and per subject: a missing prompt row is our
  // misconfiguration, and charging for it would be charging the tenant for our mistake.
  const template = await loadPrompt(supabase, 'tool', ASSESSMENT_SUBJECT_PROMPT[subjectType]);

  const reserve = await reserveCredits(
    supabase, userId, workspaceId, ASSESSMENT_CREDIT_CEILING, 'ai_assessment');
  if (!reserve.ok) {
    const err = new Error(reserve.message) as Error & { code?: string };
    err.code = 'insufficient_credits';
    throw err;
  }

  let assessmentId: string | null = null;
  try {
    opts.onProgress?.('Deriving the signals...');
    const { data: started, error: startErr } = await supabase.rpc('start_assessment', {
      p_subject_type: subjectType,
      p_subject_id: subjectId,
      p_today: today,
      p_requested_by: userId,
    });
    if (startErr) throw new Error(`Deriving the assessment failed: ${startErr.message}`);
    assessmentId = (started as any).assessment_id as string;

    // Another run is already in flight (a double-tapped button, a retried request after a
    // dropped connection). Refund this reservation and hand back the run that exists rather
    // than paying twice for one answer.
    if ((started as any).reused === true) {
      await refundCredits(supabase, userId, workspaceId, ASSESSMENT_CREDIT_CEILING,
        'ai_assessment', { reason: 'run_already_in_flight', assessment_id: assessmentId });
      return {
        ok: true, assessment_id: assessmentId!, subject_type: subjectType,
        subject_id: subjectId, already_running: true,
      };
    }

    const snapshot = (started as any).snapshot;
    const prompt = renderPromptTemplate(template, {
      snapshot: JSON.stringify(modelInput(snapshot), null, 1),
    });

    opts.onProgress?.('Reading the signals and writing the plan...');
    const res = await callClaudeMessages({
      model: ASSESSMENT_MODEL,
      max_tokens: 3000,
      tools: [ASSESSMENT_TOOL],
      tool_choice: { type: 'tool', name: ASSESSMENT_TOOL.name },
      messages: [{ role: 'user', content: prompt }],
    }, {
      task: `ai_assessment_${subjectType}`,
      userId,
      workspaceId,
      timeoutMs: 120_000,
    });

    const call = (res.content ?? [])
      .find((b) => b.type === 'tool_use' && b.name === ASSESSMENT_TOOL.name);
    // A forced tool_choice means no tool call is a REAL failure — a refusal, or a truncation at
    // max_tokens. Reported as one, never downgraded to whatever prose came back.
    if (!call?.input) throw new Error('The model returned no assessment (refusal or truncation).');

    const out = call.input as { headline?: string; narrative?: string; actions?: unknown[] };
    const inTok = Number(res.usage?.input_tokens ?? 0);
    const outTok = Number(res.usage?.output_tokens ?? 0);

    // Actual cost, through the one token-price derivation. `null` means the model has no
    // ai_model_pricing row — a gap in the price table, NOT a free call — so the reserved ceiling
    // stands rather than being settled down to a number nobody verified.
    const priced = await creditsForTokens(supabase, ASSESSMENT_MODEL, inTok, outTok);
    const credits = priced ? priced.credits : ASSESSMENT_CREDIT_CEILING;

    const { data: recorded, error: recErr } = await supabase.rpc('record_assessment', {
      p_assessment_id: assessmentId,
      p_headline: String(out.headline ?? '').slice(0, 300),
      p_narrative: String(out.narrative ?? '').slice(0, 8000),
      p_actions: Array.isArray(out.actions) ? out.actions : [],
      p_model: ASSESSMENT_MODEL,
      p_input_tokens: inTok,
      p_output_tokens: outTok,
      p_credits: credits,
    });
    if (recErr) throw new Error(`Storing the assessment failed: ${recErr.message}`);

    await settleCredits(supabase, userId, workspaceId, ASSESSMENT_CREDIT_CEILING, credits,
      'ai_assessment',
      { assessment_id: assessmentId, subject_type: subjectType, subject_id: subjectId,
        unpriced_model: !priced });

    return {
      ok: true,
      assessment_id: assessmentId!,
      subject_type: subjectType,
      subject_id: subjectId,
      already_running: false,
      verdict: snapshot?.verdict ?? null,
      overall_score: snapshot?.overall_score ?? null,
      headline: out.headline ?? null,
      narrative: out.narrative ?? null,
      actions_stored: Number((recorded as any)?.actions ?? 0),
      credits_used: credits,
      unpriced_model: !priced,
    };
  } catch (err) {
    // Refund the whole ceiling: no report was delivered, so nothing was sold.
    await refundCredits(supabase, userId, workspaceId, ASSESSMENT_CREDIT_CEILING,
      'ai_assessment', { reason: 'assessment_failed', assessment_id: assessmentId });
    if (assessmentId) {
      // Name the failure ON THE ROW. The derived signals stay readable; it is the written half
      // that is missing, and an operator who cannot tell those apart reads a half-report as a
      // verdict.
      try {
        await supabase.rpc('fail_assessment', {
          p_assessment_id: assessmentId,
          p_error: err instanceof Error ? err.message : String(err),
        });
      } catch { /* best effort — the refund happened and the throw below is the truth */ }
    }
    throw err;
  }
}
