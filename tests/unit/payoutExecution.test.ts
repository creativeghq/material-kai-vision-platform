/**
 * Sending money is not recording it, and the order of the send is the safety (#315).
 *
 * Two rails can now move money — Revolut Business and Viva — and one dialog offers the operator
 * the choice between instructing a transfer and writing down one that happened elsewhere. Three
 * distinct ways that goes wrong, none of which any typecheck can see because each produces a valid
 * number on a valid row:
 *
 *   1. **Both halves run.** A send that also writes a `payments` row books the cost twice: once
 *      optimistically here, once again when the bank feed reconciles the outgoing line. The books
 *      then disagree with the bank in the direction that looks like the supplier was overpaid.
 *   2. **The audit is written after the call.** An instruction that vanishes into a timeout leaves
 *      no trace, so nobody can tell "it never went" from "it went and we did not hear back" — and
 *      the operator presses the only button on the screen.
 *   3. **The name check is skipped.** Minting a Revolut counterparty is what runs Confirmation of
 *      Payee; creating one implicitly inside the send routes every payment around the single
 *      control standing between a mistyped IBAN and an irreversible transfer to a stranger.
 *
 * These are source-order assertions on purpose: a check that runs after the side effect is not a
 * check, and that is a property of where the lines sit, not of what they return.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const payout = read('supabase/functions/_shared/payments/payout.ts');
const vivaPayout = read('supabase/functions/_shared/payments/viva-payout.ts');
const sendFn = read('supabase/functions/finance-send-payment/index.ts');
const revolutApi = read('supabase/functions/revolut-api/index.ts');
const dialog = read('src/modules/finance/components/RecordPaymentDialog.tsx');
const choice = read('src/modules/finance/components/SendOrRecordChoice.tsx');
const service = read('src/modules/finance/services/payoutService.ts');

/** Index of the first match, or -1. Keeps the ordering assertions readable. */
const at = (haystack: string, needle: string | RegExp) =>
  typeof needle === 'string' ? haystack.indexOf(needle) : haystack.search(needle);

