/** A control that fails OPEN must at least be audible (#294 S4). */
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
