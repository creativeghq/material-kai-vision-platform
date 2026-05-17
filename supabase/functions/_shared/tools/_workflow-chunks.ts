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
