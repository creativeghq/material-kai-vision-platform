/** A payment made in the bank's own app and written down here is ONE payment. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const reconcile = read('supabase/functions/_shared/revolut/reconcile.ts');

const at = (h: string, n: string) => h.indexOf(n);

describe('the feed recognises a payment we already recorded', () => {
  it('asks before the OUTGOING bill ladder runs', () => {
    const loop = reconcile.slice(at(reconcile, 'export async function reconcileOutgoingRevolut'));
    const ask = at(loop, 'findAlreadyRecordedPayment(service, workspaceId, tx)');
    const ladder = at(loop, 'const sameCcy = bills.filter');
    expect(ask).toBeGreaterThan(-1);
    expect(ladder).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(ladder);
  });

  it('asks before the INCOMING invoice ladder runs', () => {
    const loop = reconcile.slice(at(reconcile, 'export async function reconcileWorkspaceRevolut'));
    const ask = at(loop, 'findAlreadyRecordedPayment(service, workspaceId, tx)');
    const ladder = at(loop, 'const sameCurrency = invoices.filter');
    expect(ask).toBeGreaterThan(-1);
    expect(ladder).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(ladder);
  });

  it('binds without writing a payment or an allocation — that is the whole point', () => {
    const stamp = reconcile.slice(
      at(reconcile, 'async function stampAlreadyRecorded'),
      at(reconcile, 'export async function settleTransaction'),
    );
    expect(stamp).toContain("match_method: 'already_recorded'");
    expect(stamp).toContain('reconciled_payment_id: paymentId');
    expect(stamp).not.toContain('recordInvoicePayment');
    expect(stamp).not.toContain('payment_allocations');
    expect(stamp).not.toMatch(/from\('payments'\)\s*\.insert/);
  });
});

describe('it fails closed rather than guessing', () => {
  const fn = reconcile.slice(
    at(reconcile, 'export async function findAlreadyRecordedPayment'),
    at(reconcile, 'async function stampAlreadyRecorded'),
  );

  it('refuses a line that does not name one of our accounts', () => {
    // "probably that balance" is not a standard to double-book money against.
    expect(fn).toMatch(/if \(!bankAccountId\) return null;/);
    expect(fn).toContain(".eq('bank_account_id', bankAccountId)");
  });

  it('requires direction, currency and a cent-equal amount to agree', () => {
    expect(fn).toContain(".eq('direction', String(tx.direction))");
    expect(fn).toContain(".eq('currency',");
    expect(fn).toContain('centsEqual(Number(p.amount), amount)');
  });

  it('requires EXACTLY one candidate', () => {
    // Two is a person's decision, not a guess this is entitled to make.
    expect(fn).toMatch(/sameAmount\.length !== 1\) return null;/);
  });

  it('will not bind a payment another line already claimed', () => {
    expect(fn).toContain(".eq('reconciled_payment_id', candidate.id)");
    expect(fn).toMatch(/if \(taken\) return null;/);
  });

  it('treats a failed lookup as an error, never as an absence', () => {
    // Reading a database failure as "no match" would re-enable the double-allocation on exactly
    // the days the database is unhappy — the defect wearing the fix's clothes.
    expect(fn).toMatch(/if \(error\) throw new Error\(`recorded-payment lookup failed/);
    expect(fn).toMatch(/if \(takenErr\) throw new Error\(`recorded-payment binding check failed/);
  });

  it('is bounded by a date window rather than matching any amount ever paid', () => {
    expect(reconcile).toContain('RECORDED_PAYMENT_WINDOW_DAYS');
    expect(fn).toContain(".gte('paid_at', from)");
    expect(fn).toContain(".lte('paid_at', to)");
  });
});

describe('a per-line failure does not abort the pass', () => {
  it('both loops catch it and keep going', () => {
    // A throw escaping the loop would abort the whole sweep and report the remaining lines as if
    // they had been examined — the silent-zero shape, one level up.
    const outgoing = reconcile.slice(at(reconcile, 'export async function reconcileOutgoingRevolut'));
    const incoming = reconcile.slice(at(reconcile, 'export async function reconcileWorkspaceRevolut'));
    for (const [name, loop] of [['outgoing', outgoing], ['incoming', incoming]] as const) {
      const ask = at(loop, 'findAlreadyRecordedPayment(service, workspaceId, tx)');
      const before = loop.slice(Math.max(0, ask - 200), ask);
      expect(before, `${name} must wrap the lookup in try`).toContain('try {');
    }
  });
});
