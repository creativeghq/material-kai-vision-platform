/**
 * A supplier payout is bound to its bill, sent once, and configured for the right tenant
 * (#359 CM-19 / CM-22).
 *
 * CM-19 is two defects in one dialog, and the file's own header states the intent both of them
 * broke: *"The payment reference carries the bill number, so when the transfer executes, the
 * bank-feed matcher settles the bill automatically."*
 *
 *   1. `setBusy(true)` is React state, so a double-click enters `send()` twice before the first
 *      render — the eleventh instance of this class platform-wide, and the only one whose
 *      consequence is an IRREVERSIBLE duplicate bank transfer.
 *   2. The reference was a free-text `<Input>` and the payload was
 *      `reference || bill.supplier_bill_number` — so anything typed in the box REPLACED the bill
 *      number, and the transfer then reconciled to nothing.
 *
 * CM-22: `InvoicingPanel` and `BusinessDetailsPanel` resolved the workspace as
 * `order('created_at').limit(1)` — the user's oldest membership. For anyone in more than one
 * workspace that is arbitrary; for the platform operator (these panels sit behind AdminGuard) it
 * is the root workspace. They write invoice numbering and the business identity that goes on
 * documents.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { payoutReference, PAYOUT_REFERENCE_MAX } from '../../src/modules/banking-revolut/payoutReference';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const dialog = read('src/modules/banking-revolut/components/PayViaRevolutDialog.tsx');
const api = read('supabase/functions/revolut-api/index.ts');
const reconcile = read('supabase/functions/_shared/revolut/reconcile.ts');

describe('#359 CM-19 — the bill number cannot be typed away', () => {
  it('a note is added to the number, never substituted for it', () => {
    expect(payoutReference('INV-1042', 'deposit')).toBe('INV-1042 deposit');
    expect(payoutReference('INV-1042', '')).toBe('INV-1042');
    expect(payoutReference('INV-1042', null)).toBe('INV-1042');
  });

  it('the number goes first, so a bank that truncates truncates the note', () => {
    const long = 'x'.repeat(300);
    const out = payoutReference('INV-1042', long);
    expect(out.startsWith('INV-1042 ')).toBe(true);
    expect(out.length).toBe(PAYOUT_REFERENCE_MAX);
  });

  it('a note that already quotes the number does not get it twice', () => {
    // People type it. "INV-1042 INV-1042 deposit" is the kind of detail that makes an operator
    // distrust the field and start editing it again.
    expect(payoutReference('INV-1042', 'INV-1042 deposit')).toBe('INV-1042 deposit');
    expect(payoutReference('inv-1042', 'INV-1042 deposit')).toBe('INV-1042 deposit');
  });

  it('a bill with no number still sends the note', () => {
    expect(payoutReference(null, 'deposit')).toBe('deposit');
    expect(payoutReference('', '')).toBe('');
  });

  it('the dialog composes rather than falling back', () => {
    expect(dialog).toMatch(/reference: payoutReference\(bill\.supplier_bill_number, reference\)/);
    expect(dialog, 'the note replaces the bill number again')
      .not.toMatch(/reference \|\| bill\.supplier_bill_number/);
  });

  it('the screen shows what will actually be sent', () => {
    // The operator edited the reference because the box invited it. Showing the composed string
    // is what makes the rule visible instead of surprising.
    expect(dialog).toMatch(/Sent as <span className="font-mono">\{payoutReference\(/);
  });
});

describe('#359 CM-19 — the payout is bound to the bill, not to a string', () => {
  it('the dialog sends the bill id', () => {
    expect(dialog).toMatch(/supplier_bill_id: bill\.id/);
  });

  it('the server tenancy-checks that id before storing it', () => {
    // An id out of a request body landing in a foreign key is invariant 1's exact shape: a payout
    // pointing at another workspace's bill would settle it from the feed. 404, not 403.
    // Anchored FORWARD: `case 'create-counterparty'` sits BEFORE this one in the file, so slicing
    // to its first occurrence produced an empty string — a slice that silently asserts nothing.
    const start = api.indexOf("case 'send-payment'");
    expect(start).toBeGreaterThan(-1);
    const send = api.slice(start, api.indexOf("case '", start + 20));
    expect(send.length).toBeGreaterThan(500);
    expect(send).toMatch(/from\('supplier_bills'\)[\s\S]{0,300}\.eq\('workspace_id', workspaceId\)/);
    expect(send).toMatch(/throw new HttpError\(404, 'not found'\)/);
    expect(send).toMatch(/supplier_bill_id: supplierBillId/);
  });

  it('reconciliation prefers the link over the text', () => {
    // Re-deriving the bill from the reference is guessing at something we recorded when we
    // instructed the payment.
    const outgoing = reconcile.slice(
      reconcile.indexOf('export async function reconcileOutgoingRevolut'),
      reconcile.indexOf('export async function reconcileWorkspaceRevolut'),
    );
    expect(outgoing).toMatch(/from\('revolut_payouts'\)/);
    expect(outgoing).toMatch(/\.eq\('provider_id', String\(tx\.transaction_id/);
    const linked = outgoing.indexOf('linkedBillId');
    // `referenceQuotes` since #359 CM-16 — the bare `refText.includes` substring match is gone.
    const textMatch = outgoing.indexOf('referenceQuotes(');
    expect(linked).toBeGreaterThan(-1);
    expect(textMatch).toBeGreaterThan(-1);
    expect(linked < textMatch, 'the text match runs before the recorded link').toBe(true);
  });

  it('the text ladder still exists for payments we did not instruct', () => {
    // Rent, payroll, a transfer somebody made in the Revolut app — those have no payout row.
    const outgoing = reconcile.slice(
      reconcile.indexOf('export async function reconcileOutgoingRevolut'),
      reconcile.indexOf('export async function reconcileWorkspaceRevolut'),
    );
    expect(outgoing).toMatch(/if \(!bill\) \{/);
    expect(outgoing).toMatch(/byAmountName/);
  });
});

describe('#359 CM-19 — one click is one transfer', () => {
  it('the dialog latches on a ref, not on React state', () => {
    expect(dialog).toMatch(/const sending = useRef\(false\)/);
    expect(dialog).toMatch(/if \(!bill \|\| sending\.current\) return;/);
    expect(dialog).toMatch(/sending\.current = true;/);
    expect(dialog).toMatch(/sending\.current = false;/);
  });

  it('it also carries a stable idempotency key, because a retry is legitimate', () => {
    // The latch stops a double-click. It does not stop a retry after a network error, and both
    // must resolve to ONE transfer.
    expect(dialog).toMatch(/const requestId = useRef\(crypto\.randomUUID\(\)\)/);
    expect(dialog).toMatch(/request_id: requestId\.current/);
  });

  it('the server reuses the caller key instead of minting a fresh one', () => {
    // `request_id = crypto.randomUUID()` per call is the opposite of an idempotency key: two
    // clicks produced two ids and Revolut executed both.
    expect(api).toMatch(/const requestId = clientRequestId \?\? crypto\.randomUUID\(\)/);
    expect(api).toMatch(/\[0-9a-f\]\{8\}-/);   // validated as a uuid before it reaches the provider
  });

  it('a repeat of the same instruction answers instead of paying again', () => {
    const send = api.slice(api.indexOf("case 'send-payment'"));
    expect(send).toMatch(/\.eq\('request_id', requestId\)/);
    expect(send).toMatch(/duplicate: true/);
    const dupCheck = send.indexOf('duplicate: true');
    const insert = send.indexOf("from('revolut_payouts').insert");
    expect(dupCheck).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(dupCheck < insert, 'the audit row is written before the duplicate check').toBe(true);
  });
});

describe('#359 CM-22 — the panels configure the workspace you are looking at', () => {
  for (const rel of [
    'src/modules/payments/components/InvoicingPanel.tsx',
    'src/modules/payments/components/BusinessDetailsPanel.tsx',
  ]) {
    it(`${rel.split('/').pop()} reads the active workspace`, () => {
      const src = read(rel);
      expect(src).toMatch(/const \{ activeWorkspaceId \} = useWorkspace\(\)/);
      expect(src).toMatch(/const wsId = activeWorkspaceId;/);
      // The oldest membership is arbitrary for anyone in more than one workspace, and for the
      // platform operator it is the root workspace.
      expect(src, 'the first-membership lookup is back').not.toMatch(
        /from\('workspace_members'\)[\s\S]{0,200}order\('created_at'/,
      );
    });

    it(`${rel.split('/').pop()} reloads when the workspace changes`, () => {
      const src = read(rel);
      expect(src).toMatch(/\}, \[[^\]]*activeWorkspaceId[^\]]*\]\);/);
    });
  }
});

/**
 * The bulk bill run — 2026-08-30.
 *
 * #359 CM-19 established `revolut_payouts.supplier_bill_id` as THE binding: `reconcileOutgoingRevolut`
 * reads it first and only falls back to matching the reference TEXT when it is absent, which CM-19
 * calls "guessing at something we recorded". Three instruction paths set it — the dialog's
 * `send-payment`, `confirm-bill-match`, and the reconciler itself.
 *
 * `pay-due-bills` did not. That is the BULK path — the one whose whole purpose is paying many bills
 * at once — so the payments most likely to need reliable reconciliation were exactly the ones
 * reconciling by guess.
 *
 * With no link, nothing could answer "does this bill already have a payment out", either. A second
 * run drafts the same bills again: a double-click, or a retry after the draft call timed out with
 * the draft already created at Revolut. One approval in the Revolut app then executes an entire
 * duplicate run. The approval step is what makes that survivable, not what makes it safe — a bill
 * run exists so that one approval covers many payments, so "there are two of them" is precisely
 * what an approver is least likely to notice.
 *
 * KNOWN GAP, stated rather than papered over: the reconciler finds a payout by
 * `provider_id = tx.transaction_id`, and a bulk run stores the DRAFT id there, because Revolut
 * returns one draft rather than a payment id per bill. So the link now recorded is correct and
 * usable by the duplicate guard, but the feed-side lookup still cannot use it for bill-run
 * payments. Closing that needs the executed payments' own ids, which arrive on a different event.
 */
