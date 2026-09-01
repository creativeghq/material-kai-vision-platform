/**
 * AI Assessment toolkit — the agent surface for all three assessment modules.
 *
 *   assess_project / assess_finance / assess_property   run one (PAID: reserve → settle)
 *   get_*_assessment                                    the latest report (0 credits, DB read)
 *   list_assessment_actions                             what is outstanding, across every
 *                                                       assessment module the workspace owns
 *   apply_assessment_action                             turn one action into a real project task
 *
 * THREE PAID TOOLS, ONE BODY. Each `assess_*` is a different product with its own module and its
 * own prompt, so each is its own tool — the model should not have to pick a subject enum to spend
 * somebody's credits, and the catalog needs one `moduleSlug` per entry. Everything underneath is
 * `_shared/assessment.ts`.
 *
 * WHAT THE MODEL IS NOT DOING. Every number in a report is derived by `get_assessment_snapshot`
 * in SQL. The paid tools spend a credit on the WRITE-UP, not on the arithmetic. The readers spend
 * nothing at all, which is the point: "what should I do next" should not cost money to ask twice.
 *
 * Every tool emits a chunk registered in `AGENT_RESULT_TITLES`. A quick-start with `run:` calls
 * these deterministically with no model turn, so an unrendered chunk is not "the agent will
 * summarise it" — it is a blank screen under a cheerful "done".
 */

// `tool` is typed non-generically ON PURPOSE — see the note in project-tools.ts. Inferring it
// pulls @langchain/core's generic graph into every module that defines a tool, and that
// instantiation is what makes agent-chat exceed the edge typecheck's memory ceiling.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { serviceClient as svcClient } from '../supabase-client.ts';
import { moduleGate } from './module-gate.ts';
import {
  ASSESSMENT_CREDIT_CEILING,
  ASSESSMENT_SUBJECT_MODULE,
  resolveProjectId,
  resolvePropertyId,
  runAssessment,
  type AssessmentSubject,
} from '../assessment.ts';
import {
  ASSESSMENT_SUBJECTS,
  ASSESSMENT_SUBJECT_LABELS,
  ASSESSMENT_VERDICT_LABELS,
  ASSESSMENT_DIMENSION_LABELS,
} from '../assessmentVocabulary.generated.ts';

// deno-lint-ignore no-explicit-any
type Chunk = (chunk: any) => void;

const fail = (error: string) => JSON.stringify({ success: false, error });

/**
 * The report as a card renders it. Built once so `assess_*` and `get_*_assessment` cannot
 * describe the same row differently — the second-copy shape, in miniature.
 */
// deno-lint-ignore no-explicit-any
function reportPayload(subject: AssessmentSubject, subjectId: string, name: string, row: any, actions: any[]) {
  // deno-lint-ignore no-explicit-any
  const signals: any[] = Array.isArray(row?.signals) ? row.signals : [];
  const labels = ASSESSMENT_DIMENSION_LABELS[subject] as Record<string, string>;
  return {
    subject_type: subject,
    subject_id: subjectId,
    subject_label: ASSESSMENT_SUBJECT_LABELS[subject],
    subject_name: name,
    // The project detail route is what the generic card deep-links to, so the id it looks for
    // travels under the name that route expects.
    ...(subject === 'project' ? { project_id: subjectId } : {}),
    assessment_id: row?.id ?? null,
    run_status: row?.run_status ?? null,
    verdict: row?.verdict ?? null,
    verdict_label: row?.verdict
      ? (ASSESSMENT_VERDICT_LABELS as Record<string, string>)[row.verdict] ?? row.verdict
      : null,
    overall_score: row?.overall_score ?? null,
    headline: row?.headline ?? null,
    narrative: row?.narrative ?? null,
    assessed_at: row?.completed_at ?? row?.created_at ?? null,
    // A dimension that could not be judged says so rather than vanishing (rule 3). Six tiles
    // every time; `score: null` reads as "not judged", never as zero.
    dimensions: Object.entries(row?.scores?.dimensions ?? {}).map(([key, d]) => ({
      key,
      label: labels?.[key] ?? key,
      // deno-lint-ignore no-explicit-any
      ...(d as any),
    })),
    // Only the signals worth a reader's time, but their STATUS travels with them so nothing is
    // silently a zero.
    findings: signals
      .filter((s) => s?.status === 'attention' || s?.status === 'no_data')
      .map((s) => ({
        code: s.code, dimension: s.dimension, severity: s.severity, status: s.status,
        title: s.title, value: s.value, unit: s.unit, reason: s.reason, destination: s.destination,
      })),
    signal_counts: {
      total: signals.length,
      attention: signals.filter((s) => s?.status === 'attention').length,
      ok: signals.filter((s) => s?.status === 'ok').length,
      no_data: signals.filter((s) => s?.status === 'no_data').length,
      not_applicable: signals.filter((s) => s?.status === 'not_applicable').length,
    },
    actions: (actions ?? []).map((a) => ({
      id: a.id, priority: a.priority, title: a.title, rationale: a.rationale,
      effort: a.effort, impact: a.impact, dimension: a.dimension, destination: a.destination,
      signal_code: a.signal_code, state: a.state, task_id: a.task_id, due_hint: a.due_hint,
    })),
  };
}

