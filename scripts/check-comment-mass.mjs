#!/usr/bin/env node
/**
 * Comment mass: how much of the repo is comment, by area, against a down-only baseline.
 *
 * The per-comment budget caps one comment and nothing caps how many there are, which is how the
 * platform reached 12.2% comment while passing every check. This is the other half.
 *
 * `--write` lowers the baseline to what the tree now holds. It REFUSES to raise it.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureCommentMass } from './lib/commentBudget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(ROOT, '.github', 'comment-mass-baseline.json');

const write = process.argv.includes('--write');
const force = process.argv.includes('--force');

const { total, codeLines, areas } = await measureCommentMass(ROOT);
const pct = (100 * total) / codeLines;

if (!existsSync(BASELINE)) {
  if (!write) {
    console.error('missing .github/comment-mass-baseline.json — create it with `npm run comments:mass -- --write`');
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify({ total, areas }, null, 2)}\n`);
  console.log(`wrote baseline: ${total} comment lines across ${Object.keys(areas).length} areas`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const risen = Object.entries(areas)
  .filter(([area, n]) => n > (base.areas[area] ?? 0))
  .sort((a, b) => b[1] - a[1]);

console.log(`comment lines: ${total} of ${codeLines} (${pct.toFixed(1)}% of the repo, ~${Math.round(total * 11 / 1000)}k tokens)`);
console.log(`baseline:      ${base.total}\n`);

for (const [area, n] of Object.entries(areas).sort((a, b) => b[1] - a[1])) {
  const was = base.areas[area] ?? 0;
  const delta = n - was;
  const mark = delta > 0 ? '  UP' : delta < 0 ? 'down' : '    ';
  console.log(`${mark} ${String(n).padStart(6)}  (baseline ${String(was).padStart(6)}${delta ? `, ${delta > 0 ? '+' : ''}${delta}` : ''})  ${area}`);
}

if (write) {
  if (risen.length && !force) {
    console.error(`\nREFUSING to raise the baseline. ${risen.length} area(s) grew — delete a comment instead of recording it.`);
    console.error('If a genuinely new area of the product landed, re-run with --force and say so in the commit.');
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify({ total, areas }, null, 2)}\n`);
  console.log(`\nbaseline lowered to ${total} (was ${base.total}).`);
  process.exit(0);
}

if (risen.length) {
  console.error(`\n${risen.length} area(s) over baseline. Delete a comment, or lower another area to pay for it.`);
  process.exit(1);
}
console.log('\nwithin baseline.');