describe('#359 CM-19 — the bulk bill run binds and does not double-draft', () => {
  const run = (() => {
    const i = api.indexOf("case 'pay-due-bills'");
    if (i < 0) return '';
    const rest = api.slice(i + 10);
    const next = rest.search(/\n\s{4}case '/);
    return next < 0 ? api.slice(i) : api.slice(i, i + 10 + next);
  })();

  it('is pointed at the real handler', () => {
    expect(run, 'the bill-run handler is gone').not.toBe('');
    expect(run).toContain('revolut_payouts');
    expect(run, 'the handler slice does not reach the draft call').toContain('createPaymentDraft');
  });

  it('records which bill each drafted payment pays', () => {
    expect(run, 'the bulk run stopped recording supplier_bill_id, so its payments reconcile by '
      + 'guessing at the reference text — the thing CM-19 exists to stop')
      .toMatch(/supplier_bill_id: bill\.id/);
  });

  it('skips a bill that already has a payment out', () => {
    // Asserted as the CONDITION and the SKIP, not as the presence of the identifier: a guard
    // short-circuited to `if (false)` keeps every name intact while never firing, and that is the
    // shape a disabled guard actually takes.
    expect(run, 'nothing stops a second run drafting the same bills — one approval then pays '
      + 'every supplier twice').toMatch(/if \(alreadyOut\.has\(String\(bill\.id\)\)\)\s*\{/);
    expect(run, 'the skipped bill is no longer reported back to the operator')
      .toMatch(/already drafted or sent/);
    // Keyed on the recorded link, not on parsing the reference string back out.
    expect(run, 'the duplicate check no longer reads the recorded bill link')
      .toMatch(/\.in\('supplier_bill_id'/);
    // And the check must precede the drafting loop.
    const checkAt = run.indexOf('alreadyOut');
    const draftAt = run.indexOf('createPaymentDraft');
    expect(checkAt, 'the duplicate check runs after the draft is created').toBeLessThan(draftAt);
  });

  it('a FAILED payout does not block a genuine retry', () => {
    // The point of the guard is to stop a second payment, not to strand a bill whose payment
    // never happened. A failed/cancelled payout is not a payment.
    expect(run).toMatch(/DEAD_PAYOUT_STATES/);
    for (const state of ['failed', 'cancelled', 'declined', 'expired', 'reverted']) {
      expect(run, `${state} is no longer treated as a dead payout, so it would block a real retry`)
        .toContain(`'${state}'`);
    }
  });

  it('fails CLOSED when it cannot tell', () => {
    // An unanswerable count is not "no payments out" — and this one guards money leaving.
    // The CONDITION, for the same reason as above.
    expect(run, 'the refusal is no longer conditioned on the lookup having failed')
      .toMatch(/if \(livePayoutErr\)\s*\{/);
    expect(run, 'a failed lookup no longer refuses the run').toMatch(/HttpError\(503/);
  });
});
