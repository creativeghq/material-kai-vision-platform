/**
 * Applications for payment — the cumulative rule, retention, and the fiscal boundary.
 *
 * The cumulative model is the single most expensive thing on this feature to get wrong. An
 * application states work done TO DATE and the money due is the difference from what was certified
 * before it. Treating each as "this period's work" double-counts the moment anybody revises an
 * earlier valuation — and every individual number still looks reasonable while it happens, so
 * nothing raises and nobody notices until the final account.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  APPLICATION_STATUSES, APPLICATION_OPEN_STATUSES, isApplicationSettled,
} from '@/modules/projects/applicationVocabulary';

const ROOT = process.cwd();
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/applicationsService.ts'), 'utf8',
);
const CARD = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/ApplicationsCard.tsx'), 'utf8',
);

describe('application statuses', () => {
  it('mirrors project_applications_status_check', () => {
    expect(APPLICATION_STATUSES).toEqual(['draft', 'submitted', 'certified', 'paid', 'disputed']);
  });

  /**
   * The one that changes a headline figure. A certified application has been AGREED and NOT PAID,
   * and that gap is what a contractor chases. Treating certified as settled makes "outstanding"
   * read as zero on a job that is owed everything it has ever claimed.
   */
  it('counts certified as still outstanding, not settled', () => {
    expect(APPLICATION_OPEN_STATUSES).toContain('certified');
    expect(isApplicationSettled('certified')).toBe(false);
    expect(isApplicationSettled('paid')).toBe(true);
  });

  it('keeps a disputed application open', () => {
    // A disagreement is not a settlement, and dropping it would hide the applications most in
    // need of attention.
    expect(APPLICATION_OPEN_STATUSES).toContain('disputed');
    expect(isApplicationSettled('disputed')).toBe(false);
  });

  it('leaves only paid out of the open list', () => {
    const closed = APPLICATION_STATUSES.filter((s) => !APPLICATION_OPEN_STATUSES.includes(s));
    expect(closed).toEqual(['paid']);
  });
});

describe('the applications service', () => {
  it('stores the claim and the answer, and derives nothing', () => {
    // Retention, previously-certified, net due and variance all come from
    // get_project_applications. A stored net due is a cached copy of a money quantity.
    expect(SERVICE).toContain("supabase.rpc('get_project_applications'");
    expect(SERVICE).not.toMatch(/net_due\s*[:=]\s*[^;]*[-+]/);
    expect(SERVICE).not.toMatch(/retention\w*\s*=\s*.*\*/);
  });

  it('never sends a reference or the retention terms — the DB freezes both', () => {
    const create = SERVICE.slice(SERVICE.indexOf('async create('));
    const payload = create.slice(create.indexOf('.insert({'), create.indexOf('.select('));
    expect(payload).toContain('gross_valuation: input.gross_valuation');
    expect(payload).not.toMatch(/^\s*reference:/m);
    // Frozen at raise time, exactly as a plan freezes its rate tables: re-reading the live
    // percentage would silently restate every past valuation when terms are renegotiated.
    expect(payload).not.toMatch(/^\s*retention_percent:/m);
  });

  it('records the certified amount and the status in one write', () => {
    // `project_applications_certified_has_amount` refuses a certified application with no amount,
    // so two writes mean a rejected first one or a window showing a certified application that
    // nobody put a number on.
    const fn = SERVICE.slice(SERVICE.indexOf('async certify('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('certified_amount: certifiedAmount');
    expect(body).toContain("status: 'certified'");
    expect((body.match(/\.update\(/g) ?? []).length).toBe(1);
  });

  /**
   * The fiscal boundary is one nullable column and one transition, on purpose. How a Greek
   * progress valuation maps to a myDATA document is still an open question, and confining it
   * makes that answer a small change rather than a rebuild.
   */
  it('keeps the fiscal boundary to invoice_id alone', () => {
    expect(SERVICE).toContain('invoice_id');
    // No fiscal machinery has leaked into the claim. Asserted against what the code DOES — the
    // tables it touches and the functions it calls — rather than against the words in it, because
    // the header deliberately explains the myDATA boundary and a prose match would fail on that.
    const code = stripComments(SERVICE);
    expect(code).not.toMatch(/from\('invoices'\)/);
    expect(code).not.toMatch(/functions\.invoke\(/);
    expect(code).not.toMatch(/fiscal|mydata|aade/i);
  });
});

describe('the applications card', () => {
  it('shows the claim and the answer side by side', () => {
    // A single "amount" column hides the variance, which is the number worth looking at.
    expect(CARD).toContain('net_due');
    expect(CARD).toContain('certified_amount');
    expect(CARD).toContain('r.variance');
  });

  it('does not recompute the amount due', () => {
    // Cumulative arithmetic implemented twice is how the same money gets two answers.
    expect(CARD).not.toMatch(/gross_valuation\s*\)?\s*-\s*.*previously_certified/);
    expect(CARD).not.toMatch(/gross_valuation\s*\)?\s*-\s*.*retention/);
  });

  it('counts certified applications as outstanding', () => {
    expect(CARD).toContain('isApplicationSettled(r.status)');
  });

  it('says whether a claim has become a fiscal document', () => {
    // The transition is visible rather than implied, because it is the open question.
    expect(CARD).toContain('r.invoice_id');
    expect(CARD).toContain('invoiced');
  });

  it('dates a new application on the operator local day', () => {
    expect(CARD).toContain('todayLocalISO()');
    expect(CARD).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });
});
