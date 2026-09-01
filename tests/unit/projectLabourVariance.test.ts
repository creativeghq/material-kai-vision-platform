/**
 * A job's labour actual is a VALUE or a stated reason there is none — never a zero (#378 N1).
 *
 * THE DEFECT
 * ----------
 * `get_project_labor` costs a job at `minutes / 60 * time_entries.hourly_rate` — a rate somebody
 * typed. The real cost of that hour is `hr_payroll_items.employer_cost`, which reaches Finance
 * through `post-payroll-to-finance` and never reached the job. Nothing compared them, so every
 * job's labour line was an estimate that nothing labelled as one. The roll-up also had NO reader
 * in `src/` at all: derived, typed, and consumed only by `get_project_pnl` inside SQL.
 *
 * WHY THE NULLS ARE THE POINT
 * ---------------------------
 * Payroll is monthly and a job is not, so the actual is an ALLOCATION over the workers who can be
 * costed. A worker with no payroll history contributes NULL, and the roll-up's `variance` is null
 * when nobody could be costed. Coercing either to 0 makes a job look more profitable the more
 * unpayrolled labour it consumed — the class-3 shape this codebase names: a metric is a value or a
 * stated reason there is no value, never a hidden zero.
 *
 * The SQL half is verified by calling it against the live database (rolled back), not by reading
 * it — a text check over a function definition proves the edit was written, not that it works.
 * What is pinned here is the CLIENT boundary, which is where a null gets quietly turned into 0.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The PURE module, not the service: importing the service pulls in the Supabase client, which
// needs environment a unit test does not have. Same reason `billLink.ts` exists.
import { parseProjectLabor, EMPTY_PROJECT_LABOR } from '@/modules/finance/utils/projectLabor';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

describe('the payroll comparison keeps absent and zero apart', () => {
  it('an uncosted job reports NULL, not 0', () => {
    const parsed = parseProjectLabor({
      total_minutes: 600, total_cost: 150, billable_minutes: 600, billable_cost: 150,
      billed_cost: 0, entry_count: 1, by_user: [],
      payroll: {
        estimate_cost: 150, actual_cost: null, costed_minutes: 0, uncosted_minutes: 600,
        variance: null,
        by_worker: [{ resolved_employee_id: 'e1', user_id: null, minutes: 600, estimate_cost: 150, actual_cost: null, actual_status: 'no_payroll' }],
      },
    });
    expect(parsed.payroll.actual_cost, 'an unknown actual must not become 0').toBeNull();
    expect(parsed.payroll.variance, 'a variance over nothing must not become 0').toBeNull();
    expect(parsed.payroll.uncosted_minutes).toBe(600);
    expect(parsed.payroll.by_worker[0].actual_cost).toBeNull();
  });

  it('a costed job reports the allocation and the variance', () => {
    // 10h logged at a typed 15.00 = 150; payroll says 20.00/h = 200. The job is 50 worse than
    // its own entries claim.
    const parsed = parseProjectLabor({
      total_minutes: 600, total_cost: 150, entry_count: 1, by_user: [],
      payroll: {
        estimate_cost: 150, actual_cost: 200, costed_minutes: 600, uncosted_minutes: 0, variance: 50,
        by_worker: [{ resolved_employee_id: 'e1', user_id: null, minutes: 600, estimate_cost: 150, actual_cost: 200, actual_status: 'ok' }],
      },
    });
    expect(parsed.payroll.actual_cost).toBe(200);
    expect(parsed.payroll.variance).toBe(50);
    expect(parsed.payroll.costed_minutes).toBe(600);
  });

  it('the empty roll-up starts null, because "no hours" is not "cost nothing"', () => {
    expect(EMPTY_PROJECT_LABOR.payroll.actual_cost).toBeNull();
    expect(EMPTY_PROJECT_LABOR.payroll.variance).toBeNull();
  });

  it('a missing payroll block does not fabricate one', () => {
    const parsed = parseProjectLabor({ total_minutes: 0, entry_count: 0, by_user: [] });
    expect(parsed.payroll.actual_cost).toBeNull();
    expect(parsed.payroll.variance).toBeNull();
  });
});

describe('the roll-up has a reader, and it states its coverage', () => {
  const card = read('src/modules/projects/components/ProjectLabourCard.tsx');

  it('is mounted — the derivation had no consumer in the app at all', () => {
    expect(read('src/modules/projects/components/tabs/FinanceTab.tsx')).toContain('<ProjectLabourCard');
  });

  it('renders a stated reason instead of a number it does not have', () => {
    expect(card, 'a null variance must read as not comparable').toContain('Not comparable');
    for (const reason of ['not_on_roster', 'no_payroll', 'hours_unknown']) {
      expect(card, `${reason} has no wording, so it would render blank`).toContain(reason);
    }
  });

  it('says how much of the job the comparison covers', () => {
    // A variance over two thirds of the hours is not a variance over the job.
    expect(card).toMatch(/uncosted_minutes/);
    expect(card).toMatch(/costed_minutes/);
  });
});

describe('a worker with no login can have hours', () => {
  it('the entry names an employee OR a user, never both', () => {
    // N2 made a task assignable to an `hr_employees` row with no platform login. Until
    // `time_entries.employee_id` existed, the schedule could name somebody who could never appear
    // on that job's labour cost — so any reconciliation compared two populations that did not
    // overlap. `time_entries_single_worker_ck` enforces the exclusivity in the database.
    const svc = read('src/modules/finance/services/timeTrackingService.ts');
    expect(svc, 'the create path must accept an employee').toMatch(/employee_id\?: string \| null/);
    expect(
      svc,
      'claiming a subcontractor’s hours as your own would put them in the wrong person’s "my time"',
    ).toMatch(/user_id: entry\.employee_id \? null :/);
  });

  it('a UI actually PASSES it — a service that merely accepts the field is not a writer', () => {
    /**
     * Caught in my own work while sweeping for exactly this shape. `time_entries.employee_id`
     * existed, was CHECK-constrained, was accepted by `timeTrackingService.create` and was
     * carried into the insert — and no form passed it, so the column could never hold a value.
     * That is the dead-column shape the rest of this issue is about, one layer up: the writer
     * looked present because the SERVICE had the parameter.
     *
     * The roster offered is `listTaskAssignees`, the same deduped member+employee list the task
     * picker uses, so the two surfaces cannot disagree about who exists.
     */
    const form = read('src/modules/finance/tabs/TimeBillingTab.tsx');
    expect(form, 'the log-time form must pass employee_id').toMatch(/employee_id: \w+ \|\| null/);
    expect(form, 'the roster must come from the shared assignee list').toMatch(/listTaskAssignees\(/);
  });
});
