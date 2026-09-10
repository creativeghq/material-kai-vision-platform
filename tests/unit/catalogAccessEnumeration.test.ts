/** A public gate that answers questions about your customer list has to be throttled. */
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
