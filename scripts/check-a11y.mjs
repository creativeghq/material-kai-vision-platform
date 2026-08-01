#!/usr/bin/env node
/**
 * Accessibility ratchet.
 *
 * WHY THIS EXISTS
 * ---------------
 * `eslint-plugin-jsx-a11y` has been a dependency and a registered plugin for a long time, with
 * every rule set to `'off'` under a comment reading "Accessibility - off for now". Audit #302
 * found the predictable result: 1,325 unlabelled inputs, 280 unnamed icon buttons, 72 mouse-only
 * handlers — and **every one of them was added after the plugin was installed**. Nothing stopped
 * the counts rising, so they rose.
 *
 * Turning the rules straight to `error` would fail the build on 413 pre-existing warnings and be
 * switched off again within a day. So this does what the edge-function gate does: record today's
 * counts and fail only when one RISES. An unbounded backlog becomes a monotonically shrinking
 * one, and the build stays green today.
 *
 * PER-RULE, NOT PER-FILE
 * ----------------------
 * Deliberately coarser than `check-edge-functions.mjs`. A per-file baseline for 413 warnings
 * across ~200 files churns on every rename and refactor, and a baseline that churns gets
 * regenerated reflexively — which silently launders new violations in with the noise. Per-rule
 * counts are stable under refactoring and still let you drive one rule at a time to zero, then
 * promote it from `warn` to `error` in eslint.config.js and delete its baseline entry.
 *
 * Regenerate:  node scripts/check-a11y.mjs --write-baseline
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const BASELINE = join(ROOT, '.github', 'a11y-baseline.json');
const WRITE = process.argv.includes('--write-baseline');
const PREFIX = 'jsx-a11y/';

/** Run eslint to a temp JSON file. `-o` avoids stdout buffering limits on a large report. */
function lint() {
  const out = join(tmpdir(), `a11y-lint-${process.pid}.json`);
  const res = spawnSync('npx', ['eslint', '.', '--format', 'json', '-o', out], {
    cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(out)) {
    console.error('FAIL: eslint produced no report.');
    console.error((res.stderr || res.stdout || '').slice(0, 2000));
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(out, 'utf8'));
  rmSync(out, { force: true });
  return report;
}

function countByRule(report) {
  const counts = {};
  let files = 0;
  for (const f of report) {
    let touched = false;
    for (const m of f.messages ?? []) {
      const rule = m.ruleId ?? '';
      if (!rule.startsWith(PREFIX)) continue;
      counts[rule] = (counts[rule] ?? 0) + 1;
      touched = true;
    }
    if (touched) files += 1;
  }
  return { counts, files };
}

function main() {
  const report = lint();
  // A zero-length report means eslint matched nothing — a config or cwd problem, not a clean
  // codebase. Treat it as failure rather than writing an all-zero baseline that can never fail.
  if (!Array.isArray(report) || report.length === 0) {
    console.error('FAIL: eslint linted 0 files — wrong cwd, or the config stopped matching.');
    process.exit(1);
  }

  const { counts, files } = countByRule(report);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(counts).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

  console.log(`Linted ${report.length} files. ${total} jsx-a11y warnings across ${files} files.\n`);
  for (const [rule, n] of sorted) console.log(`  ${rule.padEnd(46)} ${n}`);

  if (WRITE) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify({
      _comment:
        'Per-rule jsx-a11y warning counts. CI fails when a count RISES. Lower them as you fix ' +
        'things and regenerate: node scripts/check-a11y.mjs --write-baseline. When a rule ' +
        'reaches 0, promote it to "error" in eslint.config.js and delete its entry here.',
      total,
      rules: Object.fromEntries(sorted),
    }, null, 2)}\n`);
    console.log(`\nWrote baseline: ${total} warnings -> .github/a11y-baseline.json`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error('\nFAIL: no baseline. Create it with --write-baseline.');
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const baseRules = base.rules ?? {};

  // A rule absent from the baseline is treated as 0 — so newly ENABLED rules must start clean
  // or be baselined deliberately. That is the intended friction.
  const worse = sorted.filter(([rule, n]) => n > (baseRules[rule] ?? 0));
  const better = Object.entries(baseRules).filter(([rule, n]) => (counts[rule] ?? 0) < n);

  console.log(`\nTotal: ${total} (baseline ${base.total ?? 0}).`);

  if (worse.length > 0) {
    console.error('\nFAIL: accessibility warnings increased:');
    for (const [rule, n] of worse) console.error(`  ${rule}: ${n} (baseline ${baseRules[rule] ?? 0})`);
    console.error('\nFix them, or if a rise is genuinely justified say why and regenerate the ' +
      'baseline in the same commit.');
    process.exit(1);
  }

  if (better.length > 0) {
    console.log(`\n${better.length} rule(s) improved — regenerate the baseline to lock the gain in:`);
    for (const [rule, n] of better) console.log(`  ${rule}: ${counts[rule] ?? 0} (baseline ${n})`);
  }
  console.log('\nOK: no new accessibility warnings.');
}

main();
