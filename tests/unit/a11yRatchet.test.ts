/**
 * Guards the accessibility ratchet itself.
 *
 * `npm run lint:a11y` is the real gate (it runs eslint, which is far too slow for the unit
 * suite). This test guards the things that would quietly disable that gate: rules flipped back
 * to `off`, a baseline edited upward, or a rule promoted to `error` while still carrying
 * violations.
 *
 * Background: every jsx-a11y rule sat at `'off'` under a comment reading "Accessibility - off
 * for now" while the plugin was installed and registered. Audit #302 found 1,325 unlabelled
 * inputs and 280 unnamed icon buttons — every one added AFTER the plugin landed. The failure was
 * never a missing tool; it was a tool switched off. So the thing worth testing is that it stays
 * switched on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONFIG = join(ROOT, 'eslint.config.js');
const BASELINE = join(ROOT, '.github', 'a11y-baseline.json');
const SCRIPT = join(ROOT, 'scripts', 'check-a11y.mjs');

type Baseline = { total: number; rules: Record<string, number> };

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

describe('accessibility ratchet', () => {
  it('the runner and baseline both exist', () => {
    expect(existsSync(SCRIPT), 'scripts/check-a11y.mjs is missing').toBe(true);
    expect(existsSync(BASELINE), 'baseline missing — regenerate with --write-baseline').toBe(true);
  });

  it('no jsx-a11y rule has been switched back off', () => {
    const cfg = readFileSync(CONFIG, 'utf8');
    const offRules = [...cfg.matchAll(/'(jsx-a11y\/[a-z-]+)'\s*:\s*'off'/g)].map((m) => m[1]);
    expect(
      offRules,
      'These a11y rules were set back to "off". That is how the platform accumulated 1,325 ' +
      'unlabelled inputs and 280 unnamed icon buttons in the first place — the plugin was ' +
      'installed and disabled. Use "warn" and let the baseline ratchet absorb the existing ' +
      'count instead.\n' + offRules.join('\n'),
    ).toEqual([]);
  });

  it('baseline counts are non-negative integers and the total agrees', () => {
    const base = readBaseline();
    const bad = Object.entries(base.rules).filter(([, n]) => !Number.isInteger(n) || n < 0);
    expect(bad, 'baseline contains non-integer or negative counts').toEqual([]);

    const sum = Object.values(base.rules).reduce((a, b) => a + b, 0);
    expect(
      base.total,
      `baseline total (${base.total}) does not match the sum of its rules (${sum}) — ` +
      'regenerate with: node scripts/check-a11y.mjs --write-baseline',
    ).toBe(sum);
  });

  /**
   * `npm run lint --max-warnings N` and this baseline count the SAME eslint run, so N has to
   * account for the a11y backlog or the build is red for warnings the a11y ratchet already owns.
   * That is exactly what happened: enabling the rules as `warn` added ~408 warnings on top of a
   * cap set at 316, and `unit-tests` went red on every commit from that day — while
   * `npm run lint:a11y`, the gate that actually owns those warnings, was never wired into CI at
   * all. A permanently-red gate teaches people to ignore it.
   *
   * So N is DERIVED, not chosen: the a11y backlog (ratcheted per-rule, here) plus the non-a11y
   * debt below. Neither term may rise. When you fix a11y issues and regenerate the baseline, this
   * test fails until N comes down with it — the cap cannot be left slack for new warnings to hide
   * in, and it cannot be raised without moving one of two numbers that are each guarded.
   */
  it('the lint budget is the a11y baseline plus the declared non-a11y debt', () => {
    /**
     * Remaining `no-unused-vars` warnings, all of which need a human.
     *
     * 310 -> 58 on 2026-08-02: 172 unused imports deleted, 52 unused args/catch-bindings given
     * the `_` prefix the rule sanctions, and 38 dead locals removed via the TypeScript AST —
     * but only where the initializer was provably side-effect-free (a literal, an arrow, or a
     * pure hook). `const x = doTheThing()` was deliberately left: deleting the binding deletes
     * the call.
     *
     * What is left is two shapes, both of which can be REAL BUGS rather than mere untidiness,
     * which is exactly why they are not machine-removable:
     *   - "sibling still used": half a `useState` pair, e.g. a `setSearchQuery` nobody calls —
     *     a filter that can never change is an inert control, not dead code.
     *   - a binding whose initializer performs work whose result is then discarded.
     *
     * DRIVE THIS TO ZERO. NEVER RAISE IT.
     */
    const NON_A11Y_DEBT = 58;

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const cap = /--max-warnings\s+(\d+)/.exec(pkg.scripts.lint ?? '')?.[1];
    expect(cap, '`npm run lint` must carry an explicit --max-warnings budget').toBeTruthy();

    const expected = readBaseline().total + NON_A11Y_DEBT;
    expect(
      Number(cap),
      `--max-warnings is ${cap} but should be ${expected} = ${readBaseline().total} (a11y ` +
      `baseline) + ${NON_A11Y_DEBT} (non-a11y debt). If you fixed a11y issues and regenerated ` +
      'the baseline, lower --max-warnings by the same amount. If you fixed non-a11y warnings, ' +
      'lower NON_A11Y_DEBT here and --max-warnings together. Never raise either to go green.',
    ).toBe(expected);
  });

  /**
   * A rule at 0 should be promoted to `error`, and a rule promoted to `error` must be at 0 —
   * otherwise the build is already broken. This keeps the two files honest about each other.
   */
  it('rules promoted to error carry no baselined violations', () => {
    const cfg = readFileSync(CONFIG, 'utf8');
    const base = readBaseline();
    const errorRules = [...cfg.matchAll(/'(jsx-a11y\/[a-z-]+)'\s*:\s*'error'/g)].map((m) => m[1]);
    expect(errorRules.length, 'no a11y rule has reached "error" yet').toBeGreaterThan(0);

    const contradictions = errorRules.filter((r) => (base.rules[r] ?? 0) > 0);
    expect(
      contradictions,
      'These rules are set to "error" but the baseline still records violations for them, so ' +
      'the build cannot be green. Either fix the remaining sites or move the rule back to ' +
      '"warn".\n' + contradictions.join('\n'),
    ).toEqual([]);
  });
});