describe('the payout executor is the one implementation', () => {
  it('is what revolut-api calls — paying a counterparty is not written twice', () => {
    expect(revolutApi).toContain("from '../_shared/payments/payout.ts'");
    expect(revolutApi).toContain('executePayout(service, {');
    /**
     * `createPayment` — the immediate single transfer to a counterparty — must exist in exactly
     * one place. That call was the duplicated one: `revolut-api` had its own copy of the audit,
     * the replay check and the dispatch around it, and the new screen would have been a third.
     */
    expect(revolutApi).not.toContain('createPayment(service');
    expect(payout).toContain('createPayment(service');
  });

  /**
   * Three instruments legitimately stay in `revolut-api`, and none of them is "pay a counterparty":
   * `pay-due-bills` is ONE Revolut draft covering N bills (routing it through the per-payment
   * executor would produce N drafts and N approvals), a payout LINK has no counterparty at all,
   * and an exchange moves money between our own pockets. Shrink-only: an entry may leave this list
   * by being folded into the executor, never join it.
   */
  it('the instruments that stay behind still write the same ledger, still before the call', () => {
    const auditSites = [...revolutApi.matchAll(/from\('payout_instructions'\)\s*\.insert/g)].map((m) => m.index!);
    expect(auditSites).toHaveLength(3);
    for (const [insertNeedle, callNeedle] of [
      ['insert(auditRows)', 'createPaymentDraft(service'],
      ["kind: 'payout_link'", 'createPayoutLink(service'],
      ["kind: 'exchange'", 'exchangeMoney(service'],
    ] as const) {
      const insert = at(revolutApi, insertNeedle);
      const call = at(revolutApi, callNeedle);
      expect(insert, `${insertNeedle} is missing`).toBeGreaterThan(-1);
      expect(call, `${callNeedle} is missing`).toBeGreaterThan(-1);
      expect(insert, `${insertNeedle} must be audited before ${callNeedle}`).toBeLessThan(call);
    }
  });

  it('is what the new UI entry calls, with no second copy of the dispatch', () => {
    expect(sendFn).toContain("from '../_shared/payments/payout.ts'");
    expect(sendFn).toContain('executePayout(service, {');
    expect(sendFn).not.toMatch(/from\('payout_instructions'\)/);
    expect(sendFn).not.toContain('banktransfers');
  });

  /**
   * Swept, not listed.
   *
   * The first version of this checked four files I happened to remember, and
   * `revolut-webhooks` — which updates a payout link's state — was not one of them. The table no
   * longer exists under that name, so that read was a runtime error on every Revolut webhook,
   * with every gate green. A rename is exactly the case where a hand-kept list of readers is the
   * wrong instrument: the whole point is that you do not know who reads it.
   */
  it('no file anywhere still names the old table', () => {
    expect(payout).toContain("from('payout_instructions')");
    const roots = [join(ROOT, 'supabase', 'functions'), join(ROOT, 'src'), join(ROOT, 'api')];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      let entries: string[] = [];
      try { entries = readdirSync(dir); } catch { return; }
      for (const e of entries) {
        if (e === 'node_modules') continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx|js|mjs)$/.test(p)) continue;
        // The generated Supabase types are a projection of the live schema, checked separately.
        if (p.endsWith(join('integrations', 'supabase', 'types.ts'))) continue;
        if (readFileSync(p, 'utf8').includes('revolut_payouts')) offenders.push(p.slice(ROOT.length + 1));
      }
    };
    roots.forEach(walk);
    expect(
      offenders,
      'these still read/write `revolut_payouts`, which no longer exists — it was renamed to '
      + '`payout_instructions` when Viva gained the ability to send too:\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('the order inside executePayout', () => {
  it('claims the request id BEFORE inserting the audit row', () => {
    const replay = at(payout, ".eq('request_id', requestId)");
    const insert = at(payout, "from('payout_instructions').insert");
    expect(replay).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(insert);
  });

  it('inserts the audit row BEFORE either provider is called', () => {
    const insert = at(payout, "from('payout_instructions').insert");
    const revolut = at(payout, 'sendViaRevolut(');
    const viva = at(payout, 'sendViaViva(');
    expect(insert).toBeLessThan(revolut);
    expect(insert).toBeLessThan(viva);
  });

  it('tenancy-checks the counterparty and the bill before anything is written', () => {
    const counterparty = at(payout, 'loadCounterparty(service');
    const bill = at(payout, "from('supplier_bills')");
    const insert = at(payout, "from('payout_instructions').insert");
    expect(counterparty).toBeLessThan(insert);
    expect(bill).toBeLessThan(insert);
    // Scoped to the workspace, not merely fetched by id — the service client makes the manual
    // check mandatory rather than excusing it (security invariant 1).
    expect(payout).toMatch(/from\('supplier_bills'\)[\s\S]{0,200}\.eq\('workspace_id', workspaceId\)/);
    expect(payout).toMatch(/from\('crm_bank_accounts'\)[\s\S]{0,400}\.eq\('workspace_id', workspaceId\)/);
    expect(payout).toMatch(/from\('finance_bank_accounts'\)[\s\S]{0,400}\.eq\('workspace_id', workspaceId\)/);
  });

  it('stamps a failure so a real retry is not blocked by it', () => {
    expect(payout).toMatch(/catch[\s\S]{0,200}state: 'failed'/);
  });
});

