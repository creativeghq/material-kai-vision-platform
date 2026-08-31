/**
 * A project's labour roll-up, and the parse of it — PURE, so a test can CALL it (#378 N1).
 *
 * Separated from `timeTrackingService` for the reason `billLink.ts` was: importing the service
 * pulls in the Supabase client, which needs environment a unit test does not have, so the only
 * check left would be a source-text one — and this module's whole job is a distinction source
 * text cannot see. `actual_cost` and `variance` are NULL when nothing could be costed against
 * payroll, and the single likeliest way to break that is a `num()` where a `maybeNum()` belongs.
 * Turning an unknown into 0 makes a job look more profitable the more unpayrolled labour it
 * consumed.
 */
/** Per-user slice of a project's labor roll-up. Derived in SQL by `get_project_labor`. */
export interface ProjectLaborByUser {
  user_id: string | null;
  minutes: number;
  cost: number;
  billable_minutes: number;
  billable_cost: number;
}

/**
 * A project's labor roll-up. This is READ from `get_project_labor` — the single SQL derivation
 * of labor cost — and never recomputed here. `get_project_pnl` reads the same function, so the
 * P&L card and the labor strip can never disagree.
 */
/** One worker's estimate-vs-actual, and WHY the actual is missing when it is. */
export interface ProjectLaborWorker {
  resolved_employee_id: string | null;
  user_id: string | null;
  minutes: number;
  estimate_cost: number;
  /** null whenever `actual_status` is not 'ok' — never 0. */
  actual_cost: number | null;
  actual_status: 'ok' | 'not_on_roster' | 'no_payroll' | 'hours_unknown';
}

/**
 * The job's labour at the TYPED rate against what payroll says it actually cost (#378 N1).
 *
 * `actual_cost` and `variance` are null when nothing could be costed — not 0. A job whose workers
 * have no payroll history has an UNKNOWN actual, and rendering that as zero would make it look
 * more profitable the more unpayrolled labour it consumed. `uncosted_minutes` is how much the
 * comparison leaves out, so the reader can see the coverage rather than trust the number blind.
 */
export interface ProjectLaborPayroll {
  estimate_cost: number;
  actual_cost: number | null;
  costed_minutes: number;
  uncosted_minutes: number;
  variance: number | null;
  by_worker: ProjectLaborWorker[];
}

export interface ProjectLabor {
  total_minutes: number;
  total_cost: number;
  billable_minutes: number;
  billable_cost: number;
  billed_cost: number;
  entry_count: number;
  by_user: ProjectLaborByUser[];
  payroll: ProjectLaborPayroll;
}

/** jsonb numerics can arrive as strings; coerce at the boundary rather than at each use site. */
const num = (v: unknown): number => (v == null ? 0 : Number(v));
/** The same, but KEEPING null — for figures where absent and zero are different facts. */
const maybeNum = (v: unknown): number | null => (v == null ? null : Number(v));

export const EMPTY_PROJECT_LABOR: ProjectLabor = {
  total_minutes: 0, total_cost: 0, billable_minutes: 0, billable_cost: 0,
  billed_cost: 0, entry_count: 0, by_user: [],
  // `actual_cost`/`variance` start NULL, not 0: "no hours logged" is not "cost nothing".
  payroll: { estimate_cost: 0, actual_cost: null, costed_minutes: 0, uncosted_minutes: 0, variance: null, by_worker: [] },
};

export function parseProjectLabor(raw: any): ProjectLabor {
  if (!raw) return EMPTY_PROJECT_LABOR;
  return {
    total_minutes: num(raw.total_minutes),
    total_cost: num(raw.total_cost),
    billable_minutes: num(raw.billable_minutes),
    billable_cost: num(raw.billable_cost),
    billed_cost: num(raw.billed_cost),
    entry_count: num(raw.entry_count),
    by_user: (raw.by_user ?? []).map((u: any) => ({
      user_id: u.user_id ?? null,
      minutes: num(u.minutes),
      cost: num(u.cost),
      billable_minutes: num(u.billable_minutes),
      billable_cost: num(u.billable_cost),
    })),
    payroll: {
      estimate_cost: num(raw.payroll?.estimate_cost),
      // `maybeNum` and not `num`: SQL returns null when nothing could be costed, and coercing that
      // to 0 is precisely the silent zero the derivation goes out of its way to avoid.
      actual_cost: maybeNum(raw.payroll?.actual_cost),
      costed_minutes: num(raw.payroll?.costed_minutes),
      uncosted_minutes: num(raw.payroll?.uncosted_minutes),
      variance: maybeNum(raw.payroll?.variance),
      by_worker: (raw.payroll?.by_worker ?? []).map((w: any) => ({
        resolved_employee_id: w.resolved_employee_id ?? null,
        user_id: w.user_id ?? null,
        minutes: num(w.minutes),
        estimate_cost: num(w.estimate_cost),
        actual_cost: maybeNum(w.actual_cost),
        actual_status: w.actual_status ?? 'no_payroll',
      })),
    },
  };
}
