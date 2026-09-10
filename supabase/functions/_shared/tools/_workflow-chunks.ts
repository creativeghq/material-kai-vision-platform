/** Shared workflow-chunk emission helper. */

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
    /** Pause a workflow STEP and ask for the values it needs. */
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
