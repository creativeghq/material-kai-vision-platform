/**
 * Running out of credits is an OFFER, not an error.
 *
 * Two things this pins, both of which have already failed once:
 *
 * 1. The DETECTOR. AgentHub tested `/insufficient credits/i` — with a SPACE — against the body
 *    agent-chat actually returns, `{"error":"insufficient_credits"}` — with an UNDERSCORE. It
 *    never matched, so the top-up card that had been sitting in that file all along could not
 *    render once, and what the user got was the raw JSON of a 402. A wrong regex is a valid
 *    regex: nothing typechecked, nothing linted, no test failed.
 *
 * 2. That nobody hand-rolls a SECOND one. The reason the bug survived is that the test lived at
 *    the call site instead of in a shared helper, so it could drift from the string it was
 *    matching with nothing comparing the two.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';
import {
  looksInsufficientCredits,
  balanceFromCreditsError,
  isInsufficientCreditsError,
} from '../../src/utils/edgeError';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Every spelling this platform's own functions emit. All three are real, all three are in git. */
const REAL_REFUSALS = [
  // agent-chat, both preflights — the one the user actually hit
  'Agent execution failed: 402 - {"error":"insufficient_credits","current_balance":0.59}',
  '{"error":"insufficient_credits","required_credits":3,"current_balance":0}',
  // seo-api research/plan/write/analyze, generate-social-* — prose in `error`
  'Insufficient credits',
  'SEO research failed: Insufficient credits',
  // toolkit-audit words it as a sentence
  'Not enough credits to run this audit.',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('a credit refusal is recognised, and recognised in one place', () => {
  it('detects every spelling our own functions emit', () => {
    for (const text of REAL_REFUSALS) {
      expect(looksInsufficientCredits(text), text).toBe(true);
    }
    expect(looksInsufficientCredits(new Error(REAL_REFUSALS[0]))).toBe(true);
  });

  it('does not fire on unrelated failures', () => {
    for (const text of [
      'Edge Function returned a non-2xx status code',
      '{"error":"not_entitled","module":"seo-toolkit"}',
      'Rate limit exceeded for trace',
      '',
      null,
      undefined,
    ]) {
      expect(looksInsufficientCredits(text), String(text)).toBe(false);
    }
  });

  it('reads the balance the refusal reported, so the offer can say what you have', () => {
    expect(balanceFromCreditsError(REAL_REFUSALS[0])).toBe(0.59);
    expect(balanceFromCreditsError('{"error":"insufficient_credits","current_balance":0}')).toBe(0);
    expect(balanceFromCreditsError('Insufficient credits')).toBeNull();
  });

  it('keys the parsed-error form on the machine code, like its not_entitled twin', () => {
    expect(isInsufficientCreditsError({ message: 'x', code: 'insufficient_credits' })).toBe(true);
    expect(isInsufficientCreditsError({ message: 'x', code: 'not_entitled' })).toBe(false);
    // Both refusals are 402 — the status alone must never be the test.
    expect(isInsufficientCreditsError({ message: 'x', status: 402 })).toBe(false);
  });

  it('no surface hand-rolls its own credit-refusal regex', () => {
    // The exact shape of the original bug: a literal `insufficient credits` with a SPACE inside a
    // RegExp, which cannot match the code our functions send. Anything testing for this belongs in
    // edgeError.ts, where the spellings are listed together and this test compares them.
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      if (file.endsWith(path.join('utils', 'edgeError.ts'))) continue;
      // Comments stripped FIRST, through the shared scanner — a guard that fires on prose
      // describing the bug it prevents is a guard people delete, and the fix's own explanation
      // of the old broken regex tripped this on its first run. Not hand-rolled: a `//` comment
      // containing `/*` makes the naive two-regex version eat every line down to the next `*/`,
      // so the guard stops seeing the code it guards and reports green forever.
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      // A regex literal mentioning insufficient/not-enough credits.
      const re = /\/[^/\n]*(?:insufficient[\s_]*credits|not\s+enough\s+credits)[^/\n]*\/[gimsuy]*/i;
      if (re.test(src)) offenders.push(path.relative(ROOT, file));
    }
    expect(
      offenders,
      'These test for a credit refusal with their own regex instead of calling '
      + 'looksInsufficientCredits() from src/utils/edgeError.ts. That is how AgentHub ended up '
      + 'matching a space against an underscore for months:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });
});