describe('instructing a payment is not recording one', () => {
  it('the executor writes no payments row and no allocation', () => {
    expect(payout).not.toContain("from('payments')");
    expect(payout).not.toContain("from('payment_allocations')");
    expect(payout).not.toContain('recordInvoicePayment');
  });

  it('the client service writes nothing to the books either', () => {
    expect(service).not.toContain("from('payments')");
    expect(service).not.toContain('recordPayment');
  });

  it('the dialog RETURNS from the send branch before every recording path', () => {
    const branch = at(dialog, "sendState.intent === 'send'");
    const paySupplierBill = at(dialog, 'financeService.paySupplierBill');
    const recordPayment = at(dialog, 'financeService.recordPayment');
    const createCreditNote = at(dialog, 'financeService.createCreditNote');
    expect(branch).toBeGreaterThan(-1);
    for (const later of [paySupplierBill, recordPayment, createCreditNote]) {
      expect(later).toBeGreaterThan(branch);
    }
    // …and it must actually leave, not fall through into them.
    const branchBody = dialog.slice(branch, paySupplierBill);
    expect(branchBody).toContain('return;');
  });

  it('the send branch reuses ONE idempotency key per dialog opening', () => {
    // Minted in a ref (survives re-render), reset when the dialog opens, never per attempt.
    expect(dialog).toMatch(/sendRequestId\s*=\s*useRef<string>\(crypto\.randomUUID\(\)\)/);
    expect(dialog).toContain('requestId: sendRequestId.current');
    expect(dialog).toMatch(/if \(!open\) return;[\s\S]{0,200}sendRequestId\.current = crypto\.randomUUID\(\)/);
    // The server refuses a missing one rather than minting its own, which is the failure the old
    // Revolut path had: two attempts, two ids, two transfers.
    expect(sendFn).toMatch(/UUID_RE\.test\(requestId\)[\s\S]{0,120}throw new HttpError\(400/);
  });
});

describe('the controls that stand in front of an irreversible transfer', () => {
  it('the executor never creates a Revolut counterparty — that is where VoP runs', () => {
    expect(payout).not.toContain('createCounterparty(');
    expect(payout).toMatch(/revolut_counterparty_id;[\s\S]{0,400}throw new PayoutError\(/);
  });

  it('verifying is a separate, explicitly-forced call on the client', () => {
    expect(service).toContain("callRevolutApi('create-counterparty'");
    expect(service).toContain('opts.force');
    // The mismatch has to reach a human who can decide; swallowing it is the bug.
    expect(service).toContain('isVopMismatch');
    expect(choice).toContain('isVopMismatch');
  });

  it('refuses to send from a Revolut connection that was never completed', () => {
    expect(payout).toMatch(/cfg\.refresh_token[\s\S]{0,300}never connected/);
  });

  it('Viva refuses a draft rather than silently executing it', () => {
    // Viva has no approval step. Treating 'draft' as 'send now' would move money the operator
    // asked to have held.
    expect(payout).toMatch(/mode === 'draft'[\s\S]{0,400}throw new PayoutError\(/);
  });

  it('Viva money-out uses the transfer credentials, never the checkout ones', () => {
    expect(vivaPayout).toContain('transfer_client_id');
    expect(vivaPayout).toContain('transfer_client_secret');
    // A null credential pair is the switch that says this workspace cannot send.
    expect(vivaPayout).toMatch(/if \(!data\.transfer_client_id \|\| !data\.transfer_client_secret\) return null;/);
    // Separate token cache: one key answering for two clients with different entitlements is how
    // a charge starts being attempted with a transfer-only token.
    expect(vivaPayout).toContain('`transfer:${hosts.accounts}:${ctx.transferClientId}`');
  });

  it('sends Viva amounts in MINOR units', () => {
    // Viva's :send takes cents while its own 769 webhook reports major units. An integer euro
    // figure here is a hundredfold underpayment that Viva executes without complaint.
    expect(payout).toContain('Math.round(amount * 100)');
    expect(vivaPayout).toMatch(/Number\.isInteger\(input\.amountMinor\)/);
  });
});

describe('the choice only offers what the server will accept', () => {
  it('reads the rail off the derived column, never re-deciding it in the client', () => {
    expect(choice).toContain('sourceAccount?.payout_provider');
    // Re-deriving from the provider columns is how a picker starts offering accounts the server
    // refuses — the refusal then arrives after the amount was typed and the button pressed.
    expect(choice).not.toContain('revolut_account_id');
    expect(choice).not.toContain('viva_wallet_id');
  });

  it('drops the send intent when the chosen account cannot send', () => {
    expect(choice).toMatch(/if \(!provider && value\.intent === 'send'\) patch\(\{ intent: 'record' \}\)/);
  });

  it('never leaves a Viva send asking for an approval step that does not exist', () => {
    expect(choice).toMatch(/provider === 'viva' && value\.sendMode === 'draft'/);
  });

  it('says plainly that no payment has been written yet', () => {
    expect(choice).toContain('No payment is written to the books yet');
  });
});
