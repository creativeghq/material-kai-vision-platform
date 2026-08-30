/**
 * A half-finished money flow says so, and a retry does not repeat it (#351 A1/S4/C3/C1/C4 + B4/C2/D5).
 *
 * One shape produced six of this audit's findings: a create-then-stamp pair with no transaction
 * and a retryable button. The first write commits, the second fails, the UI says "Failed", and the
 * operator does the only thing the screen offers — presses it again. That bills the same hours
 * twice, cuts a second delivery note, books the cost twice, or re-issues a transmitted credit note.
 *
 * The fixes are of three kinds and this file checks the first two:
 *   - moved into ONE SQL transaction (S4 — `bill_time_entries_to_invoice` /
 *     `bill_trip_expenses_to_invoice`), or made idempotent by a token (C1);
 *   - made resumable and honest where a transaction is not the right instrument (A1, C3, C4):
 *     each leg records that it happened, the toast names the half that did not, and the retry
 *     starts where it stopped.
 *
 * The SQL half — the cumulative credit cap, the POS token, the claim-before-work stamps — lives in
 * `pg_proc`, which no repo-file test can see (the trap recorded in `docs/prevention-coverage.md`).
 * Those are asserted in `tests/integration/fiscal-derivations.test.ts`, against a real database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const pos = read('src/modules/finance/pages/PosPage.tsx');
const deliveryDialog = read('src/modules/finance/components/NewDeliveryNoteDialog.tsx');
const timeService = read('src/modules/finance/services/timeTrackingService.ts');
const tripService = read('src/modules/finance/services/tripExpenseService.ts');
const financeService = read('src/modules/finance/services/financeService.ts');
const expenseDialog = read('src/modules/finance/components/NewExpenseDialog.tsx');
const paymentActions = read('src/modules/finance/components/PaymentRowActions.tsx');
const creditDialog = read('src/modules/finance/components/NewCreditNoteDialog.tsx');
const planning = read('src/modules/finance/tabs/PlanningTab.tsx');
const parties = read('src/modules/finance/tabs/PartiesTab.tsx');

/**
 * Rewriting a project plan is ONE transaction.
 *
 * `writePlanItems` rewrote a plan as two statements over the wire — `delete().eq('plan_id', …)`
 * then `insert(rows)`. The delete commits on its own, so a failing insert left the plan with ZERO
 * items and an error message. The retry could not undo it either: reprice rebuilds the composition
 * lines from `project_plans.composition`, but the MANUAL lines it preserves come from
 * `loadPlanItems` — which by then returns nothing. A hand-built section and every task under it
 * was gone for good, reported as a write error rather than as the data loss it was.
 *
 * `public.replace_plan_items(uuid, jsonb)` does both in one transaction. Watched 2026-08-30 on a
 * seeded plan: a write whose second row violates the parent FK leaves the ORIGINAL two rows intact
 * (`[Hand-added task, Kitchen]`), where the two-statement version left zero; a good write still
 * replaces wholesale.
 *
 * The RPC is SECURITY INVOKER on purpose — RLS on `project_plan_items` is the boundary, and the
 * engine calls it with the caller's client for a JWT request.
 */
