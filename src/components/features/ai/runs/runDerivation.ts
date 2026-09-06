/**
 * runDerivation — the run is DERIVED from the stream, never restated by hand.
 *
 * agent-chat already emits `tool_call` / `tool_progress` / `tool_result` / `tool_error`
 * for every tool on every turn, and `workflow_*` for the eight planned pipelines. This
 * module is the only place that reads them into an `AgentRunState`, so a toolkit gets a
 * live progress surface by existing — not by someone remembering to write one.
 *
 * Pure and framework-free on purpose: every rule below is a unit test in
 * tests/unit/agentRunProgress.test.ts rather than something you have to run the app to see.
 */
import { findTool, TOOLKITS } from '../agentToolsCatalog';
import { getWorkflow } from '../workflows/workflowRegistry';
import type { WorkflowRuntimeState } from '../workflows/types';
import { iconNameForCategory } from './stepIcons';
import type { AgentRunState, AgentRunStatus, AgentRunStep, AgentRunStepStatus } from './runTypes';

/** A stream chunk, as loosely typed as it arrives. */
type Chunk = Record<string, unknown> & { type?: string };

/**
 * Human label for a tool id.
 *
 * The catalog answers for a tool it knows; the fallback de-snakes the id
 * (`seo_keyword_research` → "Seo keyword research"). Never the raw id: the chat has
 * already shown a customer "Done — ran manage_appointments." once.
 */
export function stepTitleForTool(toolId: string): string {
  const known = findTool(toolId);
  if (known?.name) return known.name;
  const words = toolId.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : toolId;
}

function stepIconNameForTool(toolId: string): string {
  return iconNameForCategory(findTool(toolId)?.category);
}

export function toolkitName(toolkitId?: string): string | undefined {
  if (!toolkitId) return undefined;
  return TOOLKITS.find((t) => t.id === toolkitId)?.name;
}

export interface CreateRunArgs {
  runId: string;
  /** What the user asked, in their words. */
  title: string;
  userMessageId?: string;
  toolkitId?: string;
  agentId?: string;
  /** Set when this send is continuing a locally-booted workflow run. */
  workflowRunId?: string;
  /**
   * Tools this run is KNOWN to call before it calls them — a `run:` quick-start pins exactly
   * one, so its card can say "Step 1 of 1 — Keyword research" the instant it is clicked
   * instead of a blank panel until the first chunk lands. Derived from the quick-start's own
   * `run.tool`, so it is not a second description of what the tool does.
   */
  plannedTools?: string[];
  startedAt?: number;
}

export function createRun(args: CreateRunArgs): AgentRunState {
  const planned = args.plannedTools ?? [];
  const steps: Record<string, AgentRunStep> = {};
  const stepOrder: string[] = [];
  planned.forEach((toolId, idx) => {
    const id = `tool:${toolId}:${idx + 1}`;
    stepOrder.push(id);
    steps[id] = {
      id,
      title: stepTitleForTool(toolId),
      description: findTool(toolId)?.desc,
      icon: stepIconNameForTool(toolId),
      status: 'pending',
      tool_id: toolId,
    };
  });
  return {
    run_id: args.runId,
    user_message_id: args.userMessageId,
    workflow_run_id: args.workflowRunId,
    origin: planned.length > 0 ? 'planned' : 'discovered',
    title: args.title,
    toolkit_id: args.toolkitId,
    toolkit_name: toolkitName(args.toolkitId),
    agent_id: args.agentId,
    status: 'running',
    step_order: stepOrder,
    steps,
    started_at: args.startedAt ?? Date.now(),
  };
}

/** Newest step for `toolId` that has not settled yet — the one a result belongs to. */
function openStepForTool(run: AgentRunState, toolId: string): AgentRunStep | undefined {
  for (let i = run.step_order.length - 1; i >= 0; i--) {
    const step = run.steps[run.step_order[i]];
    if (step?.tool_id === toolId && (step.status === 'running' || step.status === 'pending')) return step;
  }
  return undefined;
}

/** Newest step still running, whatever tool it belongs to. */
function newestRunningStep(run: AgentRunState): AgentRunStep | undefined {
  for (let i = run.step_order.length - 1; i >= 0; i--) {
    const step = run.steps[run.step_order[i]];
    if (step?.status === 'running') return step;
  }
  return undefined;
}

function withStep(run: AgentRunState, step: AgentRunStep): AgentRunState {
  const known = run.step_order.includes(step.id);
  return {
    ...run,
    step_order: known ? run.step_order : [...run.step_order, step.id],
    steps: { ...run.steps, [step.id]: step },
  };
}

