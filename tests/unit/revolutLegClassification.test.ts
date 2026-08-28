/**
 * A pocket move never settles a customer invoice (#359 CM-12), and Revolut amounts are settled
 * as MAJOR units (#359 CM-15).
 *
 * CM-12: one Revolut transaction becomes N feed rows, one per leg. The reconciler groups them back
 * and reads the shape — an `in` leg with no `out` leg is external money (a customer paying); `in`
 * AND `out` legs are both ours, so it is a pocket→pocket move and not a payment at all.
 *
 * The default when the shape could not be built was `{ inLegs: 1, outLegs: 0 }` — external. And
 * `loadLegShapes` destructured `{ data }` only, so a failed page contributed nothing and every
 * transaction in it fell to that default. This is the exact hazard CLAUDE.md records about this
 * feed: *"the feed is per-leg: match a row in isolation and an internal pocket move settles a
 * customer invoice."*
 *
 * CM-15: the audit could not tell whether Revolut returns minor or major units, and flagged that
 * one of this code and #351's payment providers had to be wrong by 100×. Neither is: the Revolut
 * BUSINESS API returns decimals (a documented leg reads `amount: -47.8, fee: 0.66`), while the
 * Stripe/Viva MERCHANT APIs take minor units. Two APIs, two conventions. This file pins the
 * settlement so nobody "reconciles" them later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const reconcile = read('supabase/functions/_shared/revolut/reconcile.ts');
const sync = read('supabase/functions/_shared/revolut/sync-core.ts');

describe('#359 CM-12 — an incomplete transaction is unknown, not external', () => {
  it('a row records how many legs its parent transaction had', () => {
    // Inferring completeness from sibling rows cannot distinguish "there is no sibling" from
    // "the sibling has not arrived yet", and those are the two cases that must not be confused.
    expect(sync).toMatch(/legs_total: Array\.isArray\(tx\.legs\) \? tx\.legs\.length : null/);
  });

  it('completeness is one predicate, used by both directions', () => {
    expect(reconcile).toMatch(/export function legShapeIsComplete/);
    const incoming = reconcile.slice(reconcile.indexOf('for (const tx of lines)'));
    const outgoing = reconcile.slice(
      reconcile.indexOf('for (const tx of txs as any[])'),
      reconcile.indexOf('for (const tx of lines)'),
    );
    expect(incoming).toMatch(/if \(!legShapeIsComplete\(shape\)\)/);
    expect(outgoing).toMatch(/if \(!legShapeIsComplete\(shape\)\)/);
  });

  it('an unknown legs_total counts as incomplete', () => {
    const fn = reconcile.slice(reconcile.indexOf('export function legShapeIsComplete'));
    expect(fn).toMatch(/if \(!shape\) return false;/);
    expect(fn).toMatch(/typeof shape\.legsTotal !== 'number'\) return false/);
  });

  it('the fail-open defaults are gone from BOTH sides', () => {
    // `?? { inLegs: 1, outLegs: 0 }` on the incoming side and `?? { inLegs: 0, outLegs: 1 }` on
    // the outgoing one. Each says "assume this is external money" about a transaction whose
    // shape is unknown.
    expect(reconcile, 'the incoming fail-open default is back').not.toMatch(/\?\? \{ inLegs: 1, outLegs: 0 \}/);
    expect(reconcile, 'the outgoing fail-open default is back').not.toMatch(/\?\? \{ inLegs: 0, outLegs: 1 \}/);
  });

  it('a failed shape load stops the pass instead of shrinking it', () => {
    // `const { data } = await …` discarded the error, so a failed page silently produced no
    // shapes — and every transaction in it took the external default. The run reported success.
    const fn = reconcile.slice(reconcile.indexOf('export async function loadLegShapes'), reconcile.indexOf('export function legShapeIsComplete'));
    expect(fn).toMatch(/const \{ data, error \}/);
    expect(fn).toMatch(/if \(error\) throw new Error\(`leg-shape load failed/);
  });

  it('an incomplete row is left unmatched, not ignored', () => {
    // `ignored` means "we know this is internal". We do not. The next pass, once the missing legs
    // have synced, classifies it properly — ignoring it here would hide a real payment for good.
    // Anchored FORWARD from the incoming loop. `if (!legShapeIsComplete(shape))` appears on the
    // outgoing side first, and slicing from there swept in that branch's `ignored` stamp — the
    // earlier-occurrence trap, which makes a guard assert something it never meant to.
    const loopStart = reconcile.indexOf('for (const tx of lines)');
    expect(loopStart).toBeGreaterThan(-1);
    const guardStart = reconcile.indexOf('if (!legShapeIsComplete(shape))', loopStart);
    const guard = reconcile.slice(guardStart, reconcile.indexOf('outLegs > 0', guardStart));
    expect(guard.length).toBeGreaterThan(0);
    expect(guard).toMatch(/result\.unmatched\+\+/);
    expect(guard).not.toMatch(/match_status: 'ignored'/);
  });

  it('the check runs BEFORE any settlement decision', () => {
    const loop = reconcile.slice(reconcile.indexOf('for (const tx of lines)'));
    const guard = loop.indexOf('legShapeIsComplete');
    const settle = loop.indexOf('settleTransaction');
    expect(guard).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(-1);
    expect(guard < settle, 'a transaction can be settled before its shape is known').toBe(true);
  });
});

describe('#359 CM-15 — major units, settled', () => {
  it('no unit conversion is applied on the banking path', () => {
    // If Revolut Business returned minor units this code would be out by 100× on every import.
    // It does not: legs are decimals. Adding a `/100` here to "match" the merchant providers is
    // the change this test exists to refuse.
    for (const [name, src] of [['sync-core', sync], ['reconcile', reconcile]] as const) {
      const conversions = src.match(/(?:amount|bill_amount)[^\n]*?[*/]\s*100\b/g) ?? [];
      expect(conversions, `${name} converts a Revolut amount by 100`).toEqual([]);
    }
  });

  it('the reason is written down where the amount is mapped', () => {
    // A bare `amount: Math.abs(leg.amount)` invites exactly the audit question that produced
    // CM-15. The next reader gets the answer instead of the question.
    // Read RAW: the reason lives in a comment, and the stripped source would not contain it.
    const src = raw('supabase/functions/_shared/revolut/sync-core.ts');
    const map = src.slice(src.indexOf('export function legToRow'), src.indexOf('legs_total:'));
    expect(map).toMatch(/MAJOR units/);
    expect(map, 'the settlement of CM-15 is no longer recorded here').toMatch(/#359 CM-15/);
  });

  it('the cent comparison is a comparison, not a conversion', () => {
    // `Math.round(a * 100) === Math.round(b * 100)` scales BOTH sides to compare them at cent
    // precision and stores neither — that is float-safety, not a unit change.
    expect(reconcile).toMatch(/Math\.round\(a \* 100\) === Math\.round\(b \* 100\)/);
  });
});
