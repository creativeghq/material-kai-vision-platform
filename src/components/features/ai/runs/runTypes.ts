/**
 * Agent RUN — the one display model for "the agent is working on this right now".
 *
 * A run is one unit of work the user started: a typed message, a quick-start click, a
 * booted workflow. It has steps, and each step has a verdict.
 *
 * There are two PRODUCERS and one RENDERER:
 *   • a workflow run  — steps are PLANNED, from the WorkflowDefinition registry, so the
 *     user sees steps 2..N before they happen (`runFromWorkflow`)
 *   • every other run — steps are DISCOVERED from the `tool_call` / `tool_progress` /
 *     `tool_result` / `tool_error` chunks agent-chat already emits for every tool on
 *     every turn (`applyRunChunk`)
 *
 * Only 8 of 48 toolkits have a hand-written pipeline, and hand-writing the other 40
 * would be a second copy of what the tools already do — it would drift the first time a
 * tool changed. Discovery is a derivation of what actually ran, so it cannot.
 *
 * The step-status vocabulary is the WORKFLOW one, imported rather than restated, plus
 * exactly one value it has no reason to carry (`unreported`, below).
 */
import type { WorkflowStepStatus } from '../workflows/types';

/**
 * A workflow step's status, plus the one verdict a discovered step can reach that a
 * planned one cannot: the tool announced itself, the turn ended, and nothing ever said
 * how it went.
 *
 * It is NOT `done` (that claims a success nobody reported) and NOT `failed` (that claims
 * a failure nobody reported). A step that ends with no verdict is the silent-zero shape,
 * and the whole point of this surface is that it says so out loud.
 */
export type AgentRunStepStatus = WorkflowStepStatus | 'unreported';

export type AgentRunStatus = 'running' | 'done' | 'failed' | 'aborted';

/** Where the step list came from. Drives the header copy ("Step 2 of 4" vs "Step 2"). */
export type AgentRunOrigin = 'planned' | 'discovered';

export interface AgentRunStep {
  /** Stable within the run. `tool:<tool_id>:<occurrence>` for discovered steps. */
  id: string;
  /** Human label. Never a raw tool id — see `stepTitleForTool`. */
  title: string;
  description?: string;
  /** Lucide icon name, resolved through `runs/stepIcons`. */
  icon?: string;
  status: AgentRunStepStatus;
  /** The live line under the title — "Researching keywords for …", "12 results". */
  status_line?: string;
  error_message?: string;
  tool_id?: string;
  started_at?: number;
  completed_at?: number;
}

export interface AgentRunState {
  run_id: string;
  /** The user message this run answers. Ties the run to its turn in the canvas strip. */
  user_message_id?: string;
  /** Set when the run follows a registry WorkflowDefinition. */
  definition_id?: string;
  /**
   * The WorkflowRuntimeState this run is showing. Set when a `workflow_plan` chunk
   * arrives mid-run, or when the send followed a locally-booted workflow.
   *
   * A run carrying this is rendered from the workflow instead of from its own tool
   * steps — otherwise one turn draws two cards, the plan and the tools that executed it.
   */
  workflow_run_id?: string;
  origin: AgentRunOrigin;
  /** What the user asked, in their words. The card's heading. */
  title: string;
  /** The toolkit behind it, when the run came from a quick-start. */
  toolkit_id?: string;
  toolkit_name?: string;
  agent_id?: string;
  status: AgentRunStatus;
  step_order: string[];
  steps: Record<string, AgentRunStep>;
  started_at: number;
  ended_at?: number;
  /** Last free-form line from the stream, shown while no step is running yet. */
  activity?: string;
  error_message?: string;
}

/** Terminal verdicts — a step in one of these is not going to change again. */
const SETTLED: ReadonlySet<AgentRunStepStatus> = new Set<AgentRunStepStatus>([
  'done', 'failed', 'skipped', 'unreported',
]);

export function isSettled(status: AgentRunStepStatus): boolean {
  return SETTLED.has(status);
}

export interface RunProgress {
  settled: number;
  total: number;
  /** 0–100, rounded. `total === 0` gives 0 rather than NaN. */
  pct: number;
  /** 1-based position of the step being worked on, or null when none is. */
  currentIndex: number | null;
  currentTitle?: string;
}

export function runProgress(run: AgentRunState): RunProgress {
  const total = run.step_order.length;
  const settled = run.step_order.filter((id) => isSettled(run.steps[id]?.status ?? 'pending')).length;
  const activeIdx = run.step_order.findIndex((id) => {
    const s = run.steps[id]?.status ?? 'pending';
    return s === 'running' || s === 'awaiting_input';
  });
  return {
    settled,
    total,
    pct: total === 0 ? 0 : Math.round((settled / total) * 100),
    currentIndex: activeIdx === -1 ? null : activeIdx + 1,
    currentTitle: activeIdx === -1 ? undefined : run.steps[run.step_order[activeIdx]]?.title,
  };
}
