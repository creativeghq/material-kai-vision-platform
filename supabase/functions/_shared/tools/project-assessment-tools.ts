/**
 * AI Assessment toolkit — the agent surface for the `project-assessment` module.
 *
 * Tools:
 *   - assess_project            — run a full assessment (PAID: reserve/settle, one Claude turn)
 *   - get_project_assessment    — the latest report and its open actions (0 credits, DB read)
 *   - list_assessment_actions   — what is outstanding across every project (0 credits, DB read)
 *   - apply_assessment_action   — turn one recommended action into a real project task (0 credits)
 *
 * WHAT THE MODEL IS NOT DOING HERE. Every number in a report is derived by
 * `get_project_assessment_snapshot` in SQL — 38 signals, the dimension scores and the verdict.
 * `assess_project` spends a credit on the WRITE-UP, not on the arithmetic. The reader tools below
 * spend nothing at all, which is the point: "what should I do next" should not cost money to ask
 * twice.
 *
 * Every tool emits a chunk registered in `AGENT_RESULT_TITLES` and rendered by a real branch in
 * AgentHub. A quick-start with `run:` calls these deterministically with no model turn, so an
 * unrendered chunk is not "the agent will summarise it" — it is a blank screen under a cheerful
 * "done".
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
  ASSESSMENT_MODULE_SLUG,
  ASSESSMENT_CREDIT_CEILING,
  resolveProjectId,
  runProjectAssessment,
} from '../project-assessment.ts';
import {
  ASSESSMENT_VERDICT_LABELS,
  ASSESSMENT_DIMENSION_LABELS,
} from '../assessmentVocabulary.generated.ts';

// deno-lint-ignore no-explicit-any
type Chunk = (chunk: any) => void;

const fail = (error: string) => JSON.stringify({ success: false, error });

/**
 * The report as the card renders it. Built once so `assess_project` and `get_project_assessment`
 * cannot describe the same row differently — the second-copy shape, in miniature.
 */
