/**
 * AI Assessment vocabulary — the closed value-sets three runtimes have to agree on.
 *
 * SQL DERIVES the verdict, the dimension scores and every signal's status; the edge tool
 * constrains the model to these same words through a `z.enum`; the client only formats them.
 * That is three consumers of one fact, which is exactly the shape the mirror system exists for
 * (CLAUDE.md — "a closed value-set that BOTH runtimes need is declared ONCE and mirrored").
 *
 * IMPORT-FREE ON PURPOSE. `npm run vocab:mirror` copies this file byte-for-byte to
 * `supabase/functions/_shared/assessmentVocabulary.generated.ts`; Vite resolves `@/` and Deno
 * resolves by URL, so a single import here makes the copy unbuildable on the other side.
 *
 * The DB CHECK constraints on `project_assessments` / `project_assessment_actions` are the
 * enforcer. Widen a set here without widening the constraint and the write fails with a raw
 * 23514; narrow it and a stored row renders as nothing.
 *
 * NOTE ON WEIGHTS. The severity→penalty weights are deliberately NOT here. They live in
 * `score_project_assessment()` alone, because a score is a derived number and this platform has
 * one rule about those: SQL derives, TypeScript formats. A second copy of the weights would be a
 * second derivation of the same quantity — the shape that let a fully-paid order show an
 * outstanding balance.
 */

/** What the assessment looks at. A signal belongs to exactly one dimension. */
export const ASSESSMENT_DIMENSIONS = [
  'setup',
  'commercial',
  'financial',
  'schedule',
  'delivery',
  'client',
] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export const ASSESSMENT_DIMENSION_LABELS: Record<AssessmentDimension, string> = {
  setup: 'Setup & alignment',
  commercial: 'Commercial',
  financial: 'Financial',
  schedule: 'Schedule',
  delivery: 'Delivery',
  client: 'Client',
};

/** One line each — what the dimension is actually judging, for the tile subtitle. */
export const ASSESSMENT_DIMENSION_BLURBS: Record<AssessmentDimension, string> = {
  setup: 'Whether the project is described well enough to be run at all.',
  commercial: 'Quotes, contracts and whether the work is under an agreement.',
  financial: 'Budget, margin, cash tied up and money owed.',
  schedule: 'Deadline, task dates and whether anything is moving.',
  delivery: 'Snags, purchase items and what site work is outstanding.',
  client: 'Requests waiting on you, approvals and what the client can see.',
};

/**
 * How badly a signal in `attention` reflects on the project.
 *
 * `info` never penalises the score — it is for a fact worth stating that is not a problem
 * (a mixed-currency P&L was `info` before it became its own `medium` signal).
 */
export const SIGNAL_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

/**
 * A signal is a VALUE or a stated REASON there is no value — never a hidden row, never a 0
 * (CLAUDE.md anti-regression rule 3). These four are that rule as a vocabulary:
 *
 *  - `ok`              measured, and fine.
 *  - `attention`       measured, and a problem. The only status that costs score.
 *  - `no_data`         the thing this measures has never been recorded. Carries a `reason`.
 *  - `not_applicable`  the thing cannot apply here — no rooms, module not entitled. Carries a
 *                      `reason` too, and is EXCLUDED from the denominator rather than scored as
 *                      a pass, so "we could not judge this" never reads as "this is fine".
 */
export const SIGNAL_STATUSES = ['ok', 'attention', 'no_data', 'not_applicable'] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/**
 * The overall verdict. Derived in SQL from the dimension scores plus two hard gates — never
 * written by the model, which sees the verdict as an input and explains it.
 *
 * `stalled` is a verdict rather than a signal because it is genuinely a different failure: a
 * stalled project can have no failing metric at all, just nothing happening on it for a month.
 * `not_enough_data` is the honest answer when too few dimensions could be judged — the
 * alternative is a confident "on track" earned by having recorded nothing.
 */
export const ASSESSMENT_VERDICTS = [
  'on_track',
  'at_risk',
  'off_track',
  'stalled',
  'not_enough_data',
] as const;
export type AssessmentVerdict = (typeof ASSESSMENT_VERDICTS)[number];

export const ASSESSMENT_VERDICT_LABELS: Record<AssessmentVerdict, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  stalled: 'Stalled',
  not_enough_data: 'Not enough data',
};

/**
 * Run status. `running` exists so a report that died mid-call is distinguishable from one that
 * ran clean and found nothing — pipeline convention 2, `cache_status` on every persisted result.
 */
export const ASSESSMENT_RUN_STATUSES = ['running', 'complete', 'failed'] as const;
export type AssessmentRunStatus = (typeof ASSESSMENT_RUN_STATUSES)[number];

/** What happened to a recommended action. `task_created` carries the `project_tasks.id`. */
export const ACTION_STATES = ['open', 'task_created', 'done', 'dismissed'] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const ACTION_STATE_LABELS: Record<ActionState, string> = {
  open: 'Open',
  task_created: 'On the task list',
  done: 'Done',
  dismissed: 'Dismissed',
};

/** Rough size of the action, so a reader can pick the ten-minute ones off the top. */
export const ACTION_EFFORTS = ['quick', 'moderate', 'significant'] as const;
export type ActionEffort = (typeof ACTION_EFFORTS)[number];

export const ACTION_EFFORT_LABELS: Record<ActionEffort, string> = {
  quick: 'Quick',
  moderate: 'Moderate',
  significant: 'Significant',
};

export function isAssessmentDimension(v: string): v is AssessmentDimension {
  return (ASSESSMENT_DIMENSIONS as readonly string[]).includes(v);
}
export function isAssessmentVerdict(v: string): v is AssessmentVerdict {
  return (ASSESSMENT_VERDICTS as readonly string[]).includes(v);
}
export function isSignalStatus(v: string): v is SignalStatus {
  return (SIGNAL_STATUSES as readonly string[]).includes(v);
}

/**
 * Where an action sends you — a PROJECT TAB key, resolved to `/projects/:id?tab=<key>` by the
 * card that renders it.
 *
 * Not an `appDestinations` id, and the difference is the point: those name fixed places
 * ("Profile → Modules"), and every place an action wants is inside THIS project. Naming a place
 * is linking to it either way — a card that says "check the purchase items" without a link is
 * the dead end that registry exists to close.
 *
 * Closed set, so `tests/unit/projectAssessment.test.ts` can hold it against the page's own
 * `PROJECT_TABS`. A destination the page does not render is a link to nowhere.
 */
export const ASSESSMENT_DESTINATIONS = [
  'overview',
  'rooms',
  'products',
  'plan',
  'purchases',
  'quotes',
  'billing',
  'finance',
  'sheets',
  'client-view',
  'contracts',
  'tasks',
  'site',
  'documents',
  'requests',
] as const;
export type AssessmentDestination = (typeof ASSESSMENT_DESTINATIONS)[number];

export function isAssessmentDestination(v: string): v is AssessmentDestination {
  return (ASSESSMENT_DESTINATIONS as readonly string[]).includes(v);
}