// deno-lint-ignore no-explicit-any
async function loadLatestReport(subject: AssessmentSubject, subjectId: string): Promise<{ row: any; actions: any[] } | null> {
  const sb = svcClient();
  const { data: row } = await sb
    .from('assessments')
    .select('id, run_status, verdict, overall_score, scores, signals, headline, narrative, created_at, completed_at, error_message')
    .eq('subject_type', subject)
    .eq('subject_id', subjectId)
    .eq('run_status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;
  const { data: actions } = await sb
    .from('assessment_actions')
    .select('id, priority, title, rationale, effort, impact, dimension, destination, signal_code, state, task_id, due_hint')
    .eq('assessment_id', (row as { id: string }).id)
    .order('priority', { ascending: true });
  return { row, actions: actions ?? [] };
}

/**
 * Resolve the subject a tool was asked about, inside this workspace.
 *
 * Finance is the workspace itself — there is no id to supply and therefore none to get wrong.
 * The other two go through the shared workspace-scoped resolvers (#395, invariant 1): the id
 * arrives from the MODEL and the client is service-role, so the workspace filter is the tenancy
 * boundary rather than a convenience.
 */
async function resolveSubject(
  subject: AssessmentSubject,
  userId: string,
  workspaceId: string,
  id?: string,
  query?: string,
): Promise<{ id: string; name: string } | null> {
  const sb = svcClient();
  if (subject === 'finance') {
    const { data } = await sb.from('workspaces').select('id, name').eq('id', workspaceId).maybeSingle();
    // deno-lint-ignore no-explicit-any
    return data ? { id: workspaceId, name: (data as any).name || 'this workspace' } : null;
  }
  if (subject === 'project') {
    const pid = await resolveProjectId(sb, userId, workspaceId, id, query);
    if (!pid) return null;
    const { data } = await sb.from('projects').select('name').eq('id', pid).maybeSingle();
    // deno-lint-ignore no-explicit-any
    return { id: pid, name: (data as any)?.name || 'the project' };
  }
  const prid = await resolvePropertyId(sb, workspaceId, id, query);
  if (!prid) return null;
  const { data } = await sb.from('properties').select('title, reference_code').eq('id', prid).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const p = data as any;
  return { id: prid, name: p?.title || p?.reference_code || 'the property' };
}

/**
 * The paid half, shared by all three `assess_*` tools.
 *
 * The BODY is shared; the `tool()` wrapper is not. `npm run tools:manifest` is an AST projection
 * and needs a LITERAL `name` and `schema` at each call site — a tool built entirely from a
 * factory is invisible to it, which would take `autoFields`, the options guard and the coverage
 * guards blind all at once. So each tool below is spelled out and calls into here.
 */
function assessBody(
  subject: AssessmentSubject,
  idKey: string,
  queryKey: string,
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) {
  return async (input: Record<string, string | undefined>) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_SUBJECT_MODULE[subject]);
    if (denied) return denied;

    const found = await resolveSubject(
      subject, userId, workspaceId, input[idKey], input[queryKey]);
    if (!found) return fail(`No matching ${ASSESSMENT_SUBJECT_LABELS[subject].toLowerCase()} in this workspace.`);

    try {
      const result = await runAssessment(svcClient(), {
        subjectType: subject,
        subjectId: found.id,
        workspaceId,
        userId,
        today: input.today,
        onProgress: (status) => onChunk?.({ type: 'tool_progress', status, timestamp: Date.now() }),
      });

      if (result.already_running) {
        return JSON.stringify({
          success: true,
          note: 'An assessment for this subject is already running. Nothing was charged twice.',
          assessment_id: result.assessment_id,
        });
      }

      const latest = await loadLatestReport(subject, found.id);
      const payload = reportPayload(subject, found.id, found.name, latest?.row, latest?.actions ?? []);
      onChunk?.({ type: 'assessment_report', ...payload, credits_used: result.credits_used });

      return JSON.stringify({
        success: true,
        assessment_id: result.assessment_id,
        subject: found.name,
        verdict: result.verdict,
        overall_score: result.overall_score,
        headline: result.headline,
        actions_stored: result.actions_stored,
        credits_used: result.credits_used,
        // Stated, not hidden: the ceiling was kept because the model has no price row, and an
        // unpriced call is a gap in the price table rather than a free one.
        unpriced_model: result.unpriced_model || undefined,
      });
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'insufficient_credits') {
        return fail(e.message || 'Not enough credits to run an assessment. Please top up.');
      }
      // The run row already carries the reason and the reserved credits are already refunded.
      return fail(`The signals were derived but the write-up failed: ${e.message}`);
    }
  };
}

