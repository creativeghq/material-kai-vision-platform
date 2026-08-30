/**
 * A flat-rate provider call must be able to say whether it worked.
 *
 * `ops.silent_zero`'s provider-failure arm asks "is this provider failing on essentially every
 * attempt", and it reads `ai_usage_logs.metadata->>'success'`. It skips a row without that key —
 * correctly, because a row that never learned its outcome cannot be judged.
 *
 * The consequence was invisible: `debitExternalServiceCredits` writes its row BEFORE the upstream
 * call (invariant 10 — debit first, so a refusal costs nothing), which means at insert time the
 * outcome is genuinely unknowable and the key cannot be set. So every flat-rate provider debited
 * that way is outside the probe's reach entirely. It caught Perplexity's `sonar` — 35 calls, 0
 * successes — only because MIVAA's Python logger records the outcome after the call. The
 * edge-side providers had no equivalent.
 *
 * Measured 2026-08-30: `metadata.success` coverage across `ai_usage_logs` reached 96% this week
 * (from ~27%), and the entire remainder was `dataforseo-request` and `firecrawl-scrape` — the two
 * debited through this path.
 *
 * ## What this change does and does NOT cover
 *
 * `dataforseo-spend-gate` is wired, and that single chokepoint covers EVERY `dataforseo_*`
 * operation without touching a call site — the gate already distinguishes "reported a cost"
 * from "reported none", which it calls a defect, so the verdict was there to be recorded.
 *
 * The other flat-rate callers of `debitExternalServiceCredits` are NOT yet stamped. That is
 * stated here rather than left implied: partial coverage nobody has written down is how a probe
 * gets trusted for more than it checks. The plumbing (`usage_log_id` +
 * `recordExternalServiceOutcome`) is what each of them needs, and it now exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, 'supabase/functions', p), 'utf8'));

describe('an external-service call can record whether it worked', () => {
  const utils = read('_shared/credit-utils.ts');
  const gate = read('_shared/tools/dataforseo-spend-gate.ts');

  it('the debit hands back the usage-log row id', () => {
    // Without the id there is nothing to stamp later, and the row is stranded unjudgeable.
    expect(utils).toMatch(/usage_log_id\?: string \| null;/);
    expect(utils, 'the insert must select the id back').toMatch(/\.select\('id'\)/);
    expect(utils).toMatch(/usage_log_id: \(logRow as/);
  });

  it('recording an outcome is best-effort and never throws', () => {
    // Telemetry must not fail the work it describes.
    expect(utils).toMatch(/export async function recordExternalServiceOutcome/);
    const fn = utils.slice(utils.indexOf('export async function recordExternalServiceOutcome'));
    expect(fn.slice(0, 1400)).toMatch(/try \{/);
    expect(fn.slice(0, 1400)).toMatch(/catch/);
  });

  it('the DataForSEO gate stamps the outcome when it settles', () => {
    expect(gate, 'the gate must use the tracked debit or it has no id to stamp')
      .toMatch(/debitOrRefuseTracked\(/);
    expect(gate).toMatch(/recordExternalServiceOutcome\(/);

    // BEFORE the early return, or a call that reported no cost — the failure case — records
    // nothing, which is precisely the case the probe needs to see.
    const settleAt = gate.indexOf('settle: async (costUsd)');
    const stampAt = gate.indexOf('recordExternalServiceOutcome(', settleAt);
    const earlyReturn = gate.indexOf('return;', settleAt);
    expect(settleAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(settleAt);
    expect(
      stampAt,
      'the outcome is recorded after the no-cost early return, so a FAILED call still records nothing',
    ).toBeLessThan(earlyReturn);
  });

  it.each([
    ['_shared/tools/b2b-tools.ts', 'company_website_scrape'],
    ['_shared/tools/material-scrape-tools.ts', 'opType'],
  ])('the Firecrawl scrape in %s records its outcome on every path', (file) => {
    const src = read(file);
    expect(src, 'the untracked debit hands back no id, so the stamp would be a silent no-op')
      .toMatch(/debitOrRefuseTracked\(/);

    // Success AND failure, or the probe learns only about the calls that worked — which reports
    // a provider failing on every attempt as a provider nobody used.
    const stamps = src.match(/recordExternalServiceOutcome\(/g) ?? [];
    expect(stamps.length, 'expected at least a success path and a failure path')
      .toBeGreaterThanOrEqual(2);
    // Both verdicts must be reachable. If only the success path stamps, a provider failing
    // on every attempt reports as a provider nobody used.
    expect(src, 'no success stamp').toMatch(/recordExternalServiceOutcome\([^)]*true\)/);
    expect(src, 'no failure stamp').toMatch(/recordExternalServiceOutcome\([\s\S]{0,120}?false/);
  });

  it('the gate no longer uses the untracked debit', () => {
    // `debitOrRefuse` discards the result, so reverting to it silently removes the id and the
    // stamp becomes a no-op — the failure would look exactly like success.
    expect(gate).not.toMatch(/\bdebitOrRefuse\(/);
  });
});