// deno-lint-ignore no-explicit-any
function reportPayload(project: { id: string; name: string }, row: any, actions: any[]) {
  // deno-lint-ignore no-explicit-any
  const signals: any[] = Array.isArray(row?.signals) ? row.signals : [];
  return {
    project_id: project.id,
    project_name: project.name,
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
    // A dimension that could not be judged says so rather than vanishing (rule 3). The card
    // shows six tiles every time; `score: null` reads as "not judged", never as zero.
    dimensions: Object.entries(row?.scores?.dimensions ?? {}).map(([key, d]) => ({
      key,
      label: (ASSESSMENT_DIMENSION_LABELS as Record<string, string>)[key] ?? key,
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
async function loadLatestReport(projectId: string): Promise<{ row: any; actions: any[] } | null> {
  const sb = svcClient();
  const { data: row } = await sb
    .from('project_assessments')
    .select('id, run_status, verdict, overall_score, scores, signals, headline, narrative, created_at, completed_at, error_message')
    .eq('project_id', projectId)
    .eq('run_status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;
  const { data: actions } = await sb
    .from('project_assessment_actions')
    .select('id, priority, title, rationale, effort, impact, dimension, destination, signal_code, state, task_id, due_hint')
    .eq('assessment_id', (row as { id: string }).id)
    .order('priority', { ascending: true });
  return { row, actions: actions ?? [] };
}

// ───────────────────────────────────────────────────────────────────────────
// 1) assess_project — the paid one
// ───────────────────────────────────────────────────────────────────────────
export const createAssessProjectTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ project_id, project_name, today }: { project_id?: string; project_name?: string; today?: string }) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_MODULE_SLUG);
    if (denied) return denied;

    const sb = svcClient();
    const resolved = await resolveProjectId(sb, userId, workspaceId, project_id, project_name);
    if (!resolved) return fail('No matching project in this workspace. Name it, or create it first.');

    const { data: project } = await sb.from('projects').select('id, name').eq('id', resolved).single();

    try {
      const result = await runProjectAssessment(sb, {
        projectId: resolved,
        workspaceId,
        userId,
        today,
        onProgress: (status) => onChunk?.({ type: 'tool_progress', status, timestamp: Date.now() }),
      });

      if (result.already_running) {
        return JSON.stringify({
          success: true,
          note: 'An assessment for this project is already running. Nothing was charged twice.',
          assessment_id: result.assessment_id,
        });
      }

      const latest = await loadLatestReport(resolved);
      const payload = reportPayload(project as { id: string; name: string }, latest?.row, latest?.actions ?? []);
      onChunk?.({ type: 'project_assessment_report', ...payload, credits_used: result.credits_used });

      return JSON.stringify({
        success: true,
        assessment_id: result.assessment_id,
        verdict: result.verdict,
        overall_score: result.overall_score,
        headline: result.headline,
        actions_stored: result.actions_stored,
        credits_used: result.credits_used,
        // Stated, not hidden. The ceiling was kept because the model has no price row, and an
        // unpriced call is a gap in the price table rather than a free one.
        unpriced_model: result.unpriced_model || undefined,
      });
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'insufficient_credits') {
        return fail(e.message || 'Not enough credits to run an assessment. Please top up.');
      }
      // The run row already carries the reason and the reserved credits are already refunded —
      // this is the sentence the user reads, and it names the half that failed.
      return fail(`The signals were derived but the write-up failed: ${e.message}`);
    }
  },
  {
    name: 'assess_project',
    description:
      `Run a full AI assessment of one project: derive its health across setup, commercial, financial, ` +
      `schedule, delivery and client signals, then produce a verdict and a ranked list of what to do next. ` +
      `Costs up to ${ASSESSMENT_CREDIT_CEILING} credits (typically ~9). Use get_project_assessment first ` +
      `if the user only wants to see the last one.`,
    schema: z.object({
      project_id: z.string().optional().describe('The project id, when you already have it.'),
      project_name: z.string().optional().describe('Part of the project name, e.g. "Athens loft".'),
      today: z.string().optional()
        .describe("The user's local date as YYYY-MM-DD. Pass it so overdue is judged on their calendar day."),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// 2) get_project_assessment — free
// ───────────────────────────────────────────────────────────────────────────
export const createGetProjectAssessmentTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ project_id, project_name }: { project_id?: string; project_name?: string }) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_MODULE_SLUG);
    if (denied) return denied;

    const sb = svcClient();
    const resolved = await resolveProjectId(sb, userId, workspaceId, project_id, project_name);
    if (!resolved) return fail('No matching project in this workspace.');
    const { data: project } = await sb.from('projects').select('id, name').eq('id', resolved).single();

    const latest = await loadLatestReport(resolved);
    if (!latest) {
      // Absence with a way out of it, not an empty result. The user is one tool call from having
      // one, and saying so is cheaper than making them ask again.
      onChunk?.({
        type: 'project_assessment_report',
        project_id: resolved,
        project_name: (project as { name?: string })?.name ?? null,
        assessment_id: null,
        run_status: 'none',
        verdict: null,
        actions: [],
        findings: [],
        dimensions: [],
      });
      return JSON.stringify({
        success: true,
        assessed: false,
        reason: 'no_assessment_yet',
        message: `"${(project as { name?: string })?.name}" has never been assessed. Run assess_project to produce one.`,
      });
    }

    const payload = reportPayload(project as { id: string; name: string }, latest.row, latest.actions);
    onChunk?.({ type: 'project_assessment_report', ...payload });
    return JSON.stringify({ success: true, assessed: true, ...payload });
  },
  {
    name: 'get_project_assessment',
    description:
      'Read the most recent AI assessment of a project — its verdict, dimension scores, findings and ' +
      'the actions it recommended. Free; no model call. Returns assessed:false when the project has ' +
      'never been assessed.',
    schema: z.object({
      project_id: z.string().optional().describe('The project id, when you already have it.'),
      project_name: z.string().optional().describe('Part of the project name.'),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// 3) list_assessment_actions — free, across every project
// ───────────────────────────────────────────────────────────────────────────
export const createListAssessmentActionsTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ project_name, state, limit }: { project_name?: string; state?: string; limit?: number }) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_MODULE_SLUG);
    if (denied) return denied;

    const sb = svcClient();
    // Tenancy: the id list comes from projects THIS user owns in THIS workspace, never from a
    // model-supplied id (invariant 1).
    let projQ = sb.from('projects').select('id, name').eq('user_id', userId);
    if (workspaceId) projQ = projQ.eq('workspace_id', workspaceId);
    if (project_name) projQ = projQ.ilike('name', `%${project_name}%`);
    const { data: projects } = await projQ;
    const ids = (projects ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) return JSON.stringify({ success: true, actions: [], note: 'No matching project.' });

    const wanted = ['open', 'task_created', 'done', 'dismissed'].includes(state || '') ? state! : 'open';
    const { data: rows, error } = await sb
      .from('project_assessment_actions')
      .select('id, project_id, priority, title, rationale, effort, impact, dimension, destination, signal_code, state, task_id, due_hint, created_at')
      .in('project_id', ids)
      .eq('state', wanted)
      .order('created_at', { ascending: false })
      .order('priority', { ascending: true })
      .limit(Math.min(Math.max(limit ?? 25, 1), 100));
    if (error) return fail(`Could not read the action list: ${error.message}`);

    const byId = new Map((projects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    const actions = (rows ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      project_name: byId.get(a.project_id as string) ?? null,
    }));

    onChunk?.({
      type: 'project_assessment_actions',
      state: wanted,
      actions,
      project_count: ids.length,
    });
    return JSON.stringify({ success: true, state: wanted, count: actions.length, actions });
  },
  {
    name: 'list_assessment_actions',
    description:
      'List the actions AI assessments have recommended across the projects, newest report first. ' +
      'Free; no model call. Use it to answer "what needs doing" without re-running an assessment.',
    schema: z.object({
      project_name: z.string().optional().describe('Narrow to projects whose name contains this.'),
      state: z.enum(['open', 'task_created', 'done', 'dismissed']).optional()
        .describe('Which actions to list. Defaults to open.'),
      limit: z.number().optional().describe('Maximum actions to return (1-100, default 25).'),
    }),
  },
);

