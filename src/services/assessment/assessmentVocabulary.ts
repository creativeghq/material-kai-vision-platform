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
 * resolves by URL, so a single import here makes the copy unbuildable on the other side. That is
 * also why the destination→route RESOLVER is not here (it needs `FINANCE_BASE`) and lives in
 * `assessmentDestinations.ts` instead — this file owns the closed sets, that one owns the URLs.
 *
 * The DB CHECK constraints on `assessments` / `assessment_actions` are the enforcer. Widen a set
 * here without widening the constraint and the write fails with a raw 23514; narrow it and a
 * stored row renders as nothing.
 *
 * NOTE ON WEIGHTS. The severity→penalty weights are deliberately NOT here. They live in
 * `score_assessment()` alone, because a score is a derived number and this platform has one rule
 * about those: SQL derives, TypeScript formats. A second copy of the weights would be a second
 * derivation of the same quantity — the shape that let a fully-paid order show an outstanding
 * balance.
 */

/**
 * WHAT is being assessed. One system, three subjects — not three copies of the machinery.
 *
 *   project      a `projects.id`
 *   finance      a `workspaces.id` — the books ARE the workspace; there is no finance record
 *   real_estate  a `properties.id`
 *
 * Adding a fourth is a signal function in SQL, a branch in `assessment_signals()`, a value in two
 * CHECK constraints, and an entry in every map below.
 */
export const ASSESSMENT_SUBJECTS = ['project', 'finance', 'real_estate'] as const;
export type AssessmentSubject = (typeof ASSESSMENT_SUBJECTS)[number];

export const ASSESSMENT_SUBJECT_LABELS: Record<AssessmentSubject, string> = {
  project: 'Project',
  finance: 'Finance',
  real_estate: 'Property',
};

/** The paid module each subject's assessment is sold as. Enforced by `moduleGate` in every tool. */
export const ASSESSMENT_SUBJECT_MODULE: Record<AssessmentSubject, string> = {
  project: 'project-assessment',
  finance: 'finance-assessment',
  real_estate: 'real-estate-assessment',
};

/** `prompts.category` for each subject. There is no code fallback for any of them. */
export const ASSESSMENT_SUBJECT_PROMPT: Record<AssessmentSubject, string> = {
  project: 'project_assessment',
  finance: 'finance_assessment',
  real_estate: 'real_estate_assessment',
};

/**
 * What the assessment looks at. A signal belongs to exactly one dimension, and the six are the
 * same for every subject ON PURPOSE: one CHECK constraint, one scorer, one weight table. What
 * differs is what the words MEAN in each domain, which is why the labels below are per-subject
 * rather than generic — "Delivery" on a set of books means whether the filing actually reached
 * AADE, and calling it "Delivery" would be the kind of shared-label vagueness nobody can act on.
 */
export const ASSESSMENT_DIMENSIONS = [
  'setup',
  'commercial',
  'financial',
  'schedule',
  'delivery',
  'client',
] as const;
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];

export const ASSESSMENT_DIMENSION_LABELS:
  Record<AssessmentSubject, Record<AssessmentDimension, string>> = {
  project: {
    setup: 'Setup & alignment',
    commercial: 'Commercial',
    financial: 'Financial',
    schedule: 'Schedule',
    delivery: 'Delivery',
    client: 'Client',
  },
  finance: {
    setup: 'Configuration',
    commercial: 'Pipeline',
    financial: 'Profitability & cash',
    schedule: 'Obligations',
    delivery: 'Filing & reconciliation',
    client: 'Debtors',
  },
  real_estate: {
    setup: 'Listing completeness',
    commercial: 'Pricing & offers',
    financial: 'Returns',
    schedule: 'Dates & expiries',
    delivery: 'Condition',
    client: 'Interest & follow-up',
  },
};

