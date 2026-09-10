/** Guard: every edge writer into `ai_usage_logs` says whether the call SUCCEEDED. */
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
