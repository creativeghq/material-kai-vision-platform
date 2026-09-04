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
    // String literals are stripped as well as comments before the word match. The words are a
    // proxy for machinery, and once `issueInvoice` gained an operator-facing message explaining
    // that AADE rejects an invoice to a consumer, matching raw text convicted a SENTENCE — which
    // is the guard failing on the thing it exists to permit. What must not appear is fiscal work.
    const operations = code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
    expect(operations).not.toMatch(/fiscal|mydata|aade/i);
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

  it('shows the retention position and its releases', () => {
    // Retention was accrued but never let go before this: the money sat withheld for ever on
    // screen. `expected_amount` is derived per tranche because the held figure grows with every
    // valuation, so a stored expectation goes stale silently.
    expect(CARD).toContain('retention.outstanding');
    expect(CARD).toContain('t.expected_amount');
    expect(CARD).toContain('releaseTranche');
  });

  it('takes the held figure from the retention derivation, not a second read', () => {
    // `get_project_retention` reads the same cumulative retention `get_project_applications`
    // derives AND knows what has been released, so preferring it keeps one answer on screen.
    expect(CARD).toContain('retention ? n(retention.held)');
  });

  it('dates a new application on the operator local day', () => {
    expect(CARD).toContain('todayLocalISO()');
    expect(CARD).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });
});

/**
 * Issuing an invoice from a valuation.
 *
 * The question this settles had been sitting open as "is a Greek progress valuation a fiscal
 * document, and when?" — and the codebase had already answered it for orders:
 * `generate_invoice_from_order` says an order "is a commercial document and declares nothing", and
 * generating the invoice "is the step that turns the rate into a fiscal claim". An application is
 * the same kind of thing, so no status transition mints a document; somebody issues one.
 *
 * Two rules, both silent when broken:
 *
 *  - It is ONE call. The invoice takes a fiscal NUMBER the moment it exists, so a second press
 *    after a dropped connection takes a second number for one valuation — and unpicking a
 *    transmitted document costs a credit note, not a delete.
 *  - The amount is READ from the derivation. An application is cumulative: invoicing the gross
 *    claim instead of the movement bills the whole job again every month, and both figures are
 *    valid numbers.
 */
describe('a valuation becomes an invoice by an explicit act', () => {
  it('goes through the RPC that creates and stamps together', () => {
    const code = stripComments(SERVICE);
    const fn = code.slice(code.indexOf('async issueInvoice('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain("rpc('issue_invoice_from_application'");
    // A client-side invoice insert followed by an update of the application is the exact
    // create-then-stamp pair, and here the first half mints a fiscal number.
    expect(body).not.toMatch(/from\('invoices'\)/);
    expect(body).not.toMatch(/invoice_id:/);
  });

  it('never computes the amount to invoice', () => {
    // `net_due` is derived by get_project_applications. A subtraction here would be a second
    // implementation of the cumulative rule, and the two would disagree the month a certification
    // is revised.
    const code = stripComments(SERVICE);
    const fn = code.slice(code.indexOf('async issueInvoice('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).not.toMatch(/net_due|certified_amount|gross_valuation/);
    expect(body).not.toMatch(/[-+*]\s*previously_certified/);
  });

  it('is offered only on a certified valuation that is not already invoiced', () => {
    const card = stripComments(CARD);
    expect(card).toContain("r.status === 'certified' && !r.invoice_id");
  });

  it('translates each refusal into something the operator can act on', () => {
    // A raw `application_not_certified: APP-002 is draft.` is a message about our code. Each of
    // these is a decision somebody can make.
    const code = stripComments(SERVICE);
    for (const err of [
      'application_not_certified', 'nothing_to_invoice',
      'no_client_on_project', 'invoice_requires_vat_id',
    ]) {
      expect(code, `${err} is not translated`).toContain(err);
    }
  });
});
