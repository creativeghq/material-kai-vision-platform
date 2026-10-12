import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('#369 a workspace buys its own WhatsApp number and pays for it in credits', () => {
  const api = read('supabase/functions/messaging-api/index.ts');
  const purchase = api.slice(api.indexOf("case 'purchase-phone-number'"), api.indexOf("case 'release-phone-number'"));
  const billing = read('supabase/functions/_shared/channel-recurring-billing.ts');

  it('is a workspace owner/admin action, no longer operator-only', () => {
    const ops = api.slice(api.indexOf('const OPERATOR_ACTIONS'), api.indexOf(']);', api.indexOf('const OPERATOR_ACTIONS')));
    expect(ops).not.toContain("'purchase-phone-number'");
    expect(purchase).toContain("await requireWorkspaceManager(wsId, 'buy a number')");
    const gate = api.slice(api.indexOf('const requireWorkspaceManager'), api.indexOf('const loadForm'));
    expect(gate).toMatch(/\['owner', 'admin'\]\.includes/);
  });

  it('debits the quote before buying and refunds when nothing was issued', () => {
    const debit = purchase.indexOf("rpc('debit_credits'");
    expect(debit).toBeGreaterThan(-1);
    expect(debit).toBeLessThan(purchase.indexOf('await purchasePhoneNumber('));
    expect(purchase).toMatch(/catch \(err\) \{\s*await refund\('purchase refused'\)/);
    expect(purchase).toMatch(/if \(outcome\.kind !== 'done'\) \{[\s\S]{0,300}await refund\(outcome\.kind\)/);
  });

  it('keeps the money only for a number it CLAIMED; a replay or a webhook that got there first is refunded', () => {
    expect(purchase).toContain('claimFirstMonth(supabaseClient, wsId, [outcome.numberId], month)');
    expect(purchase).toContain('!outcome.alreadyPurchased');
    expect(purchase).toMatch(/if \(!claimed\.length\) \{\s*await refund\(/);
    const claim = billing.slice(billing.indexOf('export async function claimFirstMonth('), billing.indexOf('export async function unclaimFirstMonth('));
    expect(claim).toContain('prepaid_through.is.null,prepaid_through.lt.');
  });

  it('the activation webhook claims before it debits, and gives the claim back when the debit fails', () => {
    const charge = billing.slice(billing.indexOf('export async function chargeFirstMonth('));
    const claim = charge.indexOf('await claimFirstMonth(');
    const debit = charge.indexOf("rpc('debit_credits'");
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(debit);
    expect(charge.slice(debit)).toMatch(/if \(debitErr \|\| !row\?\.success\) \{\s*await unclaimFirstMonth\(/);
    expect(billing).toMatch(/!\(n\.prepaid_through && n\.prepaid_through >= month\)/);
  });

  it('an unpaid first month holds ONLY that number, and the nightly retry can lift it', () => {
    const hook = read('supabase/functions/zernio-webhook-handler/index.ts');
    const fn = hook.slice(hook.indexOf('async function recordActivatedNumber('));
    expect(fn).toContain('chargeFirstMonth(');
    expect(fn).toMatch(/holdNumbers\(supabase, workspaceId, `\$\{FIRST_MONTH_HOLD\}[^`]*`, \[numberId\]\)/);
    const retry = billing.slice(billing.indexOf('export async function retryFailedCharges('));
    expect(retry).toContain('await retryUnpaidFirstMonths(supabase, workspaceId)');
    const release = billing.slice(billing.indexOf('async function releaseHold('), billing.indexOf('async function retryUnpaidFirstMonths('));
    expect(release).toContain("q.not('held_reason', 'like', `${FIRST_MONTH_HOLD}%`)");
  });

  it('bills an ACTIVE owner or admin, through one lookup', () => {
    const who = billing.slice(billing.indexOf('export async function workspaceBillingUser('), billing.indexOf('export async function attributeProfileNumbers('));
    expect(who).toContain(".eq('status', 'active')");
    expect(billing.match(/from\('workspace_members'\)/g)).toHaveLength(1);
  });
});