/**
 * What a finished tool call has to say for itself.
 *
 * A count is reported as a count; NOTHING found is reported as nothing found; a failure is
 * reported as a failure and never as a zero. A tool that returns no count at all gets no
 * invented one — the step just reads "Done", because a number nobody measured is worse
 * than no number (anti-regression rule 3).
 */
export function resultLine(chunk: Chunk): string {
  if (chunk.failed) return 'Failed';
  const count = typeof chunk.resultCount === 'number' ? chunk.resultCount : null;
  if (chunk.zeroResult || count === 0) return 'Nothing found';
  if (count !== null) return `${count} result${count === 1 ? '' : 's'}`;
  return 'Done';
}

/**
 * Fold one stream chunk into the run. Returns the same object when the chunk says nothing
 * about progress, so callers can set state unconditionally without re-rendering the world.
 */
export function applyRunChunk(run: AgentRunState, chunk: Chunk): AgentRunState {
  const now = Date.now();
  switch (chunk.type) {
    case 'status': {
      const message = typeof chunk.message === 'string' ? chunk.message : undefined;
      return message ? { ...run, activity: message } : run;
    }

    case 'tool_call': {
      const toolId = typeof chunk.tool === 'string' ? chunk.tool : '';
      if (!toolId) return run;
      // A step this run already PLANNED for the tool is the step now starting — adopting it is
      // what stops a pinned quick-start from drawing its one step twice, once as "waiting"
      // forever and once as the real thing.
      const plannedStep = run.step_order
        .map((id) => run.steps[id])
        .find((st) => st?.tool_id === toolId && st.status === 'pending');
      if (plannedStep) {
        return withStep(run, {
          ...plannedStep,
          status: 'running',
          status_line: typeof chunk.message === 'string' ? chunk.message : plannedStep.status_line,
          started_at: now,
        });
      }
      // One id per OCCURRENCE: an agent that searches three times in a turn did three
      // things, and collapsing them onto one step would silently hide two of them.
      const occurrence = run.step_order.filter((id) => id.startsWith(`tool:${toolId}:`)).length + 1;
      const known = findTool(toolId);
      return withStep(run, {
        id: `tool:${toolId}:${occurrence}`,
        title: stepTitleForTool(toolId),
        description: known?.desc,
        icon: stepIconNameForTool(toolId),
        status: 'running',
        status_line: typeof chunk.message === 'string' ? chunk.message : undefined,
        tool_id: toolId,
        started_at: now,
      });
    }

    case 'tool_progress': {
      const line = typeof chunk.status === 'string' ? chunk.status : undefined;
      if (!line) return run;
      const toolId = typeof chunk.tool === 'string' ? chunk.tool : '';
      const target = (toolId && openStepForTool(run, toolId)) || newestRunningStep(run);
      // No step open yet — the line is still the truest thing on screen, so it becomes the
      // run's activity rather than being dropped.
      if (!target) return { ...run, activity: line };
      return withStep(run, { ...target, status_line: line });
    }

    case 'tool_result': {
      const toolId = typeof chunk.tool === 'string' ? chunk.tool : '';
      const target = (toolId && openStepForTool(run, toolId)) || newestRunningStep(run);
      if (!target) return run;
      return withStep(run, {
        ...target,
        status: chunk.failed ? 'failed' : 'done',
        status_line: resultLine(chunk),
        error_message: chunk.failed && typeof chunk.error === 'string' ? chunk.error : target.error_message,
        completed_at: now,
      });
    }

    case 'tool_error': {
      const toolId = typeof chunk.tool === 'string' ? chunk.tool : '';
      const target = (toolId && openStepForTool(run, toolId)) || newestRunningStep(run);
      const message = typeof chunk.error === 'string' ? chunk.error
        : typeof chunk.message === 'string' ? chunk.message
        : 'The tool reported an error.';
      if (!target) {
        return {
          ...run,
          activity: message,
          error_message: run.error_message ?? message,
        };
      }
      return withStep(run, {
        ...target,
        status: 'failed',
        status_line: 'Failed',
        error_message: message,
        completed_at: now,
      });
    }

    // JARVIS handed the turn to a specialist. Worth saying: the run card is the only place
    // that survives the turn, and reasoning steps are cleared between turns.
    case 'agent_routed': {
      const to = typeof chunk.name === 'string' ? chunk.name
        : typeof chunk.to === 'string' ? chunk.to : null;
      return to ? { ...run, activity: `Routed to ${to}.` } : run;
    }

    /**
     * Image/video generation queues a job and the turn ENDS — the variations arrive later in
     * the grid, on their own polling. So the step is `done` on the queue, which is the work
     * this turn actually did; leaving it running would end the turn `unreported` and read as
     * a failure of something that is simply still going.
     */
    case 'generation_job_created': {
      const models = typeof chunk.model_count === 'number' ? chunk.model_count : null;
      const occurrence = run.step_order.filter((id) => id.startsWith('generation:')).length + 1;
      return withStep(run, {
        id: `generation:${occurrence}`,
        title: 'Image generation',
        icon: 'ImageIcon',
        status: 'done',
        status_line: models === null
          ? 'Queued. The variations arrive in the grid.'
          : `Queued ${models} variation${models === 1 ? '' : 's'}. They arrive in the grid.`,
        started_at: now,
        completed_at: now,
      });
    }

    // A planned pipeline announced itself mid-run. From here the WORKFLOW is the display —
    // its plan is strictly more informative than the tools discovered underneath it, and
    // drawing both would put two cards on one turn.
    case 'workflow_plan': {
      const runId = typeof chunk.run_id === 'string' ? chunk.run_id : undefined;
      const definitionId = typeof chunk.definition_id === 'string' ? chunk.definition_id : undefined;
      if (!runId) return run;
      return { ...run, workflow_run_id: runId, definition_id: definitionId ?? run.definition_id };
    }

    default:
      return run;
  }
}

