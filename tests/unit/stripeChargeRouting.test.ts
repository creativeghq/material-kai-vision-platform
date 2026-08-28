/**
 * A tenant's customer never pays into the operator's Stripe balance (#359 CM-18).
 *
 * The finding asks for per-workspace BYOK. That is the wrong prescription, and worth writing down
 * so nobody implements it later: Stripe CONNECT is already here —
 * `workspace_payment_config.stripe_connect_account_id`, Express onboarding, destination charges —
 * and Connect is strictly better than collecting every tenant's secret key, because the key never
 * leaves Stripe and PCI scope stays where it belongs.
 *
 * The real defect is the FALLBACK. `resolveContext` returned `credentials: {}` for a workspace
 * that had not completed onboarding, and `createCharge` then omitted `transfer_data` — a charge on
 * the PLATFORM account for a tenant's invoice. The tenant's customer pays, the money lands in the
 * operator's balance, and the operator carries the chargeback liability and remits by hand. Which
 * is the mixing CM-18 describes, reached by a different route than the one it names.
 *
 * The verdict lives in SQL so the customer pay page and the admin pay-link cannot disagree about
 * whose balance a payment settles into.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const provider = read('supabase/functions/_shared/payments/stripe-provider.ts');
const payInvoice = read('supabase/functions/finance-pay-invoice/index.ts');

describe('#359 CM-18 — both charge paths ask the same question', () => {
  it('the provider asks the routing verdict', () => {
    expect(provider).toMatch(/rpc\('stripe_charge_routing'/);
    expect(provider, 'the payout-account read is back as the routing decision')
      .not.toMatch(/rpc\('get_workspace_payout_account'/);
  });

  it('the admin pay-link asks it too', () => {
    expect(payInvoice).toMatch(/rpc\('stripe_charge_routing'/);
    expect(payInvoice, 'the payout-account read is back as the routing decision')
      .not.toMatch(/rpc\('get_workspace_payout_account'/);
  });

  it('a refused workspace does not get a charge on the platform account', () => {
    expect(provider).toMatch(/if \(!route\?\.allowed\) \{/);
    // Null from resolveContext means "Stripe is not offerable here" — the pay page shows the
    // other providers rather than taking money somewhere the tenant cannot reach.
    const guard = provider.slice(provider.indexOf('if (!route?.allowed)'), provider.indexOf('return {\n      workspaceId,'));
    expect(guard).toMatch(/return null;/);
  });

  it('the admin path says what to do instead of failing opaquely', () => {
    expect(payInvoice).toMatch(/code: 'stripe_connect_required'/);
    expect(payInvoice).toMatch(/has not connected Stripe yet/);
  });

  it('the refusal precedes the session creation', () => {
    const refusal = payInvoice.indexOf("code: 'stripe_connect_required'");
    const session = payInvoice.indexOf('stripe.checkout.sessions.create');
    expect(refusal).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(-1);
    expect(refusal < session, 'the checkout session is created before the routing is checked').toBe(true);
  });

  it('a destination, when there is one, still becomes transfer_data', () => {
    // The fix must not quietly stop routing to the connected account — that would be the same
    // defect with a different cause.
    expect(provider).toMatch(/transfer_data: \{ destination: ctx\.credentials\.destination \}/);
    expect(payInvoice).toMatch(/transfer_data: \{ destination: destAcct as string \}/);
  });

  it('the reason it is not BYOK is written down where somebody would change it', () => {
    const raw = readFileSync(join(ROOT, 'supabase/functions/_shared/payments/stripe-provider.ts'), 'utf8');
    expect(raw).toMatch(/BYOK/);
    expect(raw).toMatch(/Connect is already here|Connect is already implemented|secret key never leaves/i);
  });
});
