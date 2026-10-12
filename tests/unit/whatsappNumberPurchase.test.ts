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
    expect(purchase).toMatch(/\['owner', 'admin'\]\.includes/);
  });

  it('debits the first month before buying and refunds when nothing was issued', () => {
    const debit = purchase.indexOf("rpc('debit_credits'");
    expect(debit).toBeGreaterThan(-1);
    expect(debit).toBeLessThan(purchase.indexOf('await purchasePhoneNumber('));
    expect(purchase).toMatch(/catch \(err\) \{\s*await refund\('purchase refused'\)/);
    expect(purchase).toMatch(/if \(outcome\.kind !== 'done'\) \{[\s\S]{0,300}await refund\(outcome\.kind\)/);
  });

  it('a number paid up front is not charged again for the same month', () => {
    expect(purchase).toMatch(/update\(\{ prepaid_through: month \}\)/);
    expect(billing).toMatch(/!\(n\.prepaid_through && n\.prepaid_through >= month\)/);
  });

  it('a number that goes live later (KYC, checkout) is recorded and charged on activation, held if unpaid', () => {
    const hook = read('supabase/functions/zernio-webhook-handler/index.ts');
    const fn = hook.slice(hook.indexOf('async function recordActivatedNumber('));
    expect(fn).toContain('attributeProfileNumbers(');
    expect(fn).toContain('chargeFirstMonth(');
    expect(fn).toMatch(/if \(!charge\.ok\) \{\s*const \{ held \} = await holdNumbers\(/);
    expect(billing).toMatch(/\.is\('prepaid_through', null\)/);
  });
});
