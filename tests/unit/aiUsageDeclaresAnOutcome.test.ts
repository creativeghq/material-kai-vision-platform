/**
 * Guard: every edge writer into `ai_usage_logs` says whether the call SUCCEEDED.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ops.silent_zero_provider` is the probe that catches "this provider is refusing every
 * call we pay for". It judges a provider ONLY on rows whose `metadata` carries a
 * `success` key, and that rule is correct — its own comment says why: a row that never
 * claimed to succeed is not evidence that it failed, and counting silent rows as failures
 * would flag every logger that simply records no outcome.
 *
 * The rule only works if the writers hold up their end. Measured 2026-08-23 over seven
 * days of `ai_usage_logs`:
 *
 *     voyage        510 calls,   0 declared an outcome
 *     anthropic     596 calls,  12 declared an outcome
 *     perplexity     30 calls,  30 declared an outcome   <- the only one watched
 *
 * ~1,100 calls a week outside the probe's field of view, and the single provider it could
 * see is the one it correctly caught at 401.
 *
 * Demonstrated rather than argued: thirty simulated Anthropic failures inserted the way
 * these writers logged them produced ZERO findings; the same thirty with `success: false`
 * fired the probe. Same outage, one key apart.
 *
 * And it is not hypothetical. On 2026-08-22 the Anthropic account hit zero and every
 * agent, vision and classifier call began returning 400. The probe said nothing and could
 * not have — a person noticed the agent replying with an error string.
 *
 * `_shared/ai-client.ts` matters most: CLAUDE.md names it the intended chokepoint for
 * edge model calls, and it declared nothing at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

/** An INSERT, not a SELECT — a file that only reads has no outcome to declare. */
const INSERT_RE = /from\(\s*['"]ai_usage_logs['"]\s*\)\s*\n?\s*\.?\s*insert/s;

function edgeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.deno') continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.ts')) out.push(p);
    }
  };
  walk(FUNCTIONS);
  return out;
}

const writers = edgeFiles()
  .map((p) => ({ path: p.slice(ROOT.length + 1).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }))
  .filter((f) => INSERT_RE.test(f.src));

describe('ai_usage_logs writers declare an outcome', () => {
  it('finds the writers at all (a guard matching nothing passes forever)', () => {
    expect(writers.length, 'no ai_usage_logs inserts found — the pattern changed shape')
      .toBeGreaterThanOrEqual(15);
  });

  it('every writer carries a `success` key', () => {
    // Deliberately a check for the KEY, not a value or a shape. A path that only ever
    // logs completed calls may hardcode `success: true` — that is a claim, and a claim is
    // what the probe needs. Silence is the only wrong answer.
    const silent = writers
      .filter((f) => !/\bsuccess\s*:/.test(f.src))
      .map((f) => f.path);
    expect(
      silent,
      `These write to ai_usage_logs without declaring an outcome: ${silent.join(', ')}. `
      + `ops.silent_zero_provider skips rows with no \`success\` key, so every call they log `
      + `is invisible to the one probe that would notice the provider refusing all of them.`,
    ).toEqual([]);
  });

  it('the shared AI client derives success from its error, not from a second argument', () => {
    const src = readFileSync(join(FUNCTIONS, '_shared', 'ai-client.ts'), 'utf8');
    // Two log paths — tokens and per-unit — and both must declare.
    const matches = src.match(/success:\s*!opts\.errorMessage/g) ?? [];
    expect(
      matches.length,
      'ai-client has two ai_usage_logs paths (_logTrackedCall and _logUnitCall); both must '
      + 'derive `success` from `errorMessage` rather than accept it separately — two fields '
      + 'describing one outcome will eventually disagree',
    ).toBe(2);
  });
});
