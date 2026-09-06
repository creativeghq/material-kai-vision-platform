/**
 * Where a workflow wizard IS — the three questions the card and its host both have to answer,
 * in one place and with no React in scope.
 *
 * They lived inside WorkflowWizardCard, which imports WorkflowInlineForm, which imports the
 * Supabase client: asking "does the wizard have an ask right now?" from the canvas meant
 * pulling a live DB client into the answer. Here it is a pure function of the runtime, so the
 * host can gate its form slot on the same verdict the card renders from rather than deriving a
 * second one that comes to disagree.
 */
import type { WorkflowRuntimeState } from './types';
import { getWorkflow } from './workflowRegistry';

/**
 * Which step the wizard is on. Priority:
 *   1. The step something is explicitly asking about (`awaiting_input_step_id`) — including a
 *      re-run or an edit on an already-finished step
 *   2. First step running / awaiting input
 *   3. First pending step
 *   4. None
 */
export function resolveWizardStepId(runtime: WorkflowRuntimeState): string | null {
  if (runtime.awaiting_input_step_id) return runtime.awaiting_input_step_id;
  for (const id of runtime.step_order) {
    const status = runtime.steps[id]?.status || 'pending';
    if (status === 'running' || status === 'awaiting_input') return id;
  }
  for (const id of runtime.step_order) {
    const status = runtime.steps[id]?.status || 'pending';
    if (status === 'pending') return id;
  }
  return null;
}

export function isWorkflowAllDone(runtime: WorkflowRuntimeState): boolean {
  // An explicit ask outranks "everything finished": Re-run / Edit input on a done step sets
  // `awaiting_input_step_id`, and short-circuiting to the completion card here meant those two
  // buttons produced no form at all — visibly nothing, on a workflow that had finished.
  if (runtime.awaiting_input_step_id) return false;
  if (runtime.step_order.length === 0) return false;
  return runtime.step_order.every((id) => {
    const s = runtime.steps[id]?.status;
    return s === 'done' || s === 'skipped';
  });
}

/**
 * Does the wizard have anything to put on screen for this runtime?
 *
 * The canvas run card gives its form slot its own separator and padding, so a slot that
 * renders null paints an empty strip under the step list — for the whole length of every
 * running step, which is most of a workflow.
 */
export function wizardHasSomethingToShow(runtime: WorkflowRuntimeState): boolean {
  if (!getWorkflow(runtime.definition_id)) return false;
  if (isWorkflowAllDone(runtime)) return true;
  const stepId = resolveWizardStepId(runtime);
  if (!stepId) return false;
  // Embedded, a running step is the run card's story to tell, not the wizard's.
  return runtime.steps[stepId]?.status !== 'running';
}
