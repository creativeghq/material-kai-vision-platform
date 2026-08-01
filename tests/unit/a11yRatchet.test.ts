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
