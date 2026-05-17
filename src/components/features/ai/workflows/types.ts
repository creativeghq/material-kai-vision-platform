/**
 * Workflow types — the shared contract between the agent (which emits chunks)
 * and the chat surface (which renders the WorkflowTracker + step cards +
 * inline forms).
 *
 * The agent emits these four chunk types during a multi-step run:
 *
 *   1. workflow_plan              — boots a tracker. Sent ONCE at the start.
 *   2. workflow_step_progress     — emitted whenever a step changes status.
 *   3. workflow_step_input_request— a step needs user input. Frontend renders an
 *                                    inline form. User submits → resumes flow.
 *   4. workflow_finished          — the workflow ended (done | aborted | failed).
 *
 * The frontend keeps a single source of truth: the `workflows` map on a
 * Message. Chunks mutate that map in place; the WorkflowTracker re-renders.
 */

export type WorkflowStepStatus =
  | 'pending'        // not started yet
  | 'running'        // tool currently executing
  | 'awaiting_input' // form rendered, waiting for user
  | 'done'           // step succeeded
  | 'failed'         // step errored
  | 'skipped';       // user / agent skipped this step

export type WorkflowOverallStatus =
  | 'planning'   // plan emitted, no step started yet
  | 'running'    // at least one step is running or awaiting input
  | 'done'
  | 'failed'
  | 'aborted';

export interface WorkflowFieldSchema {
  /** Internal field name used as the form input id and the result key. */
  name: string;
  /** Display label rendered above the input. */
  label: string;
  /** Free-form helper text rendered under the input. */
  hint?: string;
  /** Defaults to 'text'. */
  type?: 'text' | 'textarea' | 'number' | 'email' | 'url' | 'select' | 'multiselect' | 'checkbox' | 'pdf_picker' | 'category_picker' | 'product_picker' | 'catalog_picker';
  /** When type is select / multiselect. */
  options?: Array<{ value: string; label: string; description?: string }>;
  /** Pre-filled default. */
  defaultValue?: string | number | boolean | string[];
  required?: boolean;
  /** Placeholder text for text inputs. */
  placeholder?: string;
  /** When type is `pdf_picker` etc., which entity to pick from. */
  source?: 'catalog_source_pdfs' | 'crm_categories' | 'products' | 'moodboards' | 'crm_contacts' | 'presentation_catalogs';
  /** Single vs multi select for picker fields. Default per type:
   *    pdf_picker = true, category_picker = true, product_picker = false,
   *    catalog_picker = false. */
  multi?: boolean;
  /** Optional filter for catalog_picker — restricts to certain statuses. */
  status_filter?: Array<'draft' | 'generating' | 'ready' | 'published' | 'archived' | 'failed'>;
}

export interface WorkflowStepDefinition {
  /** Stable ID used to address the step in chunks. */
  id: string;
  /** 1-based display order in the tracker. */
  order: number;
  /** Short title shown in the tracker. */
  title: string;
  /** One-line description shown in the expanded step card. */
  description?: string;
  /** Lucide icon name (string) that the tracker maps to a component. */
  icon?: string;
  /** Tool that drives this step (purely informational; the agent picks). */
  tool_id?: string;
  /** Whether this step can be skipped via the tracker UI. */
  skippable?: boolean;
  /** Whether this step is conditional on a prior step's output. */
  conditional?: boolean;
  /** When true, the step's form is shown immediately and the agent waits. */
  awaits_user_input?: boolean;
  /** Form schema for `awaiting_input` steps. */
  input_schema?: WorkflowFieldSchema[];
}

export interface WorkflowDefinition {
  /** Stable ID — used in workflow_plan chunks. */
  id: string;
  /** Short display name shown in the tracker header + command palette. */
  name: string;
  /** One-paragraph description shown in the command palette. */
  description: string;
  /** Steps in display order. */
  steps: WorkflowStepDefinition[];
  /** Lucide icon name. */
  icon?: string;
  /** Module slug — used to gate visibility in the palette. */
  moduleSlug?: string;
  /** Admin-only? */
  adminOnly?: boolean;
  /** Starter prompts for the command palette. */
  examples?: string[];
  /** When set, the wizard auto-switches the active agent to this ID before
   *  booting locally, so the user doesn't get a "tools not available" reply
   *  because they were on the wrong agent. Defaults to 'kai' for any
   *  workflow whose tools live on the KAI agent. */
  agent_id?: string;
}

export interface WorkflowStepRuntimeState {
  step_id: string;
  status: WorkflowStepStatus;
  /** Free-form input snapshot the agent / form provided. */
  input?: Record<string, any>;
  /** Free-form output the tool returned. */
  output?: Record<string, any>;
  /** Human-readable status line shown in the tracker (e.g. "Found 12 candidates"). */
  status_line?: string;
  /** Error message when status='failed'. */
  error_message?: string;
  /** Timestamps for telemetry. */
  started_at?: string;
  completed_at?: string;
}

export interface WorkflowRuntimeState {
  /** Workflow definition ID — used to look up steps in the registry. */
  definition_id: string;
  /** Stable per-run ID, generated when the plan is emitted. */
  run_id: string;
  /** Display title (often pulled from the run's primary entity, e.g. catalog title). */
  title?: string;
  /** Display subtitle. */
  subtitle?: string;
  /** Per-step state, keyed by step_id. */
  steps: Record<string, WorkflowStepRuntimeState>;
  /** Order of step_ids — copied from the definition so we can render even if the definition isn't loaded. */
  step_order: string[];
  /** Overall status. */
  status: WorkflowOverallStatus;
  /** Run-level metadata (catalog_id, article_id, etc.). */
  metadata: Record<string, any>;
  /** Pinned in tracker? Default true while running, collapses on done. */
  collapsed?: boolean;
  /** When the workflow expects user input on a specific step, the chat surface
   *  pins that form below the tracker. */
  awaiting_input_step_id?: string | null;
  awaiting_input_schema?: WorkflowFieldSchema[];
  awaiting_input_prompt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk types emitted by the agent
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowPlanChunk {
  type: 'workflow_plan';
  run_id: string;
  definition_id: string;
  title?: string;
  subtitle?: string;
  metadata?: Record<string, any>;
  /** Optional override of the definition's steps (e.g. when the agent chose
   *  the alternate `extract` path instead of `translate`). When omitted, the
   *  full definition is rendered. */
  step_overrides?: Array<Pick<WorkflowStepDefinition, 'id' | 'title' | 'order' | 'icon' | 'description'>>;
}

export interface WorkflowStepProgressChunk {
  type: 'workflow_step_progress';
  run_id: string;
  step_id: string;
  status: WorkflowStepStatus;
  status_line?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error_message?: string;
}

export interface WorkflowStepInputRequestChunk {
  type: 'workflow_step_input_request';
  run_id: string;
  step_id: string;
  prompt: string;
  schema: WorkflowFieldSchema[];
}

export interface WorkflowFinishedChunk {
  type: 'workflow_finished';
  run_id: string;
  status: 'done' | 'failed' | 'aborted';
  summary?: string;
}

export type AnyWorkflowChunk =
  | WorkflowPlanChunk
  | WorkflowStepProgressChunk
  | WorkflowStepInputRequestChunk
  | WorkflowFinishedChunk;
