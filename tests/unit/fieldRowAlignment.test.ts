import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).split('\\').join('/');

/** Offset just past the closing tag of the element opening at `tagEnd`. */
function balanced(src: string, tagEnd: number, tagName: string): number {
  let depth = 1;
  let i = tagEnd + 1;
  const openRe = new RegExp('<' + tagName + '[\\s>/]', 'g');
  const closeTag = '</' + tagName + '>';
  while (depth > 0 && i < src.length) {
    openRe.lastIndex = i;
    const nextOpen = openRe.exec(src);
    const nextClose = src.indexOf(closeTag, i);
    if (nextClose === -1) return i;
    if (nextOpen && nextOpen.index < nextClose) { depth++; i = nextOpen.index + 1; }
    else { depth--; i = nextClose + closeTag.length; }
  }
  return i;
}

interface Child { tag: string; start: number; end: number }

function directChildren(body: string): Child[] {
  const out: Child[] = [];
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf('<', i);
    if (lt === -1) break;
    const name = (body.slice(lt + 1).match(/^[A-Za-z][A-Za-z0-9.]*/) || [null])[0];
    if (!name) { i = lt + 1; continue; }
    const gt = body.indexOf('>', lt);
    if (gt === -1) break;
    if (body[gt - 1] === '/') { out.push({ tag: name, start: lt, end: gt + 1 }); i = gt + 1; continue; }
    const end = balanced(body, gt, name);
    out.push({ tag: name, start: lt, end });
    i = end;
  }
  return out;
}

interface Row { file: string; line: number; body: string; kids: Child[] }

function bottomAlignedRows(): Row[] {
  const rows: Row[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    const re = /items-end/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const open = src.lastIndexOf('<', m.index);
      const gt = src.indexOf('>', m.index);
      if (open === -1 || gt === -1) continue;
      const tagName = (src.slice(open + 1, gt).match(/^[A-Za-z][A-Za-z0-9.]*/) || [''])[0];
      if (!tagName) continue;
      const attrs = src.slice(open, gt);
      if (!/\bflex\b/.test(attrs) || /flex-col/.test(attrs)) continue;
      const rowEnd = balanced(src, gt, tagName);
      const body = src.slice(gt + 1, rowEnd);
      rows.push({
        file: rel(file),
        line: src.slice(0, open).split('\n').length,
        body,
        kids: directChildren(body),
      });
    }
  }
  return rows;
}

const CONTROL = /<(Input|SelectTrigger|Textarea|MoneyInput)/;
const HELP_TEXT = /<p[^>]*className="[^"]*text-(?:xs|\[1[01]px\])/;

/** Shrink-only. An entry claims the row has no common control baseline, not that it looks fine. */
const NO_SHARED_BASELINE = new Set([
  'src/pages/Inbox/InboxPage.tsx:1840', // chat composer: auto-growing Textarea + 40px send button
]);

const ROWS = bottomAlignedRows();

describe('bottom-aligned field rows', () => {
  it('finds rows to check', () => {
    expect(
      ROWS.length,
      'The detector found almost no `items-end` rows. If the utility was renamed or the JSX '
      + 'balancer broke, every case below passes vacuously — fix the detector, not this number.',
    ).toBeGreaterThan(50);
  });

  it('no column puts help text below its control', () => {
    const offenders: string[] = [];
    for (const row of ROWS) {
      for (const kid of row.kids) {
        if (kid.tag !== 'div') continue;
        const col = row.body.slice(kid.start, kid.end);
        const matches = [...col.matchAll(new RegExp(CONTROL.source, 'g'))];
        if (!matches.length) continue;
        const afterLastControl = col.slice(matches[matches.length - 1].index!);
        if (/<SelectContent|<DropdownMenuContent|<PopoverContent/.test(afterLastControl)) continue;
        if (HELP_TEXT.test(afterLastControl)) {
          offenders.push(
            `${row.file}:${row.line} — help text sits BELOW the control, so this column is taller `
            + 'than its siblings and items-end aligns the row to the hint instead of the inputs. '
            + 'Use HubFieldRow and pass the text as its `hint`.',
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no row bottom-aligns controls of different heights', () => {
    const offenders: string[] = [];
    for (const row of ROWS) {
      if (NO_SHARED_BASELINE.has(`${row.file}:${row.line}`)) continue;
      const heights = new Set<string>();
      for (const kid of row.kids) {
        const chunk = row.body.slice(kid.start, kid.end);
        if (!(CONTROL.test(chunk) || kid.tag === 'Button' || /<Button/.test(chunk))) continue;
        const explicit = chunk.match(/\bh-(?:7|8|9|10|11)\b/g);
        if (explicit) explicit.forEach((h) => heights.add(h));
        else if (/size="sm"/.test(chunk)) heights.add('h-8');
        else heights.add('h-9');
      }
      if (heights.size > 1) {
        offenders.push(
          `${row.file}:${row.line} — mixes ${[...heights].sort().join(' + ')} in one bottom-aligned `
          + 'row, so the shorter control sits low against the fields it belongs to. Give the row a '
          + 'single height (the design-system default is h-9 / 36px).',
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('HubFieldRow', () => {
  const source = readFileSync(join(SRC, 'components/core/hub/HubFieldRow.tsx'), 'utf8');

  it('gives a column nowhere to put help text', () => {
    const field = source.slice(source.indexOf('interface HubFieldProps'), source.indexOf('HubFieldActions'));
    expect(
      field,
      'A hint/description prop on the FIELD would let the primitive express the exact defect it '
      + 'exists to prevent. The hint belongs to the ROW.',
    ).not.toMatch(/\b(hint|description|help)\b/);
  });

  it('is exported from the hub barrel', () => {
    expect(readFileSync(join(SRC, 'components/core/hub/index.ts'), 'utf8')).toMatch(/HubFieldRow/);
  });

  it('has a specimen on /design-system', () => {
    expect(
      readFileSync(join(SRC, 'pages/DesignSystemPage.tsx'), 'utf8'),
      'A primitive nobody can look at is one people re-derive by hand instead.',
    ).toMatch(/<HubFieldRow/);
  });
});
