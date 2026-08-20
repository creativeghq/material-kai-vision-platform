/**
 * A button is not a pill. Neither is a tab, and neither is a chip.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `designSystem.test.ts` already asserts that the `button.tsx` PRIMITIVE is not `rounded-full` —
 * and that is where the check stopped. A call site can hand `className="rounded-full"` straight
 * past the primitive, and 716 of them did, across 214 files. So the rule was enforced in exactly
 * the one place nobody was going to break it, and unenforced everywhere it actually broke.
 *
 * The reason the platform cares is silhouette collision, which is why the rule names three things
 * and not one. In a dense data UI a pill button, a filled-pill tab and a status chip are the same
 * shape, so "where I am", "what I can press" and "what state this row is in" stop being
 * distinguishable at a glance. Radius is doing semantic work here; it is not decoration.
 *
 * WHAT IS FLAGGED
 * ---------------
 * `rounded-full` appearing in the OPENING TAG of a <Button>, <TabsTrigger>, <Badge>, or a raw
 * <button> that is CHIP-shaped (horizontally padded via px-*, and not square-sized).
 *
 * WHAT IS NOT, AND WHY THE EXEMPTION IS SHAPE-BASED RATHER THAN A LIST
 * -------------------------------------------------------------------
 * The design system permits `rounded-full` for "avatars, dots and status pips". Those have a
 * shape signature a scan can recognise and a maintainer cannot forget to update: a square-sized
 * control (`w-9 h-9`, `size-8`) or one padded uniformly (`p-1.5`) rather than horizontally. That
 * covers the colour swatch in the material picker, the ✕ on an attached image, the prev/next
 * arrows floating over a product photo, and the brush-size dots — all genuinely round, none of
 * them colliding with a tab or a chip.
 *
 * An allowlist of file paths would have rotted the first time one of those files was renamed; the
 * shape test cannot rot, because the shape IS the reason.
 *
 * RATCHET, NOT A WALL
 * -------------------
 * Anything still carrying the shape is recorded per-file in the baseline and the count may only go
 * DOWN. Regenerate ONLY after removing some:
 *
 *     WRITE_PILL_BASELINE=1 npx vitest run tests/unit/pillControls.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, '.github', 'pill-control-baseline.json');

/** Controls whose radius the design system pins to the squared scale. */
const PILLABLE = /<(Button|TabsTrigger|Badge|button)\b/g;

/** Horizontally padded — the chip/pill silhouette. */
const CHIP_SHAPED = /px-[\d.]+/;
/** Square-sized — an avatar / dot / pip, which is allowed to be round. */
const PIP_SHAPED = /\bw-[\d.]+\s+h-[\d.]+|\bh-[\d.]+\s+w-[\d.]+|\bsize-[\d.]+/;

/** End of the opening tag, honouring {…} nesting and string literals. */
function openingTagEnd(src: string, start: number): number {
  let depth = 0;
  let i = start;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
    i++;
  }
  return -1;
}

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

const rel = (p: string) => relative(ROOT, p).split(sep).join('/');

/** Files rendering a pill-shaped button / tab / chip, and how many. */
export function findPillControls(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of walk(SRC)) {
    const raw = readFileSync(file, 'utf8');
    const src = blankComments(raw.indexOf('\r') === -1 ? raw : raw.replace(/\r\n/g, '\n'));
    if (!src.includes('rounded-full')) continue;

    let hits = 0;
    let m: RegExpExecArray | null;
    PILLABLE.lastIndex = 0;
    while ((m = PILLABLE.exec(src))) {
      const end = openingTagEnd(src, m.index);
      if (end === -1) continue;
      const tag = src.slice(m.index, end + 1);
      if (!tag.includes('rounded-full')) continue;
      // A raw <button> is only in scope when it is chip-shaped; the pip shapes are permitted.
      if (m[1] === 'button' && (!CHIP_SHAPED.test(tag) || PIP_SHAPED.test(tag))) continue;
      hits++;
    }
    if (hits > 0) out[rel(file)] = hits;
  }
  return out;
}

type Baseline = { total: number; files: Record<string, number> };
const readBaseline = (): Baseline => JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

if (process.env.WRITE_PILL_BASELINE === '1') {
  const files = findPillControls();
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  writeFileSync(BASELINE, JSON.stringify({ total, files }, null, 2) + '\n');
}

describe('buttons, tabs and chips are rectangular', () => {
  const offenders = findPillControls();

  it('the baseline exists', () => {
    expect(
      existsSync(BASELINE),
      'missing .github/pill-control-baseline.json — regenerate with WRITE_PILL_BASELINE=1',
    ).toBe(true);
  });

  it('no NEW pill-shaped button, tab or chip', () => {
    const base = readBaseline();
    const added = Object.keys(offenders)
      .filter((f) => !(f in base.files))
      .map((f) => `${f}  (${offenders[f]})`);

    expect(
      added,
      'These render a pill-shaped button / tab / chip. Drop the `rounded-full` — the primitives ' +
        'already carry the right radius (Button: rounded-sm, Badge: rounded-xs).\n\n' +
        'In a dense data UI a pill button, a filled-pill tab and a status chip are the SAME ' +
        'silhouette, so "where I am", "what I can press" and "what state this row is in" stop ' +
        'being tellable apart. Radius is semantic here.\n\n' +
        '`rounded-full` remains correct for avatars, dots and status pips — a square-sized ' +
        '(w-8 h-8 / size-8) or uniformly padded (p-1.5) control is not flagged at all.\n\n' +
        added.join('\n'),
    ).toEqual([]);
  });

  it('an existing file never grows more of them', () => {
    const base = readBaseline();
    const grown = Object.entries(offenders)
      .filter(([f, n]) => f in base.files && n > base.files[f])
      .map(([f, n]) => `${f}: ${base.files[f]} → ${n}`);
    expect(grown, 'These files added pill-shaped controls:\n' + grown.join('\n')).toEqual([]);
  });

  it('the baseline is only ever ratcheted down', () => {
    const base = readBaseline();
    const total = Object.values(offenders).reduce((a, b) => a + b, 0);
    expect(
      total,
      `Baseline records ${base.total} but the tree has ${total}. If you FIXED some, lower the ` +
        'numbers (or regenerate with WRITE_PILL_BASELINE=1).',
    ).toBeLessThanOrEqual(base.total);
  });

  it('baseline entries that are already fixed have been removed from it', () => {
    const base = readBaseline();
    const stale = Object.keys(base.files).filter((f) => !(f in offenders));
    expect(
      stale,
      'These files no longer render a pill control — drop them from the baseline so it keeps ' +
        'describing reality:\n' + stale.join('\n'),
    ).toEqual([]);
  });
});
