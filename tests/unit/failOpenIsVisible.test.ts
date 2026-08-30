/**
 * A control that fails OPEN must at least be audible (#294 S4).
 *
 * Four shared helpers return *allowed / success* on their error path. Two of those are a
 * deliberate availability trade — a transient DB blip must not stop every metered cron
 * platform-wide, or block a paying user's tool call — and the comment at each site says so. That
 * policy is not what this test pins.
 *
 * What it pins is the SILENCE. A fail-open whose only trace is `console.warn` inside an edge
 * worker is indistinguishable from a working gate, so a *permanently* broken RPC runs everything
 * free for ever and the only symptom is revenue that quietly stops. That is the
 * `stamp_job_refresh_cost` shape this codebase already has probes for: the number is a plausible
 * zero and nothing raises. Both now report, with a stable fingerprint so a persistent break is
 * ONE issue rather than a flood.
 *
 * The other two were not trade-offs at all, just bugs:
 *
 *  - `secrets.ts → loadRow` discarded `error` from the PostgREST result. A failed query leaves
 *    `data` null, which is indistinguishable from "no such key" — and it was then CACHED for 30
 *    seconds as a definitive answer, silently disabling whichever integration asked. Only a real
 *    answer may be cached; an outage must not become one.
 *  - `secrets-bootstrap.ts` resolved its memoised promise normally when the read failed, so the
 *    barrier stayed set and the worker never retried for the rest of its life. One unlucky query
 *    at cold boot and every DB-only secret read through `Deno.env.get()` is undefined until that
 *    worker is recycled — which is exactly the #342 symptom nobody could explain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) =>
  stripComments(readFileSync(join(ROOT, 'supabase/functions/_shared', p), 'utf8'));

describe('#294 S4 — a fail-open control is reported, and an outage is never cached as an answer', () => {
  it('cron-billing reports when it lets unmetered work through', () => {
    const src = read('cron-billing.ts');
    // Both paths — the RPC error and the throw — fail open, so both must report.
    expect((src.match(/captureMessage\(/g) ?? []).length,
      'both the RPC-error and the thrown path fail open; both must be visible').toBe(2);
    expect(src).toMatch(/fingerprint: \['cron-billing', 'fail-open'\]/);
  });

  it('credit-reserve reports when it lets unreserved paid work through', () => {
    const src = read('credit-reserve.ts');
    expect(src).toMatch(/captureMessage\(/);
    expect(src).toMatch(/fingerprint: \['credit-reserve', 'fail-open'\]/);
  });

  it('secrets.ts reads the PostgREST error and never caches a failure', () => {
    const src = read('secrets.ts');

    expect(src, 'a discarded `error` turns a failed query into "no such secret"')
      .toMatch(/const \{ data, error \} = await supabase/);

    // The negative cache is the dangerous half: `ROW_CACHE.set(key, { row: null … })` on an error
    // path serves "does not exist" for the full TTL.
    const loadRow = src.slice(src.indexOf('async function loadRow'), src.indexOf('export async function resolveSecret'));
    expect(loadRow).toMatch(/if \(error\)/);
    // Slice the error BRANCH only — from `if (error)` to the `return` that ends it. Taking the
    // rest of the function would sweep in the success path's legitimate cache write.
    const errFrom = loadRow.indexOf('if (error)');
    const errBranch = loadRow.slice(errFrom, loadRow.indexOf('return null;', errFrom));
    expect(
      errBranch,
      'the error path caches a row — an outage must not become an answer',
    ).not.toMatch(/ROW_CACHE\.set/);
    expect(loadRow.slice(loadRow.indexOf('} catch')), 'the catch caches a null row again')
      .not.toMatch(/ROW_CACHE\.set/);
  });

  it('secrets-bootstrap releases the barrier when the bootstrap failed', () => {
    const src = read('secrets-bootstrap.ts');
    expect(src, 'a failed read still memoised as a completed bootstrap')
      .not.toMatch(/if \(error \|\| !rows\) return;/);
    // The barrier must be cleared, not merely logged.
    expect(src).toMatch(/bootstrapped = null/);
    expect(src).toMatch(/\.finally\(/);
  });
});
