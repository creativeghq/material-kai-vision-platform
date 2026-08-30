/**
 * What is filed is what the record says, and it is filed once (#354 HR-1…HR-14).
 *
 * The HR module has never run — all 20 tables are empty — so none of this is an incident list. It
 * is the state the first real payroll run and the first real ΕΡΓΑΝΗ filing would have met, in a
 * domain where the first attempt is a legal declaration and a bank transfer.
 *
 * `mergeUnfilledKeys` is exercised for real: `_shared/ergani/document.ts` is import-free by
 * design, so the rule "the caller may complete what we could not fill, never overwrite what we
 * did" is checked as behaviour rather than asserted about. The rest is source-level, and the SQL
 * half — the `hr_time_punches` sequence guard — lives in `pg_proc` where no repo-file test can see
 * it; it was verified against the live database with a rolled-back fixture.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { mergeUnfilledKeys } from '../../supabase/functions/_shared/ergani/document';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const ergani = read('supabase/functions/hr-api/ergani.ts');
const expansion = read('supabase/functions/hr-api/expansion.ts');
const payslip = read('supabase/functions/hr-api/payslip.ts');
const kiosk = read('supabase/functions/hr-kiosk/index.ts');
const workcard = read('supabase/functions/_shared/ergani/workcard.ts');
const careers = read('supabase/functions/hr-careers/index.ts');
const turnstile = read('supabase/functions/_shared/turnstile.ts');
const checkinCron = read('supabase/functions/hr-checkin-cron/index.ts');
const filingDialog = read('src/modules/hr/components/ErganiFilingDialog.tsx');
const payrollSection = read('src/modules/hr/components/PayrollSection.tsx');
const hrService = read('src/modules/hr/services/hrService.ts');
const selfService = read('src/modules/hr/pages/EmployeeSelfServicePage.tsx');

describe('#354 HR-1 — the caller completes a document, it does not replace one', () => {
  const built = {
    Cards: {
      Card: [{
        f_afm_ergodoti: '999999999',
        Details: { CardDetails: [{ f_afm: '111111111', f_apodoxes: 1200, f_kodikos_step: '' }] },
      }],
    },
  };

  it('an unfilled key is taken from the caller', () => {
    const supplied = {
      Cards: { Card: [{ f_afm_ergodoti: '999999999', Details: { CardDetails: [{ f_afm: '111111111', f_apodoxes: 1200, f_kodikos_step: '3512' }] } }] },
    };
    const out = mergeUnfilledKeys(built, supplied, ['f_kodikos_step']);
    expect((out.document as any).Cards.Card[0].Details.CardDetails[0].f_kodikos_step).toBe('3512');
    expect(out.applied).toEqual(['f_kodikos_step']);
    expect(out.ignored).toEqual([]);
  });

  it('a FILLED key is not — this is the finding', () => {
    // Alice's employee_id with Bob's ΑΦΜ and €2,400: the audit row said Alice, ΕΡΓΑΝΗ got Bob.
    const supplied = {
      Cards: { Card: [{ f_afm_ergodoti: '999999999', Details: { CardDetails: [{ f_afm: '222222222', f_apodoxes: 2400, f_kodikos_step: '3512' }] } }] },
    };
    const out = mergeUnfilledKeys(built, supplied, ['f_kodikos_step']);
    const row = (out.document as any).Cards.Card[0].Details.CardDetails[0];
    expect(row.f_afm).toBe('111111111');
    expect(row.f_apodoxes).toBe(1200);
    expect(out.ignored.sort()).toEqual(['f_afm', 'f_apodoxes']);
  });

  it('the caller cannot add rows, keys or structure', () => {
    const supplied = {
      Cards: {
        Card: [
          { f_afm_ergodoti: '999999999', Details: { CardDetails: [{ f_afm: '111111111', f_apodoxes: 1200, f_kodikos_step: '3512', f_smuggled: 'x' }, { f_afm: '333333333' }] } },
          { f_afm_ergodoti: '000000000' },
        ],
      },
    };
    const out = mergeUnfilledKeys(built, supplied, ['f_kodikos_step']);
    const doc = out.document as any;
    expect(doc.Cards.Card).toHaveLength(1);
    expect(doc.Cards.Card[0].Details.CardDetails).toHaveLength(1);
    expect(doc.Cards.Card[0].Details.CardDetails[0].f_smuggled).toBeUndefined();
  });

  it('the route always rebuilds from the loaded record', () => {
    const fn = ergani.slice(ergani.indexOf('async function fileDocument'), ergani.indexOf('const SEPARATION_CODES'));
    expect(fn).toMatch(/const built = buildErganiDocument\(template, spec\.header, spec\.rows\);/);
    expect(fn).toMatch(/mergeUnfilledKeys\(built\.document, supplied, unfilled\)/);
    expect(fn, 'a supplied document bypasses the builder again')
      .not.toMatch(/if \(document === undefined \|\| document === null\) \{\s*let template/);
  });
});

describe('#354 HR-2/HR-3 — filed once, and recorded', () => {
  it('every typed filing route asks whether it was already filed', () => {
    for (const [route, call] of [
      ["case 'ergani-submit-leave'", "assertNotAlreadyFiled(ctx, code, 'absence', absenceId)"],
      ["case 'ergani-submit-hire'", "assertNotAlreadyFiled(ctx, 'E3', 'employee', employeeId)"],
      ["case 'ergani-submit-separation'", "assertNotAlreadyFiled(ctx, code, 'separation', separationId)"],
      ["case 'ergani-submit-overtime'", "assertNotAlreadyFiled(ctx, 'E8', 'overtime', id)"],
      ["case 'ergani-submit-schedule'", "assertNotAlreadyFiled(ctx, code, 'schedule', scheduleId)"],
    ] as const) {
      const start = ergani.indexOf(route);
      expect(start, route).toBeGreaterThan(-1);
      expect(ergani.slice(start, start + 4000), route).toContain(call);
    }
  });

  it('the guard reads the audit row, not the local status column', () => {
    // The status column is written AFTER the ministry accepts, and that write can fail — which is
    // exactly the case the guard has to survive.
    const fn = ergani.slice(ergani.indexOf('async function assertNotAlreadyFiled'), ergani.indexOf('async function stampAfterFiling'));
    expect(fn).toMatch(/from\('hr_ergani_submissions'\)/);
    expect(fn).toMatch(/\.eq\('status', 'submitted'\)/);
    expect(fn).toMatch(/HttpError\(\s*409,/);
  });

  it('no post-filing local write is left unchecked', () => {
    // Each of these used to be a bare `await supabase.from(...).update(...)` after a successful
    // filing; a failure returned `{ ok: true }` with the row still reading draft.
    const stamped = [...ergani.matchAll(/stampAfterFiling\(ctx, [^,]+, '([^']+)'/g)].map((m) => m[1]);
    for (const target of [
      'hr_absences.ergani_leave_code', 'hr_separations.status', 'hr_employees.status',
      'hr_overtime.status', 'hr_work_schedules.status', 'hr_ergani_submissions.status',
    ]) {
      expect(stamped, target).toContain(target);
    }
    expect(ergani, 'a filing route reports a bare ok again')
      .not.toMatch(/if \(out\.kind === 'preview'\) return out\.response;\n\s*return json\(\{ ok: true, result: out\.result \}\);/);
  });

  it('a filing whose bookkeeping failed is reported as such', () => {
    expect(ergani).toMatch(/local_write_failed: true/);
    expect(raw('supabase/functions/hr-api/ergani.ts')).toMatch(/The filing DID reach Ergani/);
    // …and the operator is told, rather than seeing a clean success toast.
    expect(filingDialog).toMatch(/Filed to Ergani — but not fully recorded/);
  });

  it('cancel exists, because the guard tells people to use it', () => {
    expect(ergani).toMatch(/case 'ergani-cancel':/);
    expect(ergani).toMatch(/cancelDocument\(creds, workspaceId/);
    // Releases BOTH records that block a re-file.
    expect(ergani).toMatch(/\.update\(\{ status: 'cancelled' \}\)/);
    expect(ergani).toMatch(/update\(\{ status: 'draft', ergani_protocol: null \}\)/);
  });
});

describe('#354 HR-4 — a payroll gross is prorated, and rounded last', () => {
  it('there is one derivation and both call sites use it', () => {
    expect(expansion).toMatch(/function derivePayrollBasis\(e: any, period: string\): PayrollBasis/);
    expect(expansion).toMatch(/derivePayrollBasis\(e, period\)/);
  });

  it('the employment window is read', () => {
    expect(expansion).toMatch(/function businessDaysInWindow\(period: string, from: string \| null, to: string \| null\)/);
    expect(expansion).toMatch(/businessDaysInWindow\(period, e\.start_date \?\? null, e\.end_date \?\? null\)/);
    expect(expansion).toMatch(/start_date, end_date/);
  });

  it('hours are not rounded before they are multiplied', () => {
    expect(expansion, 'the per-day rounding is back')
      .not.toMatch(/round2\(Number\(e\.weekly_hours\) \/ 5\)/);
    expect(expansion).toMatch(/const hoursPerDay = e\.weekly_hours \? Number\(e\.weekly_hours\) \/ 5 : 8;/);
    expect(expansion).toMatch(/round2\(rate \* hoursPerDay \* daysWorked\)/);
  });

  it('a full month is the salary itself, not a ratio of it', () => {
    expect(expansion).toMatch(/daysWorked < monthDays\)\s*\n?\s*\? round2\(rate \* daysWorked \/ monthDays\)/);
  });

  it('an employee who worked no day of the period gets no line', () => {
    expect(expansion).toMatch(/\.filter\(\(x: \{ e: any; d: PayrollBasis \}\) => x\.d\.daysWorked > 0\)/);
  });
});

describe('#354 HR-5 — an approved or paid run is not rewritten', () => {
  it('a line can only be edited while the run is a draft', () => {
    const fn = expansion.slice(expansion.indexOf("case 'update-payroll-item'"), expansion.indexOf("case 'generate-payslips'"));
    expect(fn).toMatch(/runStatus !== 'draft'/);
    expect(fn).toMatch(/Re-open it as a draft before changing a line/);
  });

  it('paid is terminal, and a posted run cannot be re-opened', () => {
    const fn = expansion.slice(expansion.indexOf("case 'set-payroll-status'"), expansion.indexOf("case 'post-payroll-to-finance'"));
    expect(fn).toMatch(/currentRun\.status === 'paid' && status !== 'paid'/);
    expect(fn).toMatch(/status === 'draft' && currentRun\.posted_finance_ref/);
  });

  it("payslips for a paid run are not regenerated over the employee's copy", () => {
    expect(payslip).toMatch(/run\.status === 'paid'/);
    expect(payslip).toMatch(/were already issued and this run is marked paid/);
  });
});

describe('#354 HR-6/HR-7/HR-9 — the clock', () => {
  it('the kiosk always requires a PIN', () => {
    expect(kiosk).toMatch(/const requirePin = true;/);
    expect(kiosk, 'the setting can switch the only authenticator off again')
      .not.toMatch(/const requirePin = !!settings\?\.kiosk_require_pin;/);
    // An employee with no PIN cannot fall through to ΑΦΜ-only.
    expect(kiosk).toMatch(/pin_not_set/);
  });

  it('the punch sequence is enforced before anything is written', () => {
    const fn = workcard.slice(workcard.indexOf('export async function fileWorkcardPunch'));
    expect(fn).toMatch(/There is no arrival to clock out from/);
    expect(fn).toMatch(/You are already clocked in/);
    expect(fn).toMatch(/earlier than the last one recorded/);
    const guard = fn.indexOf('You are already clocked in');
    const insert = fn.indexOf('const insertPunch');
    expect(guard).toBeLessThan(insert);
  });

  it('"am I clocked in" is the last punch, not today\'s', () => {
    const fn = kiosk.slice(kiosk.indexOf('async function currentlyIn'), kiosk.indexOf('Deno.serve('));
    expect(fn, 'the read is scoped to a calendar day again').not.toMatch(/reference_date/);
    expect(workcard, 'the shared writer scopes its state read to a day')
      .not.toMatch(/\.eq\('reference_date', referenceDate\)\s*\n?\s*\.order\('punched_at'/);
    // The attendance board reaches back a day for the same reason.
    expect(expansion).toMatch(/\.gte\('reference_date', yesterday\)/);
  });
});

describe('#354 HR-8 — one click is one filing', () => {
  it('the ERGANI dialog latches synchronously', () => {
    const fn = filingDialog.slice(filingDialog.indexOf('const file = async'));
    const latch = fn.indexOf('if (filingRef.current) return;');
    expect(latch).toBeGreaterThan(-1);
    expect(latch).toBeLessThan(fn.indexOf('await submit('));
  });

  it('so does every payroll side effect', () => {
    expect(payrollSection).toMatch(/const actingRef = useRef\(false\);/);
    const claims = payrollSection.match(/if \(!claim\(\)\) return;/g) ?? [];
    expect(claims.length).toBeGreaterThanOrEqual(3); // status change, finance posting, payslips
    expect(payrollSection).toMatch(/if \(savingRef\.current\) return;/);
  });
});

describe('#354 HR-10/HR-11/HR-12/HR-13 — a failed read is not a small number', () => {
  it('a leave balance that could not be read is not the full allowance', () => {
    const fn = hrService.slice(hrService.indexOf('async listEmployees'), hrService.indexOf('createEmployee('));
    expect(fn).toMatch(/error: sumErr/);
    expect(fn).toMatch(/if \(sumErr\) throw sumErr;/);
  });

  it('the late-alert cron establishes lateness before charging for it', () => {
    const loop = checkinCron.slice(checkinCron.indexOf('for (const e of (emps ?? []))'));
    const punchRead = loop.indexOf("from('hr_time_punches')");
    const charge = loop.indexOf('chargeCronWorkspace');
    expect(punchRead).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(punchRead).toBeLessThan(charge);
    // An unreadable punch is not an absence.
    expect(loop).toMatch(/if \(arrErr\)/);
    expect(checkinCron).toMatch(/ok: true, checked, alerted, unknown/);
  });

  it('the quota IP comes from the trusted hop, in ONE place', () => {
    expect(turnstile).toMatch(/export function clientIp\(req: Request\): string \{\s*return getTrustedClientIp\(req\);\s*\}/);
    expect(turnstile, 'the leftmost, caller-controlled hop is back')
      .not.toMatch(/xff\.split\(','\)\[0\]/);
    expect(careers).toMatch(/import \{ verifyTurnstile, clientIp \} from '\.\.\/_shared\/turnstile\.ts';/);
    expect(careers, 'a local spoofable clientIp is back').not.toMatch(/function clientIp\(req: Request\)/);
    // …and a cap that holds even if the IP is a lie.
    expect(careers).toMatch(/CAREERS_MAX_PER_WORKSPACE_WINDOW/);
  });

  it('self-service says "unknown" rather than "clocked out"', () => {
    expect(selfService).toMatch(/useState<boolean \| null>/);
    expect(selfService).toMatch(/clocked_in: null as boolean \| null/);
    expect(selfService).toMatch(/your clock state is unknown/);
    expect(selfService, 'a failed read renders a Clock-in button again')
      .not.toMatch(/catch\(\(\) => \(\{ punches: \[\] as SelfPunch\[\], clocked_in: false \}\)\)/);
  });
});

describe('#354 HR-14 — the source tree holds source', () => {
  it('the 6.6MB ΕΡΓΑΝΗ guide is not in src/', () => {
    expect(existsSync(join(ROOT, 'src/modules/hr/Eniaios odigos orariou kartas ergasias 01 01 2024.pdf'))).toBe(false);
    expect(existsSync(join(ROOT, 'docs/ergani-work-card-guide-2024.pdf'))).toBe(true);
  });
});

/**
 * Posting a payroll run to Finance — 2026-08-30.
 *
 * `post-payroll-to-finance` inserts one planned payment per employee's net wages, plus one for
 * income tax and one for EFKA, and only THEN stamps `hr_payroll_runs.posted_finance_ref`. Each
 * insert is a separate call over the wire, so if any one fails — or the connection drops before the
 * stamp — the payments exist and the stamp does not. The guard was
 *
 *     if (run.posted_finance_ref) return 409 'already posted'
 *
 * reading the very column that can be missing. The operator is holding an error for a posting that
 * partly happened and the screen offers one thing: Post again. That schedules a second payment for
 * every employee's salary, a second ΦΜΥ remittance and a second EFKA remittance.
 *
 * CLAUDE.md rule 4, the clause this file already asserts elsewhere: a duplicate guard reads the
 * record written on the SUCCESS path, never a status column written after it. Here the success-path
 * record is the payments — and nothing connected them to the run, the only link being the period
 * interpolated into `title`. `planned_payments.payroll_run_id` is that link (the third of its kind
 * next to `supplier_bill_id` and `invoice_id`), which is also what makes "Reverse the posting
 * before re-opening it" — an error this same file raises one screen earlier — mean anything.
 *
 * Separately: the posting recorded `totals.net` from `run.total_net`, a CACHED column maintained by
 * two other actions, while the three figures beside it were summed from the rows that actually
 * produced the payments. It also counts lines this loop skips (`net <= 0`). So the audit record of
 * a posting could disagree with the payments it describes. One derivation per money quantity.
 */