/** The free half, shared by all three `get_*_assessment` tools. */
function getBody(
  subject: AssessmentSubject,
  idKey: string,
  queryKey: string,
  runTool: string,
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) {
  return async (input: Record<string, string | undefined>) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_SUBJECT_MODULE[subject]);
    if (denied) return denied;

    const found = await resolveSubject(
      subject, userId, workspaceId, input[idKey], input[queryKey]);
    if (!found) return fail(`No matching ${ASSESSMENT_SUBJECT_LABELS[subject].toLowerCase()} in this workspace.`);

    const latest = await loadLatestReport(subject, found.id);
    if (!latest) {
      // Absence with a way out of it, not an empty result. The user is one tool call from
      // having one, and saying so is cheaper than making them ask again.
      onChunk?.({
        type: 'assessment_report',
        subject_type: subject, subject_id: found.id, subject_name: found.name,
        subject_label: ASSESSMENT_SUBJECT_LABELS[subject],
        ...(subject === 'project' ? { project_id: found.id } : {}),
        assessment_id: null, run_status: 'none', verdict: null,
        actions: [], findings: [], dimensions: [],
      });
      return JSON.stringify({
        success: true, assessed: false, reason: 'no_assessment_yet',
        message: `"${found.name}" has never been assessed. Run ${runTool} to produce one.`,
      });
    }

    const payload = reportPayload(subject, found.id, found.name, latest.row, latest.actions);
    onChunk?.({ type: 'assessment_report', ...payload });
    return JSON.stringify({ success: true, assessed: true, ...payload });
  };
}

// ── the three paid tools ────────────────────────────────────────────────────
export const createAssessProjectTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  assessBody('project', 'project_id', 'project_name', userId, workspaceId, onChunk),
  {
    name: 'assess_project',
    description:
      `Run a full AI assessment of one project: derive its health across setup, commercial, ` +
      `financial, schedule, delivery and client signals, then produce a verdict and a ranked list ` +
      `of what to do next. Costs up to ${ASSESSMENT_CREDIT_CEILING} credits (typically ~9). Use ` +
      `get_project_assessment first if the user only wants to see the last one.`,
    schema: z.object({
      project_id: z.string().optional().describe('The project id, when you already have it.'),
      project_name: z.string().optional().describe('Part of the project name, e.g. "Athens loft".'),
      today: z.string().optional()
        .describe("The user's local date as YYYY-MM-DD. Pass it so overdue is judged on their calendar day."),
    }),
  },
);

