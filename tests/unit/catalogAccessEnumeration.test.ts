/**
 * A public gate that answers questions about your customer list has to be throttled.
 *
 * `catalog-access?action=request` is unauthenticated and takes any email, returning
 * `granted_access: true|false` — i.e. "is this address in your CRM, or granted this catalog?".
 * Nothing capped it. Anyone holding a published catalog slug could walk a list and read the
 * workspace's customer base back one `false` at a time.
 *
 * The catalog CONTENTS were never the exposure. The AUDIENCE was, and the audience is the CRM.
 *
 * ── Design decisions this pins, because each is easy to "simplify" wrongly ─────────────────
 *
 * COUNT FAILURES, NOT ATTEMPTS. A mailshot puts many people on this endpoint within minutes and
 * nearly all of them succeed; an enumerator produces almost nothing but failures. Throttling total
 * attempts would brake hardest exactly when the endpoint is doing its job.
 *
 * TWO DIMENSIONS. The per-IP cap is only as good as the IP. The per-CATALOG ceiling bounds what a
 * distributed sweep can learn about one audience however many addresses it claims to come from —
 * the same reasoning `hr-careers` carries for its own workspace-wide ceiling.
 *
 * ONE MESSAGE, AND BEFORE THE LOOKUP. A throttle whose wording or timing differs by which limit was
 * hit is a smaller oracle, not the absence of one.
 *
 * FAIL CLOSED. Shared with every other limiter here (`rateLimitFailsClosed.test.ts` enforces that
 * half repo-wide): the load that breaks the counting query is the sweep the count exists to stop.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const src = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/catalog-access/index.ts'), 'utf8').replace(/\r\n/g, '\n'),
);

/** The `request` branch — the email oracle — bounded by the next action branch. */
const requestBranch = (() => {
  const i = src.indexOf("body.action === 'request'");
  if (i < 0) return '';
  const rest = src.slice(i + 10);
  const next = rest.search(/body\.action === '/);
  return next < 0 ? src.slice(i) : src.slice(i, i + 10 + next);
})();

describe('the catalog email gate is throttled', () => {
  it('is pointed at the real branch', () => {
    expect(requestBranch, 'the request branch is gone').not.toBe('');
    expect(requestBranch, 'the email match is what this branch does').toContain('resolveEmailMatch');
    expect(requestBranch, 'the branch slice does not reach the access-log write')
      .toContain('catalog_access_log');
  });

  it('caps per IP and per catalog', () => {
    // The COMPARISON, not the constant. A declared ceiling nothing compares against is a comment,
    // and `if (false) { … }` keeps every name in the file while the gate stands open.
    expect(requestBranch, 'the per-IP cap is no longer compared against anything')
      .toMatch(/\(ipFails \?\? 0\) >= RL_MAX_FAILED_PER_IP/);
    expect(requestBranch, 'the per-catalog ceiling is gone — a distributed sweep is unbounded again')
      .toMatch(/\(catFails \?\? 0\) >= RL_MAX_FAILED_PER_CATALOG/);
    expect(requestBranch, 'the per-catalog count no longer scopes to this catalog')
      .toMatch(/\.eq\('catalog_id', catalog\.id\)/);
    // Both comparisons must gate the SAME refusal, before the lookup.
    expect(requestBranch, 'the two ceilings no longer share one refusal')
      .toMatch(/if \(\(ipFails \?\? 0\) >= RL_MAX_FAILED_PER_IP \|\| \(catFails \?\? 0\) >= RL_MAX_FAILED_PER_CATALOG\)/);
  });

  it('counts FAILED attempts, not all attempts', () => {
    // Both counts must filter on granted_access = false. Counting everything throttles a mailshot.
    const falseFilters = requestBranch.match(/\.eq\('granted_access', false\)/g) ?? [];
    expect(falseFilters.length,
      'a throttle that counts successful lookups brakes the one time this endpoint is busy for a '
      + 'legitimate reason — a mailshot — while barely touching an enumerator')
      .toBe(2);
  });

  it('refuses BEFORE it looks the address up', () => {
    const throttleAt = requestBranch.indexOf('RL_MAX_FAILED_PER_IP');
    const lookupAt = requestBranch.indexOf('resolveEmailMatch');
    expect(throttleAt, 'the throttle no longer precedes the lookup it is protecting')
      .toBeGreaterThan(-1);
    expect(throttleAt, 'the lookup runs before the throttle, so the oracle answers anyway')
      .toBeLessThan(lookupAt);
  });

  it('fails CLOSED when it cannot count', () => {
    expect(requestBranch, 'the refusal is no longer conditioned on the counts having failed')
      .toMatch(/if \(ipErr \|\| catErr\)\s*\{/);
    expect(requestBranch, 'a failed count no longer refuses').toMatch(/\}, 429\)/);
  });

  it('says the same thing whichever limit was hit', () => {
    // Two different messages would let a caller distinguish "I am throttled" from "this catalog
    // is throttled", which leaks whether anyone else is probing the same audience.
    const messages = requestBranch.match(/'Too many attempts\.[^']*'/g) ?? [];
    expect(messages.length, 'the throttle messages are gone').toBeGreaterThanOrEqual(2);
    expect(new Set(messages).size, 'the 429 responses no longer use identical wording')
      .toBe(1);
  });

  it('still fails closed on the access-log write', () => {
    // Pre-existing and unrelated to the throttle, but it lives in the same branch and a rewrite
    // here is exactly how it would be lost: an issued token that was never recorded cannot be
    // validated later.
    expect(requestBranch).toMatch(/Failed to record access/);
  });
});
