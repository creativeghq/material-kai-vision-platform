/**
 * Extract §8.3 "Κατηγορία Αιτίας Εξαίρεσης ΦΠΑ", column «Αιτία Εξαίρεσης (ν. 5144/2024)», from
 * AADE's ERP spec into `src/lib/mydataExemptionGrounds.generated.json`.
 * The spec PDF is gitignored (4 MB), so a guard that only reads it is inert in CI — which is
 * exactly where a wrong legal citation would otherwise ship. This commits the table; where the
 * PDF IS present, tests/unit/mydataExemptionCategories.test.ts checks this file against it.
 * Run: npm run mydata:exemptions
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SPEC = join(
  process.cwd(), 'src', 'modules', 'myaade', 'AadeSpec', 'v2.0.2', 'ERP_v2.0.2.pdf',
);
const OUT = join(process.cwd(), 'src', 'lib', 'mydataExemptionGrounds.generated.json');

if (!existsSync(SPEC)) {
  console.error(`No spec at ${SPEC}. This file is gitignored — fetch it from AADE before regenerating.`);
  process.exit(1);
}

const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s+(?=[.,])/g, '').trim();

// Both cells of a row share a baseline, and the code digit is vertically CENTRED, so rows are
// delimited by the opening phrase of the ν.5144/2024 cell and codes assigned by position.
const NEW_COLUMN_X = 297;
const OPENERS = ['Χωρίς ΦΠΑ', 'ΦΠΑ εμπεριεχόμενος', 'Λοιπές Εξαιρέσεις'];

/** A space goes in only where there is a horizontal GAP: the PDF splits mid-word too. */
function joinRun(run) {
  let out = '';
  let end = -Infinity;
  for (const it of run.sort((a, b) => a.x - b.x)) {
    if (out && it.x - end > 1) out += ' ';
    out += it.s;
    end = it.x + it.w;
  }
  return out;
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(SPEC)), useSystemFonts: false,
}).promise;

const cells = [];
let inTable = false;
for (let p = 1; p <= doc.numPages && cells.length < 31; p++) {
  const content = await (await doc.getPage(p)).getTextContent();
  const items = content.items.filter((i) => i.str && i.str.trim());
  // Anchor on the table's own header cell, not the §8.3 heading — that also appears in the
  // table of contents, and entering there yields an empty parse.
  if (!inTable && !items.some((i) => i.str.includes('5144/2024'))) continue;
  const byY = new Map();
  for (const it of items) {
    const y = Math.round(it.transform[5]);
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push({ x: it.transform[4], w: it.width ?? 0, s: it.str });
  }
  for (const y of [...byY.keys()].sort((a, b) => b - a)) {
    const row = byY.get(y).sort((a, b) => a.x - b.x);
    if (!inTable) {
      if (row.some((w) => w.s.includes('5144/2024'))) inTable = true;
      continue;
    }
    const text = norm(joinRun(row.filter((w) => w.x >= NEW_COLUMN_X)));
    // The running header, the column header and the page number all sit in this band.
    if (!text || text.startsWith('Αιτία Εξαίρεσης') || /^\d{1,3}$/.test(text)) continue;
    if (OPENERS.some((o) => text.startsWith(o))) cells.push(text);
    else if (cells.length) cells[cells.length - 1] = norm(`${cells[cells.length - 1]} ${text}`);
    if (cells.length === 31 && /\(IOSS\)$/.test(cells[30])) break;
  }
}

if (cells.length !== 31) {
  console.error(`Parsed ${cells.length} grounds, expected 31 — the table shape changed. Not writing.`);
  process.exit(1);
}

const grounds = Object.fromEntries(cells.map((g, i) => [String(i + 1), g]));
writeFileSync(OUT, `${JSON.stringify({
  _source: "src/modules/myaade/AadeSpec/v2.0.2/ERP_v2.0.2.pdf 8.3, column 'Aitia Exairesis (n. 5144/2024)'",
  _why: 'The spec PDF is gitignored, so CI has no copy and a test that only reads it is inert there. '
    + 'Regenerate with `npm run mydata:exemptions` wherever the PDF is present; this file is the '
    + 'authority CI compares against.',
  grounds,
}, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT} — 31 grounds.`);