export const createAssessFinanceTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  // Finance has no id to resolve — the subject IS the active workspace, so there is nothing a
  // caller could name and therefore nothing to name wrongly.
  assessBody('finance', 'unused_id', 'unused_query', userId, workspaceId, onChunk),
  {
    name: 'assess_finance',
    description:
      `Run a full AI assessment of this workspace's BOOKS: configuration, the quote-to-invoice ` +
      `pipeline, profitability and cash, obligations, fiscal filing and bank reconciliation, and ` +
      `debtors — then produce a verdict and a ranked list of what to do next. Costs up to ` +
      `${ASSESSMENT_CREDIT_CEILING} credits (typically ~9). Use get_finance_assessment to read ` +
      `the last one instead.`,
    schema: z.object({
      today: z.string().optional()
        .describe("The user's local date as YYYY-MM-DD. Pass it so overdue is judged on their calendar day."),
    }),
  },
);

export const createAssessPropertyTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  assessBody('real_estate', 'property_id', 'property_query', userId, workspaceId, onChunk),
  {
    name: 'assess_property',
    description:
      `Run a full AI assessment of one property listing: completeness, pricing against its own ` +
      `history, returns, tenancy and listing expiries, condition, and whether buyer interest is ` +
      `being answered — then produce a verdict and a ranked list of what to do next. Costs up to ` +
      `${ASSESSMENT_CREDIT_CEILING} credits (typically ~9). Use get_property_assessment to read ` +
      `the last one instead.`,
    schema: z.object({
      property_id: z.string().optional().describe('The property id, when you already have it.'),
      property_query: z.string().optional()
        .describe('Part of the title, reference code or town, e.g. "Kavouri" or "REF-104".'),
      today: z.string().optional()
        .describe("The user's local date as YYYY-MM-DD. Pass it so overdue is judged on their calendar day."),
    }),
  },
);

// ── the three free readers ──────────────────────────────────────────────────
export const createGetProjectAssessmentTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  getBody('project', 'project_id', 'project_name', 'assess_project', userId, workspaceId, onChunk),
  {
    name: 'get_project_assessment',
    description:
      'Read the most recent AI assessment of a project — verdict, dimension scores, findings and ' +
      'the actions it recommended. Free; no model call. Returns assessed:false when it has never ' +
      'been assessed.',
    schema: z.object({
      project_id: z.string().optional().describe('The project id, when you already have it.'),
      project_name: z.string().optional().describe('Part of the project name.'),
    }),
  },
);

export const createGetFinanceAssessmentTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  getBody('finance', 'unused_id', 'unused_query', 'assess_finance', userId, workspaceId, onChunk),
  {
    name: 'get_finance_assessment',
    description:
      "Read the most recent AI assessment of this workspace's books — verdict, dimension scores, " +
      'findings and the actions it recommended. Free; no model call.',
    schema: z.object({}),
  },
);

export const createGetPropertyAssessmentTool = (userId: string, workspaceId: string, onChunk?: Chunk) => tool(
  getBody('real_estate', 'property_id', 'property_query', 'assess_property', userId, workspaceId, onChunk),
  {
    name: 'get_property_assessment',
    description:
      'Read the most recent AI assessment of a property listing — verdict, dimension scores, ' +
      'findings and the actions it recommended. Free; no model call.',
    schema: z.object({
      property_id: z.string().optional().describe('The property id, when you already have it.'),
      property_query: z.string().optional()
        .describe('Part of the title, reference code or town.'),
    }),
  },
);