/**
 * The turn ended. Steps that never reported are marked `unreported` rather than quietly
 * completed — "the tool started and nothing ever said how it went" is a finding, not a tick.
 */
export function finishRun(run: AgentRunState, status: AgentRunStatus, errorMessage?: string): AgentRunState {
  const steps = { ...run.steps };
  for (const id of run.step_order) {
    const step = steps[id];
    if (!step) continue;
    if (step.status === 'running' || step.status === 'awaiting_input') {
      steps[id] = {
        ...step,
        status: status === 'failed' ? 'failed' : 'unreported',
        status_line: status === 'failed' ? (step.status_line ?? 'Failed') : 'Started, never reported back',
        completed_at: Date.now(),
      };
    } else if (step.status === 'pending') {
      steps[id] = { ...step, status: status === 'done' ? 'skipped' : step.status };
    }
  }
  return {
    ...run,
    steps,
    status,
    ended_at: Date.now(),
    error_message: errorMessage ?? run.error_message,
    activity: undefined,
  };
}

/**
 * Adapt a workflow runtime into the same display model.
 *
 * One renderer, two producers: without this the canvas would need a second card that says
 * the same things about a workflow that the generic one says about a tool run, and the two
 * would drift the way the two icon maps did.
 */
export function runFromWorkflow(wf: WorkflowRuntimeState, extra?: {
  userMessageId?: string;
  toolkitId?: string;
  startedAt?: number;
}): AgentRunState {
  const definition = getWorkflow(wf.definition_id);
  const steps: Record<string, AgentRunStep> = {};
  for (const id of wf.step_order) {
    const def = definition?.steps.find((s) => s.id === id);
    const rt = wf.steps[id];
    steps[id] = {
      id,
      title: def?.title || id,
      description: def?.description,
      icon: def?.icon,
      status: (rt?.status ?? 'pending') as AgentRunStepStatus,
      status_line: rt?.status_line,
      error_message: rt?.error_message,
      tool_id: def?.tool_id,
    };
  }
  const status: AgentRunStatus =
    wf.status === 'done' ? 'done'
    : wf.status === 'failed' ? 'failed'
    : wf.status === 'aborted' ? 'aborted'
    : 'running';
  return {
    run_id: wf.run_id,
    user_message_id: extra?.userMessageId,
    definition_id: wf.definition_id,
    workflow_run_id: wf.run_id,
    origin: 'planned',
    title: definition?.name || wf.definition_id,
    toolkit_id: extra?.toolkitId,
    toolkit_name: toolkitName(extra?.toolkitId),
    status,
    step_order: [...wf.step_order],
    steps,
    started_at: extra?.startedAt ?? 0,
  };
}

/**
 * The tab caption for a run. The user's own words when we have them, the pipeline's name
 * for a planned run, and never a truncation so short it says nothing.
 */
export function runTabTitle(run: AgentRunState): string {
  const base = run.title?.trim() || run.toolkit_name || 'Run';
  const clean = base.replace(/^▶\s*/, '');
  return clean.length > 42 ? `${clean.slice(0, 41)}…` : clean;
}
