/** Ratchets modals-that-are-pages: `--write` lowers the baseline and refuses to raise it. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findModalsThatArePages } from './lib/modalAsPage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, '.github', 'modal-as-page-baseline.json');
const write = process.argv.includes('--write');
const force = process.argv.includes('--force');

const COMMENT = 'Modals whose body carries its own tabs or a table — a page wearing a modal. '
  + 'Score: 3 for section nav, 2 for a table, 2 for size. Only ever goes DOWN; lower it with '
  + 'npm run modals:audit -- --write.';

const found = findModalsThatArePages(root);
const total = Object.keys(found).length;

if (!existsSync(BASELINE)) {
  if (!write) {
    console.error(`missing ${BASELINE} — create it with \`npm run modals:audit -- --write\``);
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify({ _comment: COMMENT, total, files: found }, null, 2)}\n`);
  console.log(`baseline written: ${total} modal(s)`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseFiles = base.files ?? {};

const added = Object.keys(found).filter((f) => !(f in baseFiles));
const worse = Object.keys(found).filter((f) => f in baseFiles && found[f] > baseFiles[f]);
const fixed = Object.keys(baseFiles).filter((f) => !(f in found));

for (const f of Object.keys(found).sort((a, b) => found[b] - found[a])) {
  const was = baseFiles[f];
  const mark = was === undefined ? ' NEW' : found[f] > was ? '  UP' : found[f] < was ? 'down' : '    ';
  console.log(`${mark} ${String(found[f]).padStart(2)}  (baseline ${was ?? '—'})  ${f}`);
}
console.log(`\n${total} modal(s) carrying tabs or a table (baseline ${base.total ?? '—'}).`);
if (fixed.length > 0) console.log(`fixed since the baseline: ${fixed.join(', ')}`);

if (write) {
  if (!force && (added.length > 0 || worse.length > 0)) {
    console.error('\nrefusing to raise the baseline. Make the offender a page, or pass --force and '
      + 'say why in the commit.');
    for (const f of [...added, ...worse]) console.error(`  ${f}`);
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify({ _comment: COMMENT, total, files: found }, null, 2)}\n`);
  console.log(`baseline lowered to ${total} (was ${base.total ?? '—'}).`);
  process.exit(0);
}

if (added.length > 0 || worse.length > 0) {
  console.error('\nA modal gained tabs or a table. Build it as a page (a rail entry or a tab), or '
    + 'move the table out — see scripts/lib/modalAsPage.mjs for why.');
  for (const f of added) console.error(`  NEW  ${f}`);
  for (const f of worse) console.error(`  UP   ${f} (${baseFiles[f]} -> ${found[f]})`);
  process.exit(1);
}
console.log('within baseline.');
