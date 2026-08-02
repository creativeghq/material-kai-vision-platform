/**
 * Test-collection guard — "is every test we wrote actually RUN?"
 *
 * vitest.config.ts lists its `include` globs explicitly, one per tier. A test file written
 * anywhere else is silently never collected, and nothing says so: the suite stays green and the
 * file looks like coverage. This has bitten twice —
 *   • tests/security/** was missing from `include` for ~5 weeks (a #183 guard that never ran), and
 *   • three src/services/__tests__/ suites sat uncollected long enough to rot (Jest-era
 *     `jest.mock` in a vitest repo, asserting a column name that was itself the bug). Deleted
 *     along with the three dead services they covered.
 *
 * So: every test file in the repo must live under a collected tier, or be explicitly declared
 * here as running on a different runner (Playwright).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'build', '.next', 'playwright-report']);

/** Directories whose tests are run by a DIFFERENT runner, so vitest not collecting them is correct. */
const OTHER_RUNNERS: Array<{ prefix: string; runner: string }> = [
  { prefix: join('tests', 'e2e'), runner: 'Playwright (playwright.config.ts, `fe-smoke` CI job)' },
];

const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (TEST_RE.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

/** The `include` globs vitest is actually configured with, read from the config itself. */
function configuredTiers(): string[] {
  const cfg = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
  const block = cfg.slice(cfg.indexOf('include:'), cfg.indexOf(']', cfg.indexOf('include:')));
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('test collection', () => {
  const tiers = configuredTiers();
  const files = walk(ROOT);

  it('parses the vitest include globs (guards against a broken read)', () => {
    expect(tiers.length, 'no include globs parsed from vitest.config.ts').toBeGreaterThan(0);
    expect(files.length, 'no test files found — the walker is broken').toBeGreaterThan(5);
  });

  it('every test file is collected by vitest, or declared as another runner’s', () => {
    // A glob like 'tests/unit/**/*.test.ts' collects anything under 'tests/unit/'.
    const roots = tiers.map((g) => g.split('**')[0].replace(/\/$/, '').split('/').join(sep));

    const uncollected = files.filter((f) => {
      if (roots.some((r) => f.startsWith(r + sep))) return false;
      if (OTHER_RUNNERS.some((o) => f.startsWith(o.prefix + sep))) return false;
      return true;
    });

    expect(
      uncollected,
      `These test files are never run — vitest's include globs (${tiers.join(', ')}) don't ` +
        `cover them:\n  ${uncollected.join('\n  ')}\n` +
        `Move each under a collected tier, add a glob to vitest.config.ts, or (if another ` +
        `runner owns it) declare it in OTHER_RUNNERS in this file. Do not leave it: an ` +
        `uncollected test reads as coverage while asserting nothing.`,
    ).toEqual([]);
  });
});
