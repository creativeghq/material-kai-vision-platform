/**
 * Modals that are really pages: a dialog whose BODY carries its own section nav, or a table read
 * across. A modal is a fixed box — the Kind x VAT one hid four of its eight columns.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Every <DialogContent>…</DialogContent> / <SheetContent>…</SheetContent> body in a source file. */
export function modalBodies(src) {
  const out = [];
  for (const tag of ['DialogContent', 'SheetContent']) {
    let i = 0;
    for (;;) {
      const open = src.indexOf(`<${tag}`, i);
      if (open === -1) break;
      const close = src.indexOf(`</${tag}>`, open);
      if (close === -1) break;
      out.push(src.slice(open, close));
      i = close + tag.length;
    }
  }
  return out;
}

/** Score: 3 for section nav inside the modal, 2 for a table, 2/1 for size. */
export function scoreSource(src) {
  const bodies = modalBodies(src);
  let tabs = 0, tables = 0, biggest = 0;
  for (const b of bodies) {
    tabs += (b.match(/<TabsList|<HubTabNav/g) ?? []).length;
    tables += (b.match(/<table|<Table[ >]/g) ?? []).length;
    biggest = Math.max(biggest, b.split('\n').length);
  }
  const score = (tabs > 0 ? 3 : 0) + (tables > 0 ? 2 : 0) + (biggest > 150 ? 2 : biggest > 80 ? 1 : 0);
  return { tabs, tables, biggest, score };
}

export function findModalsThatArePages(root) {
  const files = execSync(`git -C "${root}" ls-files "src/**/*.tsx"`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const found = {};
  for (const rel of files) {
    // `ls-files` still lists a file deleted but not yet staged.
    if (!existsSync(`${root}/${rel}`)) continue;
    const src = readFileSync(`${root}/${rel}`, 'utf8');
    if (!src.includes('DialogContent') && !src.includes('SheetContent')) continue;
    const r = scoreSource(src);
    if (r.score >= 3) found[rel] = r.score;
  }
  return found;
}
