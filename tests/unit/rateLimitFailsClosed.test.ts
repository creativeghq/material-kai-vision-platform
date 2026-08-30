/**
 * A brake that cannot read its own gauge must ENGAGE, not disengage.
 *
 * Every rate limit in this codebase is the same two steps: count what this caller has already
 * done, compare it to a ceiling. The count is the ENFORCEMENT DECISION — and
 * `const { count } = await supabase…` followed by `(count ?? 0) >= LIMIT` silently turns "I could
 * not answer that" into "this caller has done nothing", which lifts the limit for everybody at the
 * exact moment it is needed. The load that breaks the count query is usually the abuse the limit
 * exists to stop, so the failure is self-reinforcing rather than random.
 *
 * `real-estate-public.enforceLeadRateLimit` already carries this reasoning at length and splits the
 * two halves properly: the COUNT fails closed, the bookkeeping INSERT never blocks a legitimate
 * caller. MEASURED 2026-08-30: seven other limiters across five functions had not adopted it —
 *
 *   • `public-project-plan` — the anonymous estimator's daily quota AND its lead cap;
 *   • `flow-engine` — the per-flow and cross-flow LOOP BREAKERS, where failing open means unbounded
 *     execution and spend, triggered by the very load that breaks the query;
 *   • `hr-kiosk` — the per-IP throttle, and the PIN LOCKOUT, whose own comment says it exists to
 *     blunt distributed brute force against a 4-digit PIN;
 *   • `hr-careers` — both public application caps;
 *   • `inbox-api` — the public-profile contact form, per sender and per recipient.
 *
 * Nothing was failing at the time. That is the point: this defect is invisible until the day the
 * query breaks, and on that day it produces no error of its own.
 *
 * SCOPE. Only a count compared against a NAMED CEILING (`*_MAX_*`, `*_CAP`, `*_QUOTA`, `*_LIMIT`,
 * `*_THRESHOLD`) is flagged. An informational count — "does a row already exist", "how many did we
 * import" — is not an enforcement decision and is deliberately left alone, because a guard that
 * flags those gets suppressed, and a suppressed guard protects nothing.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Read once. A per-test walk of every edge function is the slowest thing in the file. */
const SOURCES: Array<{ rel: string; lines: string[] }> = walk(FUNCTIONS).map((f) => ({
  rel: relative(ROOT, f).replace(/\\/g, '/'),
  lines: readFileSync(f, 'utf8').split('\n'),
}));

/**
 * A constant that reads like a ceiling — the comparison that IS the enforcement.
 *
 * Two steps on purpose. The one-regex form `[A-Z][A-Z0-9_]*(?:MAX|CAP|…)[A-Z0-9_]*` requires a
 * character BEFORE the keyword, so it could not match `MAX_FLOW_RUNS_PER_MINUTE` — the loop
 * breaker, the most consequential limiter here — and reported that file clean.
 */
const isCeiling = (token: string): boolean =>
  /^[A-Z][A-Z0-9_]*$/.test(token) && /MAX|CAP|QUOTA|LIMIT|THRESHOLD/.test(token);

/** `(recent ?? 0) >= CAREERS_MAX_PER_WINDOW` */
const COMPARISON = /\(\s*([A-Za-z_$][\w$]*)\s*\?\?\s*0\s*\)\s*>=?\s*([A-Za-z_$][\w$]*)/g;

/**
 * How far back a binding may be and still plausibly be the one that produced this count.
 *
 * Generous on purpose: a limiter that has been FIXED carries the reasoning between its query and
 * its comparison, and a tight window reports those as unanalysable — the guard would then fire
 * hardest on the code that had already been put right.
 */
const LOOKBACK = 30;

interface Site { file: string; line: number; variable: string; ceiling: string; reason: string }

/**
 * Did the statement that produced `name` also bind its query error?
 *
 * Deliberately index-based rather than a regex over the window. Both binding forms occur —
 * `const { count: x, error: e } = await …` and the array form
 * `const [{ count: a, error: ea }, { count: b, error: eb }] = await Promise.all([…])`, which is how
 * the inbox contact form is written — and a pattern general enough to span both across newlines
 * backtracks badly enough to hang the suite. Slicing from the last `const` is linear and, pinned
 * by the cases below, precise enough for a shape guard.
 */
