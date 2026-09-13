/**
 * What gets reconciled is decided by the ACCOUNT, not by which integration delivered the row.
 *
 * The matcher selected `provider = 'revolut'`, with the correct reasoning that stripe/viva rows
 * mirror money their own webhooks already settled and re-matching one would double-book. Keeping
 * that as a provider literal made the rule a property of the integration, so a bank with no API —
 * Postbank BG is on file, active, with an IBAN — could never be reconciled however its statement
 * arrived.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const SRC = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/_shared/revolut/reconcile.ts'), 'utf8'),
);

const MAIN = SRC.slice(SRC.indexOf('export async function reconcileWorkspaceRevolut'));

describe('the account decides, not the provider', () => {
  it('the matcher selects reconcilable ACCOUNTS', () => {
    expect(MAIN).toMatch(/\.eq\('feed_kind', 'bank_account'\)/);
    expect(MAIN).toMatch(/\.in\('bank_account_id', reconcilableIds\)/);
  });

  it('and no longer hardcodes the integration in the main selection', () => {
    const select = MAIN.slice(MAIN.indexOf("from('revolut_bank_transactions')"));
    expect(select.slice(0, 600), 'the feed scan filters on a provider name again')
      .not.toMatch(/\.eq\('provider', 'revolut'\)/);
  });

  it('no reconcilable account means nothing to do, never everything', () => {
    // Falling through to an unfiltered scan would match merchant-settlement rows against open
    // invoices — the exact double-book the provider filter existed to prevent.
    expect(MAIN).toMatch(/if \(reconcilableIds\.length === 0\) return result;/);
  });
});

describe('the multi-leg guard still fails closed where legs exist', () => {
  it('only Revolut is treated as carrying legs', () => {
    expect(SRC).toMatch(/export function carriesLegs/);
    expect(SRC).toMatch(/String\(provider \?\? ''\) === 'revolut'/);
  });

  it('a leg-carrying row with an incomplete shape is still refused', () => {
    // #359 CM-12: a transaction whose sibling out leg had not been written yet was auto-matched
    // against a customer invoice. The guard must survive this change untouched.
    expect(MAIN).toMatch(/if \(!legShapeIsComplete\(shape\)\) \{/);
    expect(SRC).toMatch(/return shape\.inLegs \+ shape\.outLegs >= shape\.legsTotal;/);
  });

  it('a single-row provider is one leg by construction, and says so', () => {
    // This is NOT the `{inLegs: 1, outLegs: 0}` default that CM-12 removed — that was a guess
    // about a Revolut transaction; this is a fact about a format with no siblings.
    expect(MAIN).toMatch(/carriesLegs\(tx\.provider\)/);
    expect(MAIN).toMatch(/\{ inLegs: 1, outLegs: 0, legsTotal: 1 \}/);
  });

  it('and an internal pocket move is still stamped rather than matched', () => {
    expect(MAIN).toMatch(/if \(shape!\.outLegs > 0\)/);
  });
});