// ── across every assessment module the workspace owns ───────────────────────
export const createListAssessmentActionsTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ subject_type, state, limit }: { subject_type?: string; state?: string; limit?: number }) => {
    const sb = svcClient();

    // Ask per subject. A workspace that owns only one of the three assessment modules gets that
    // one's actions and no refusal about the other two — and one it owns none of gets the
    // refusal rather than an empty list that reads like "nothing to do".
    const wanted = (ASSESSMENT_SUBJECTS as readonly string[])
      .filter((s) => !subject_type || s === subject_type) as AssessmentSubject[];
    const allowed: AssessmentSubject[] = [];
    let lastDenial: string | null = null;
    for (const s of wanted) {
      const denied = await moduleGate(workspaceId, ASSESSMENT_SUBJECT_MODULE[s]);
      if (denied) { lastDenial = denied; continue; }
      allowed.push(s);
    }
    if (allowed.length === 0) return lastDenial ?? fail('No assessment module is active for this workspace.');

    const wantedState = ['open', 'task_created', 'done', 'dismissed'].includes(state || '') ? state! : 'open';
    const { data: rows, error } = await sb
      .from('assessment_actions')
      .select('id, subject_type, subject_id, priority, title, rationale, effort, impact, dimension, destination, signal_code, state, task_id, due_hint, created_at')
      .eq('workspace_id', workspaceId)
      .in('subject_type', allowed)
      .eq('state', wantedState)
      .order('created_at', { ascending: false })
      .order('priority', { ascending: true })
      .limit(Math.min(Math.max(limit ?? 25, 1), 100));
    if (error) return fail(`Could not read the action list: ${error.message}`);

    const actions = (rows ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      subject_label: ASSESSMENT_SUBJECT_LABELS[a.subject_type as AssessmentSubject],
    }));

    onChunk?.({
      type: 'assessment_actions',
      state: wantedState,
      subjects: allowed,
      actions,
    });
    return JSON.stringify({ success: true, state: wantedState, subjects: allowed, count: actions.length, actions });
  },
  {
    name: 'list_assessment_actions',
    description:
      'List the actions AI assessments have recommended — across projects, the books and property ' +
      'listings, whichever assessment modules this workspace owns. Newest report first. Free; no ' +
      'model call. Use it to answer "what needs doing" without re-running an assessment.',
    schema: z.object({
      subject_type: z.enum(['project', 'finance', 'real_estate']).optional()
        .describe('Narrow to one kind of subject. Defaults to all of them.'),
      state: z.enum(['open', 'task_created', 'done', 'dismissed']).optional()
        .describe('Which actions to list. Defaults to open.'),
      limit: z.number().optional().describe('Maximum actions to return (1-100, default 25).'),
    }),
  },
);

export const createApplyAssessmentActionTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ action_id, due_date }: { action_id: string; due_date?: string }) => {
    const sb = svcClient();
    // The action id is model-supplied, so its workspace is checked before anything is written
    // (invariant 1). A miss reads as not-found, never as forbidden.
    const { data: action } = await sb
      .from('assessment_actions')
      .select('id, title, state, task_id, subject_type, subject_id, workspace_id')
      .eq('id', action_id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const act = action as any;
    if (!act || act.workspace_id !== workspaceId) {
      return fail('No such action in this workspace.');
    }

    // Gated on the module the action's OWN subject belongs to — the gate follows the data, not
    // the caller's guess about it.
    const denied = await moduleGate(workspaceId, ASSESSMENT_SUBJECT_MODULE[act.subject_type as AssessmentSubject]);
    if (denied) return denied;

    const title = String(act.title ?? 'this action');
    const { data, error } = await sb.rpc('apply_assessment_action', {
      p_action_id: action_id,
      p_due_date: /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') ? due_date : null,
      p_room_id: null,
    });
    if (error) return fail(`Could not add the task: ${error.message}`);

    const out = (data ?? {}) as { ok?: boolean; task_id?: string | null; already?: boolean; error?: string };
    // `project_tasks` is the only task table this platform has, so a finance or property action
    // says so plainly instead of silently doing nothing.
    if (out.ok === false) return fail(out.error || 'This action cannot become a task.');

    const already = out.already === true;
    onChunk?.({
      type: 'assessment_action_applied',
      action_id, title,
      subject_type: act.subject_type,
      subject_id: act.subject_id,
      ...(act.subject_type === 'project' ? { project_id: act.subject_id } : {}),
      task_id: out.task_id ?? null,
      already,
    });
    return JSON.stringify({
      success: true,
      task_id: out.task_id ?? null,
      // Said out loud rather than reported as a fresh success: the second caller of a
      // double-tapped button gets the task that exists, and needs to know that is what happened.
      already_on_the_list: already,
      message: already ? `"${title}" was already on the task list.` : `Added "${title}" to the task list.`,
    });
  },
  {
    name: 'apply_assessment_action',
    description:
      'Turn one recommended assessment action into a real task on its project. Free, and safe to ' +
      'retry: an action already on the task list returns the existing task rather than cutting a ' +
      'second one. Only project actions can become tasks — finance and property actions are ' +
      'marked done or dismissed instead.',
    schema: z.object({
      action_id: z.string().describe('The id of the action, from a get_*_assessment or list_assessment_actions result.'),
      due_date: z.string().optional().describe('Due date as YYYY-MM-DD. Defaults to the date the assessment suggested.'),
    }),
  },
);