describe('#285 — rewriting a project plan is one transaction', () => {
  const engine = read('supabase/functions/project-plan-engine/index.ts');

  it('writes through the atomic RPC', () => {
    expect(engine, 'the plan rewrite must go through replace_plan_items')
      .toMatch(/rpc\('replace_plan_items'/);
  });

  it('never deletes the plan lines as its own statement', () => {
    // The precise shape: a bare delete on project_plan_items outside the RPC is the first half of
    // the pair, and the half that commits.
    expect(engine, 'a standalone delete of the plan lines is the defect, not a step')
      .not.toMatch(/from\('project_plan_items'\)[\s\S]{0,120}\.delete\(\)/);
    expect(engine, 'nor may it insert them directly')
      .not.toMatch(/from\('project_plan_items'\)[\s\S]{0,120}\.insert\(/);
  });

  it('still sorts parents before children, because the RPC preserves the order it is given', () => {
    // `parent_id` is a self-FK checked per row on insert. The RPC deliberately does not re-sort,
    // so dropping the topological sort here would break every nested plan.
    expect(engine).toMatch(/const ordered = topoOrder\(rows\)/);
    expect(engine).toMatch(/p_rows: ordered/);
  });
});

describe('#351 C1 — a POS sale is issued once', () => {
  it('the latch is synchronous, and it is checked before anything awaits', () => {
    // `disabled={issuing}` is React state and lands a frame late; a touchscreen bounce fits
    // inside that frame, and two calls meant two receipts, two payments, two stock reductions.
    expect(pos).toMatch(/const issuingRef = useRef\(false\);/);
    const fn = pos.slice(pos.indexOf('const issue = async ()'));
    const latch = fn.indexOf('if (issuingRef.current) return;');
    const firstAwait = fn.indexOf('await');
    expect(latch).toBeGreaterThan(-1);
    expect(latch).toBeLessThan(firstAwait);
    expect(fn).toMatch(/finally \{ issuingRef\.current = false;/);
  });

  it('and the register mints a per-basket token the RPC can dedupe on', () => {
    // The latch cannot close a RETRY: a connection dropped after the transaction committed shows
    // an error for a receipt that exists, and pressing the button again is the natural act.
    expect(pos).toMatch(/const \[saleToken, setSaleToken\] = useState\(\(\) => crypto\.randomUUID\(\)\)/);
    expect(pos).toMatch(/p_client_token: saleToken,/);
    // Per BASKET, not per register — otherwise the next customer's identical sale is swallowed.
    const reset = pos.slice(pos.indexOf('const resetSale = ()'), pos.indexOf('const finalizeSale'));
    expect(reset).toMatch(/setSaleToken\(crypto\.randomUUID\(\)\)/);
  });
});

describe('#351 C4 — a delivery note that saved but did not issue says so', () => {
  it('the draft is reported, not swallowed by a generic Failed', () => {
    expect(deliveryDialog).toMatch(/Saved as a draft — NOT issued/);
    expect(deliveryDialog).toMatch(/issue it from there once the problem is fixed/);
  });

  it('and the form closes instead of re-arming to create a second header', () => {
    const submit = deliveryDialog.slice(deliveryDialog.indexOf('const submit = async'));
    const issueCatch = submit.indexOf('catch (issErr');
    expect(issueCatch).toBeGreaterThan(-1);
    const branch = submit.slice(issueCatch, issueCatch + 900);
    expect(branch).toMatch(/onCreated\(\);/);
    expect(branch).toMatch(/onOpenChange\(false\);/);
    expect(branch).toMatch(/return;/);
  });
});

describe('#351 S4/S2/S3 — billing logged work is one transaction', () => {
  it('time entries go through the RPC, and nothing writes an invoice here any more', () => {
    const fn = timeService.slice(timeService.indexOf('async billToInvoice'), timeService.indexOf('async report('));
    expect(fn).toMatch(/supabase\.rpc\('bill_time_entries_to_invoice'/);
    expect(fn, 'the invoice header is written from the client again')
      .not.toMatch(/from\('invoices'\)\s*\.insert/);
    expect(fn, 'the source rows are stamped in a separate write again')
      .not.toMatch(/from\('time_entries'\)\s*\n?\s*\.update\(\{ billed_invoice_id/);
  });

  it('trip expenses do too', () => {
    const fn = tripService.slice(tripService.indexOf('async billToClient'), tripService.indexOf('async submit('));
    expect(fn).toMatch(/supabase\.rpc\('bill_trip_expenses_to_invoice'/);
    expect(fn).not.toMatch(/from\('invoices'\)\s*\.insert/);
    expect(fn).not.toMatch(/from\('trip_expense_items'\)\s*\n?\s*\.update\(\{ billed_invoice_id/);
  });

  it('the tagged failures reach the operator as sentences, not as raw plpgsql', () => {
    // `raise exception` arrives at PostgREST as a bare message. Without this the operator sees
    // `concurrent_billing: 2 of 3 entries were billed by someone else`.
    expect(timeService).toMatch(/export function billingErrorMessage/);
    for (const tag of ['attributed_to_another_customer', 'concurrent_billing', 'mixed_currency']) {
      expect(timeService, tag).toContain(tag);
    }
    expect(tripService).toMatch(/billingErrorMessage\(error\.message\)/);
    expect(timeService).toMatch(/billingErrorMessage\(error\.message\)/);
  });
});

describe('#351 C3 — an expense whose payment failed is not a failed expense', () => {
  it('the service reports the payment failure instead of rejecting the whole call', () => {
    // Rejecting is what left the form armed: the bill was committed and saving again created a
    // second bill AND a second payment for one cost.
    const fn = financeService.slice(financeService.indexOf('async createExpense'), financeService.indexOf('async setSupplierBillOrder'));
    expect(fn).toMatch(/paymentError: string \| null/);
    expect(fn).toMatch(/catch \(payErr\)/);
    expect(fn).toMatch(/return \{ billId: bill\.id, paymentId, paymentError \};/);
  });

  it('and the dialog says which half happened', () => {
    expect(expenseDialog).toMatch(/Expense recorded — payment NOT recorded/);
    expect(expenseDialog).toMatch(/do NOT save this form again or you will book the cost twice/);
    // The success wording must not survive a failed payment.
    expect(expenseDialog).toMatch(/const paidText = paidNow && !created\.paymentError;/);
  });
});

describe('#351 A1 — a return does not re-issue the credit notes it already issued', () => {
  it('each leg is remembered, and a retry skips it', () => {
    expect(paymentActions).toMatch(/const doneRef = useRef<\{ credited: Set<string>; refunded: boolean \}>/);
    expect(paymentActions).toMatch(/if \(doneRef\.current\.credited\.has\(a\.invoice_id\)\) continue;/);
    expect(paymentActions).toMatch(/doneRef\.current\.credited\.add\(a\.invoice_id\);/);
    expect(paymentActions).toMatch(/if \(refund && !doneRef\.current\.refunded\)/);
    expect(paymentActions).toMatch(/doneRef\.current\.refunded = true;/);
  });

  it('and the operator is told where it stopped', () => {
    expect(paymentActions).toMatch(/Return stopped after \$\{doneCount\} of \$\{allocs\.length\} credit notes/);
    expect(paymentActions).toMatch(/Credit notes issued — refund NOT recorded/);
  });

  it('with a synchronous latch, because these are legal documents', () => {
    const fn = paymentActions.slice(paymentActions.indexOf('const confirm = async'));
    const latch = fn.indexOf('if (busyRef.current) return;');
    expect(latch).toBeGreaterThan(-1);
    expect(latch).toBeLessThan(fn.indexOf('await'));
  });
});

describe('#351 B4 — a credit note is offered only for what is left', () => {
  it('the defaults subtract what earlier notes already took', () => {
    // The old default was full quantity on every line, and the clamp only looked at the request
    // in front of it: credit 6 of 10, reopen, and all 10 are offered again.
    expect(creditDialog).toMatch(/credit_note_items/);
    expect(creditDialog).toMatch(/const left = round2\(Math\.max\(0, Number\(r\.quantity\) - \(already\[r\.id\] \?\? 0\)\)\);/);
    expect(creditDialog).toMatch(/ls\[r\.id\] = \{ include: left > 0, creditQty: String\(left\) \};/);
    expect(creditDialog, 'every line defaults to the full invoiced quantity again')
      .not.toMatch(/ls\[r\.id\] = \{ include: true, creditQty: String\(r\.quantity\) \};/);
  });

  it('a failed read of the prior notes offers nothing, rather than everything', () => {
    // "I could not read what was credited" must not resolve to "nothing was credited" — that is
    // the assumption the whole finding is about.
    expect(creditDialog).toMatch(/if \(priorErr\) throw priorErr;/);
    expect(creditDialog).toMatch(/What has already been credited is unknown, so nothing is offered/);
  });

  it('and the request is refused before a legal document is attempted', () => {
    expect(creditDialog).toMatch(/const headroom = invoice \? round2\(Math\.max\(0, Number\(invoice\.total\) - creditedTotal\)\) : 0;/);
    expect(creditDialog).toMatch(/effectiveTotal > headroom/);
    expect(creditDialog).toMatch(/More than this invoice has left to credit/);
  });

  it('the cap reads the platform derivation, and does not re-sum the notes', () => {
    // `invoices.amount_credited` is the one derivation of "how much of this invoice is credited"
    // (CLAUDE.md rule 1). A second sum here would be a sixth implementation of a money quantity.
    expect(creditDialog).toMatch(/amount_credited/);
  });
});

describe('#351 C2 — an expense attaches to one order, by either link', () => {
  it('unlinkedOnly excludes both order columns', () => {
    expect(financeService).toMatch(/if \(opts\.unlinkedOnly\) q = q\.is\('order_id', null\)\.is\('covers_order_id', null\);/);
  });
});

describe('#351 D5 — a total is in a currency, or it is not a total', () => {
  it('planned payments total per currency', () => {
    expect(planning).toMatch(/const byCurrency = new Map<string, \{ inSum: number; outSum: number \}>/);
    expect(planning, 'the three tiles sum every row into one number again')
      .not.toMatch(/return \{ inSum, outSum, net: inSum - outSum \};/);
    expect(planning).toMatch(/formatMoney\(t\.inSum, t\.currency\)/);
    expect(planning).toMatch(/formatMoney\(t\.outSum, t\.currency\)/);
    expect(planning).toMatch(/formatMoney\(t\.net, t\.currency\)/);
  });

  it('the party ledger withholds a cross-currency balance instead of printing one', () => {
    expect(parties).toMatch(/const mixedCurrency = ledgerCurrencies\.length > 1;/);
    expect(parties).toMatch(/const md = \(n: number\) => \(mixedCurrency \? '—' : formatMoney\(n, ledgerCurrency\)\);/);
    // Each row still prints in its OWN currency, which it always should have.
    expect(parties).toMatch(/mr\(Number\(r\.debit\), r\.currency\)/);
    expect(parties).toMatch(/mr\(Number\(r\.credit\), r\.currency\)/);
  });

  it('and the Kartela is refused rather than issued with a wrong balance', () => {
    // This is the one artefact that leaves the building and is handed to the counterparty.
    expect(parties).toMatch(/This ledger spans more than one currency/);
    const print = parties.slice(parties.indexOf('const esc = escapeHtml'));
    expect(parties.indexOf('if (mixedCurrency) {')).toBeLessThan(parties.indexOf('const esc = escapeHtml'));
    expect(print.slice(0, 400)).not.toMatch(/mixedCurrency/);
  });
});
