import type { FlowRunResult } from '@/services/flows';

/** Toast copy for a finished run: a run whose actions were skipped did not do what it says. */
export function runOutcomeToast(flowName: string, run: FlowRunResult, test = false) {
  const skipped = run.skipped_steps ?? 0;
  const failed = run.status === 'failed';
  const verb = test ? 'Test run' : 'Run';
  return {
    title: failed ? `${verb} failed` : skipped ? `${verb} completed with ${skipped} skipped` : `${verb} completed`,
    description: failed
      ? `"${flowName}": ${run.error_message || 'see Run History'}`
      : skipped
        ? `"${flowName}": ${skipped} action${skipped === 1 ? '' : 's'} did nothing (missing input). See Run History for the reason.`
        : `"${flowName}" ran every step.`,
    variant: failed ? ('destructive' as const) : undefined,
  };
}