function bindingChecksError(window: string, name: string): boolean | null {
  // Every `const … ;` statement in the window. The one we want is the latest that AWAITS a query
  // and mentions this count — not simply the last `const`, because the comparison is often itself
  // written `const limited = (count ?? 0) >= CAP`, and taking that one reports every already-fixed
  // limiter as broken.
  const statements: string[] = [];
  for (let i = window.indexOf('const '); i !== -1; i = window.indexOf('const ', i + 6)) {
    const end = window.indexOf(';', i);
    statements.push(window.slice(i, end === -1 ? window.length : end));
  }
  for (let i = statements.length - 1; i >= 0; i--) {
    const stmt = statements[i];
    if (!stmt.includes('await')) continue;
    const mentionsCount = stmt.includes(`count: ${name}`) || (name === 'count' && /\bcount\b/.test(stmt));
    if (!mentionsCount) continue;
    return /\berror\b/.test(stmt);
  }
  return null;
}

function offenders(): Site[] {
  const out: Site[] = [];
  for (const { rel, lines } of SOURCES) {
    for (let i = 0; i < lines.length; i++) {
      COMPARISON.lastIndex = 0;
      for (const cmp of lines[i].matchAll(COMPARISON)) {
        const [, variable, ceiling] = cmp;
        if (!isCeiling(ceiling)) continue;
        const window = lines.slice(Math.max(0, i - LOOKBACK), i + 1).join('\n');
        const checked = bindingChecksError(window, variable);
        if (checked === null) {
          out.push({ file: rel, line: i + 1, variable, ceiling, reason: 'could not find the query this count came from' });
        } else if (!checked) {
          out.push({ file: rel, line: i + 1, variable, ceiling, reason: 'the query error is discarded, so a failed count reads as zero used' });
        }
      }
    }
  }
  return out;
}

describe('a rate limit fails closed', () => {
  it('is actually scanning, and can still see the shape', () => {
    expect(SOURCES.length, 'no edge sources found — this guard is pointed at nothing').toBeGreaterThan(50);

    // Pin the detector against the exact code it was written for, both binding forms, both verdicts.
    const objBad = "  const { count: recent } = await supabase.from('hr_kiosk_attempts')\n    .select('*', { count: 'exact', head: true });";
    expect(bindingChecksError(objBad, 'recent')).toBe(false);

    const objGood = "  const { count: recent, error: e } = await supabase.from('hr_kiosk_attempts')\n    .select('*');";
    expect(bindingChecksError(objGood, 'recent')).toBe(true);

    const arrGood = "  const [{ count: bySender, error: e1 }, { count: byRecipient, error: e2 }] = await Promise.all([\n  ]);";
    expect(bindingChecksError(arrGood, 'bySender')).toBe(true);

    const arrBad = "  const [{ count: bySender }, { count: byRecipient }] = await Promise.all([\n  ]);";
    expect(bindingChecksError(arrBad, 'bySender')).toBe(false);

    // And the ceiling filter must let an informational count through untouched.
    // A ceiling whose NAME STARTS with the keyword is what the first matcher could not see, and it
    // was the loop breaker.
    expect(isCeiling('MAX_FLOW_RUNS_PER_MINUTE')).toBe(true);
    expect(isCeiling('CAREERS_MAX_PER_WINDOW')).toBe(true);
    expect(isCeiling('PIN_MAX_FAILS')).toBe(true);
    expect(isCeiling('existingRows')).toBe(false);
    expect(isCeiling('total')).toBe(false);
  });

  it('every count compared against a ceiling has checked its query error', () => {
    const found = offenders();
    expect(
      found.map((o) => `${o.file}:${o.line}  ${o.variable} vs ${o.ceiling} — ${o.reason}`),
      'These read a failed count as "nothing used" and let the caller through. The count is the '
      + 'enforcement decision: refuse when it cannot be answered, and keep the bookkeeping insert '
      + 'non-blocking. `real-estate-public.enforceLeadRateLimit` is the pattern.\n',
    ).toEqual([]);
  });
});
