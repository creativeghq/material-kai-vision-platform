/**
 * The inspection value-sets, written ONCE and import-free.
 *
 * `project_inspections_status_check` and `project_inspection_items.result` are the enforcers, so a
 * copy that drifts wider makes the UI offer a value the write rejects with a raw 23514, and one
 * that drifts narrower makes a legitimate answer vanish from the screen.
 *
 * IMPORT-FREE on purpose: the service that would otherwise hold these constructs a Supabase client
 * at module load, which a hermetic unit test cannot do.
 */

/**
 * What a PERSON has done with the inspection — not what the answers imply.
 *
 * Signing off is a claim somebody puts their name to. Whether the checklist passed is arithmetic,
 * lives in `get_project_inspections`, and is deliberately NOT one of these.
 */
export const INSPECTION_STATUSES = ['draft', 'in_progress', 'signed_off'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/**
 * The answer to one checklist item. `null` is a fourth state and the most important one: NOT YET
 * ANSWERED. It is never coalesced to a pass — an unanswered item is the entire reason an
 * inspection reads as in progress rather than as passed with nothing found.
 */
export const INSPECTION_RESULTS = ['pass', 'fail', 'na'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/**
 * The DERIVED verdict, as `get_project_inspections` computes it. Never stored — a stored verdict
 * goes stale the moment an item is re-answered, and a valid string then disagrees with the list
 * underneath it while nothing raises.
 *
 * `empty` is not a pass. A checklist with no items is a stage nobody actually checked wearing the
 * badge of one that was, and it is the only outcome that says so.
 */
export const INSPECTION_OUTCOMES = [
  'empty', 'not_started', 'in_progress', 'failed', 'passed',
] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export const INSPECTION_OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  empty: 'No items',
  not_started: 'Not started',
  in_progress: 'In progress',
  failed: 'Failed',
  passed: 'Passed',
};

export function isInspectionResult(v: unknown): v is InspectionResult {
  return typeof v === 'string' && (INSPECTION_RESULTS as readonly string[]).includes(v);
}

export function isInspectionOutcome(v: unknown): v is InspectionOutcome {
  return typeof v === 'string' && (INSPECTION_OUTCOMES as readonly string[]).includes(v);
}
