import type { BackgroundJob } from './types';

export interface StageEvent {
  stage?: unknown;
  status?: unknown;
}

const FAILED_STAGE_STATUSES = new Set(['failed', 'completed_with_failures']);

export function latestStageStatuses(events: readonly StageEvent[]): Record<string, string> {
  const latest: Record<string, string> = {};
  for (const ev of events) {
    if (typeof ev.stage === 'string' && ev.stage) {
      latest[ev.stage] = typeof ev.status === 'string' && ev.status ? ev.status : 'completed';
    }
  }
  return latest;
}

export function completedStages(latest: Record<string, string>): string[] {
  return Object.entries(latest)
    .filter(([, st]) => st !== 'in_progress' && st !== 'failed')
    .map(([stage]) => stage);
}

export function failedStages(latest: Record<string, string>): string[] {
  return Object.entries(latest)
    .filter(([, st]) => FAILED_STAGE_STATUSES.has(st))
    .map(([stage]) => stage);
}

export interface JobOutcome {
  completedWithFailures: boolean;
  failedStages: string[];
  productsFailed: number;
}

/** A completed job is only a clean success when no stage and no product recorded a failure. */
export function jobOutcome(
  job: Pick<BackgroundJob, 'status' | 'metadata' | 'failure_summary'> | null | undefined,
  events: readonly StageEvent[],
): JobOutcome {
  const failed = failedStages(latestStageStatuses(events));
  const meta = (job?.metadata ?? {}) as Record<string, unknown>;
  const productsFailed = Math.max(
    Number(job?.failure_summary?.products_failed ?? 0) || 0,
    Number(meta.products_failed ?? 0) || 0,
  );
  const completedWithFailures =
    meta.completion_reason === 'completed_with_failures' || failed.length > 0 || productsFailed > 0;
  return { completedWithFailures, failedStages: failed, productsFailed };
}

export function describeFailures(outcome: JobOutcome): string {
  const parts: string[] = [];
  if (outcome.failedStages.length > 0) {
    parts.push(`${outcome.failedStages.length} stage(s) failed: ${outcome.failedStages.map((s) => s.replace(/_/g, ' ')).join(', ')}`);
  }
  if (outcome.productsFailed > 0) parts.push(`${outcome.productsFailed} product(s) failed`);
  return parts.length > 0 ? `Completed with failures — ${parts.join('; ')}` : 'Completed with failures';
}