// ───────────────────────────────────────────────────────────────────────────
// 4) apply_assessment_action — free write, idempotent in SQL
// ───────────────────────────────────────────────────────────────────────────
export const createApplyAssessmentActionTool = (
  userId: string,
  workspaceId: string,
  onChunk?: Chunk,
) => tool(
  async ({ action_id, due_date }: { action_id: string; due_date?: string }) => {
    const denied = await moduleGate(workspaceId, ASSESSMENT_MODULE_SLUG);
    if (denied) return denied;

    const sb = svcClient();
    // The action id is model-supplied, so its project is checked against this user and workspace
    // before anything is written (invariant 1). A miss reads as not-found, never as forbidden.
    const { data: action } = await sb
      .from('project_assessment_actions')
      .select('id, title, state, task_id, project_id, projects!inner(id, name, user_id, workspace_id)')
      .eq('id', action_id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const owner = (action as any)?.projects;
    if (!action || !owner || owner.user_id !== userId || (workspaceId && owner.workspace_id !== workspaceId)) {
      return fail('No such action on any of your projects.');
    }

    const title = String((action as { title?: string }).title ?? 'this action');

    const { data, error } = await sb.rpc('apply_assessment_action', {
      p_action_id: action_id,
      p_due_date: /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') ? due_date : null,
      p_room_id: null,
    });
    if (error) return fail(`Could not add the task: ${error.message}`);

    const out = (data ?? {}) as { task_id?: string | null; already?: boolean };
    const already = out.already === true;
    onChunk?.({
      type: 'project_assessment_action_applied',
      action_id,
      title,
      project_id: owner.id,
      project_name: owner.name,
      task_id: out.task_id ?? null,
      already,
    });
    return JSON.stringify({
      success: true,
      task_id: out.task_id ?? null,
      // Said out loud rather than reported as a fresh success: the second caller of a
      // double-tapped button gets the task that exists, and needs to know that is what happened.
      already_on_the_list: already,
      message: already
        ? `"${title}" was already on the task list.`
        : `Added "${title}" to ${owner.name}'s tasks.`,
    });
  },
  {
    name: 'apply_assessment_action',
    description:
      'Turn one recommended assessment action into a real task on its project. Free. Safe to retry: ' +
      'an action already on the task list returns the existing task rather than cutting a second one.',
    schema: z.object({
      action_id: z.string().describe('The id of the action, from get_project_assessment or list_assessment_actions.'),
      due_date: z.string().optional().describe('Due date as YYYY-MM-DD. Defaults to the date the assessment suggested.'),
    }),
  },
);