/** One line each — what the dimension is actually judging, for the tile subtitle. */
export const ASSESSMENT_DIMENSION_BLURBS:
  Record<AssessmentSubject, Record<AssessmentDimension, string>> = {
  project: {
    setup: 'Whether the project is described well enough to be run at all.',
    commercial: 'Quotes, contracts and whether the work is under an agreement.',
    financial: 'Budget, margin, cash tied up and money owed.',
    schedule: 'Deadline, task dates and whether anything is moving.',
    delivery: 'Snags, purchase items and what site work is outstanding.',
    client: 'Requests waiting on you, approvals and what the client can see.',
  },
  finance: {
    setup: 'Whether the books are configured well enough to issue a correct invoice.',
    commercial: 'Work that is agreed or delivered and has no document behind it.',
    financial: 'Margin, what you are owed, what you owe, and what moved.',
    schedule: 'Bills and recurring charges with a date attached.',
    delivery: 'Whether the filing reached AADE and the bank lines were matched.',
    client: 'Who is behind on payment, and how far.',
  },
  real_estate: {
    setup: 'Whether the listing is complete enough to sell.',
    commercial: 'Price against its own history, and offers waiting on a decision.',
    financial: 'Yield, rent collected and deposits protected.',
    schedule: 'Tenancy and listing dates that are about to arrive.',
    delivery: 'Maintenance the property is waiting on.',
    client: 'Enquiries, viewings and whether anyone is being answered.',
  },
};

/**
 * How badly a signal in `attention` reflects on the subject.
 *
 * `info` never penalises the score — it is for a fact worth stating that is not a problem.
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
 *  - `not_applicable`  the thing cannot apply here — no tenancy, module not entitled. Carries a
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
 * stalled subject can have no failing metric at all, just nothing happening on it for a month.
 * `not_enough_data` is the honest answer when fewer than three dimensions could be judged — the
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

/**
 * Where an action sends you — a TAB KEY on the subject's own page, resolved to a URL by
 * `assessmentDestinations.ts`.
 *
 * Closed per subject, so `tests/unit/aiAssessment.test.ts` can hold each set against the page
 * that renders it. A destination the page does not render is a link to nowhere, and the finance
 * keys are exactly where that bites: the Orders pane is keyed `doc_orders`, not `orders` — the
 * distinction that had every stored order notification opening Finance with a blank body.
 */
export const ASSESSMENT_DESTINATIONS: Record<AssessmentSubject, readonly string[]> = {
  project: [
    'overview', 'rooms', 'products', 'plan', 'purchases', 'quotes', 'billing', 'finance',
    'sheets', 'client-view', 'contracts', 'tasks', 'site', 'documents', 'requests',
  ],
  // FINANCE_TAB values from src/modules/finance/routes.ts — the KEYS, not the labels.
  finance: [
    'dashboard', 'ar', 'ap', 'bank_feed', 'doc_orders', 'doc_invoices', 'doc_payments',
    'doc_expenses', 'reports', 'settings',
  ],
  // PropertyWorkbench tab values.
  real_estate: [
    'overview', 'media', 'inquiries', 'offers', 'viewings', 'documents', 'performance',
    'lettings', 'investment', 'transaction',
  ],
};

export function isAssessmentSubject(v: string): v is AssessmentSubject {
  return (ASSESSMENT_SUBJECTS as readonly string[]).includes(v);
}
export function isAssessmentDimension(v: string): v is AssessmentDimension {
  return (ASSESSMENT_DIMENSIONS as readonly string[]).includes(v);
}
export function isAssessmentVerdict(v: string): v is AssessmentVerdict {
  return (ASSESSMENT_VERDICTS as readonly string[]).includes(v);
}
export function isSignalStatus(v: string): v is SignalStatus {
  return (SIGNAL_STATUSES as readonly string[]).includes(v);
}
export function isAssessmentDestination(subject: AssessmentSubject, v: string): boolean {
  return ASSESSMENT_DESTINATIONS[subject].includes(v);
}