describe('posting payroll to Finance cannot pay everyone twice', () => {
  /**
   * The handler body, bounded by the next `case` rather than a fixed character count. A magic
   * window is its own bug: the first version of this used 4000 chars and silently excluded the
   * EFKA insert, so "every payment is linked" was asserted over two of the three.
   */
  const handler = (() => {
    const i = expansion.indexOf("case 'post-payroll-to-finance'");
    if (i < 0) return '';
    const rest = expansion.slice(i + 10);
    const nextCase = rest.search(/\n\s{4}case '/);
    return nextCase < 0 ? expansion.slice(i) : expansion.slice(i, i + 10 + nextCase);
  })();

  it('is pointed at the real handler', () => {
    expect(handler, 'the posting handler is gone').not.toBe('');
    expect(handler, 'the net-wage payments are what this guards').toContain('planned_payments');
    // The bound must actually contain the whole handler — all three inserts.
    expect((handler.match(/planned_payments'\)/g) ?? []).length,
      'the handler slice does not cover all four planned_payments references (1 check + 3 inserts)')
      .toBeGreaterThanOrEqual(4);
  });

  it('asks the PAYMENTS whether this run was already posted, not the stamp written after them', () => {
    expect(handler, 'the success-path check is gone — a retry after a partial posting doubles every salary')
      .toMatch(/\.eq\('payroll_run_id', id\)/);
    // And it must happen BEFORE the first insert. A check after the side effect is not a check.
    const guardAt = handler.indexOf("payroll_run_id', id)");
    const firstInsert = handler.search(/planned_payments'\)[\s\S]{0,40}\.insert\(/);
    expect(firstInsert, 'no payment insert found — the slice is wrong').toBeGreaterThan(-1);
    expect(guardAt, 'the duplicate check runs after the payments are already created')
      .toBeLessThan(firstInsert);
    // And the refusal must be conditioned on the count itself — a guard that is present but
    // short-circuited reads identically to one that works.
    expect(handler, 'the 409 is no longer conditioned on payments actually existing')
      .toMatch(/if \(\(alreadyPosted \?\? 0\) > 0\)\s*\{/);
    expect(handler, 'the partial-posting refusal is gone').toMatch(/partially_posted/);
  });

  it('fails CLOSED when it cannot tell', () => {
    // An unanswerable count is not zero — that reading is what would schedule the salaries twice.
    //
    // Asserted as the CONDITION, not the presence of the identifier: `if (false) { throw ... }`
    // keeps every token this used to look for while the branch can never fire, and that is the
    // shape a disabled guard actually takes.
    expect(handler, 'the refusal is no longer conditioned on the lookup having failed')
      .toMatch(/if \(postedErr\)\s*\{/);
    expect(handler, 'a failed check no longer refuses the posting').toMatch(/HttpError\(503/);
  });

  it('every payment it creates says which run created it', () => {
    // Three inserts: net wages (per employee), income tax, EFKA. All three must be linked, or the
    // guard above sees only part of a posting and lets the rest be repeated.
    const stamped = handler.match(/payroll_run_id: id/g) ?? [];
    expect(stamped.length, 'not every planned_payments insert carries payroll_run_id').toBe(3);
  });

  it('records the total it actually posted, not the cached run column', () => {
    expect(handler, 'totals.net is back to reading the cached run.total_net — a second derivation of '
      + 'a money quantity, which also counts the lines this loop skips')
      .not.toMatch(/totals:\s*\{\s*net:\s*round2\(run\.total_net\)/);
    expect(handler, 'the posted net is no longer accumulated from the rows that produced the payments')
      .toMatch(/netPosted/);
  });
});
