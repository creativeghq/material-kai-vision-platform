/**
 * Shared workflow-chunk emission helper.
 *
 * Every tool that participates in a multi-step workflow uses this to emit
 * `workflow_plan`, `workflow_step_progress`, and `workflow_finished` chunks
 * so the frontend's WorkflowWizardCard + WorkflowTracker can drive the UI.
 *
 * Run_id strategy: each workflow uses a natural primary-entity ID as run_id
 * (catalog_id for catalog-build, tracked_mention_id for mention-monitor,
 * sheet_id for presentation-sheet, etc.). When the user kicks off a workflow
 * via the wizard's "boot locally" path, the frontend's chunk handler migrates
 * its locally-issued UUID to the server's run_id when the first
 * `workflow_plan` chunk arrives.
 *
 * Step IDs match the workflow registry definition exactly. See
 * src/components/features/ai/workflows/workflowRegistry.ts.
 */

export type ChunkSink = ((chunk: any) => void) | undefined;

export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'done'
  | 'failed'
  | 'skipped';

export function safeEmit(onChunk: ChunkSink, chunk: any) {
  if (!onChunk) return;
  try { onChunk(chunk); } catch { /* stream closed */ }
}

/**
 * Create a per-workflow emitter bound to (definition_id, run_id). Each
 * tool calls `emitter.plan(...)` once at the very first step, then
 * `emitter.step(...)` at running/done/failed transitions, and finally
 * `emitter.finished(...)` when the workflow completes.
 */
export function createWorkflowEmitter(args: {
  onChunk: ChunkSink;
  definition_id: string;
  run_id: string;
}) {
  const { onChunk, definition_id, run_id } = args;
  return {
    run_id,
    plan(planArgs: { title?: string; subtitle?: string; metadata?: Record<string, any> }) {
      safeEmit(onChunk, {
        type: 'workflow_plan',
        run_id,
        definition_id,
        title: planArgs.title,
        subtitle: planArgs.subtitle,
        metadata: planArgs.metadata || {},
      });
    },
    step(stepArgs: {
      step_id: string;
      status: WorkflowStepStatus;
      status_line?: string;
      input?: Record<string, any>;
      output?: Record<string, any>;
      error_message?: string;
    }) {
      safeEmit(onChunk, {
        type: 'workflow_step_progress',
        run_id,
        step_id: stepArgs.step_id,
        status: stepArgs.status,
        status_line: stepArgs.status_line,
        input: stepArgs.input,
        output: stepArgs.output,
        error_message: stepArgs.error_message,
      });
    },
    /**
     * Pause a workflow STEP and ask for the values it needs.
     *
     * STATUS, stated plainly because the previous comment here did not: **nothing calls this.**
     * It was added as "the missing half" of server-side input requests and no caller followed,
     * which is the same shape as `generate_video`'s push site — a fix that stopped at the helper.
     *
     * It is kept rather than deleted, and that is a decision with a reason. There are two ways to
     * ask the user something mid-turn and they are NOT interchangeable:
     *
     *   • `request_input` (#370) — an ad-hoc question the agent chooses to ask. It is a TOOL the
     *     model calls, it is dismissible ("decide for me"), and it is the right instrument for
     *     collecting scope. It has callers and works today.
     *   • this — parks a specific workflow STEP. AgentHub sets `awaiting_input_step_id` and marks
     *     that step `awaiting_input`, so the tracker stays coherent: the step shows as waiting
     *     rather than running, and the answer is recorded as that step's `input`. `request_input`
     *     cannot do that; it would leave the tracker claiming a step was running while a separate
     *     card asked a question.
     *
     * So a tool that needs to park a step should use this. What it must NOT become is a reflex:
     * `input-request-tools.ts` states the rule both share — ask only for parameters that
     * genuinely change the work, never for one the tool would have defaulted. b2b-research's
     * `search` step declares `awaits_user_input: true`, and pausing "find tile manufacturers in
     * Greece" to ask for the industry and country the user just gave would be exactly that
     * mistake, which is why it is not wired here.
     *
     * Today the step form is driven entirely client-side, from the registry: the picker seeds it
     * at boot and `handleWizardSkip` advances it. That path works and is what users see.
     *
     * `schema` is the step's `input_schema` from workflowRegistry — the same shape the picker
     * uses, so the two paths render identically instead of drifting.
     */
    inputRequest(args: {
      step_id: string;
      prompt?: string;
      schema: Array<Record<string, unknown>>;
    }) {
      safeEmit(onChunk, {
        type: 'workflow_step_input_request',
        run_id,
        definition_id,
        step_id: args.step_id,
        prompt: args.prompt,
        schema: args.schema,
      });
    },
    finished(args: { status: 'done' | 'failed' | 'aborted'; summary?: string }) {
      safeEmit(onChunk, {
        type: 'workflow_finished',
        run_id,
        status: args.status,
        summary: args.summary,
      });
    },
  };
}

export type WorkflowEmitter = ReturnType<typeof createWorkflowEmitter>;

/**
 * Step ID inventories per workflow — must match workflowRegistry.ts exactly.
 * Exported so each tool file can reference them with a constant rather than
 * a magic string.
 */
export const STEPS = {
  CATALOG_BUILD: ['create', 'attach', 'extract', 'add_extra', 'images', 'generate', 'publish', 'send'] as const,
  MENTION_MONITOR: ['enroll', 'first_run', 'llm_probe', 'review'] as const,
  SEO_ARTICLE: ['research', 'plan', 'write', 'analyze'] as const,
  PRESENTATION_SHEET: ['pick_type', 'fill_inputs', 'render'] as const,
  B2B_RESEARCH: ['search', 'scrape', 'enrich', 'contacts', 'validate', 'save'] as const,
} as const;
