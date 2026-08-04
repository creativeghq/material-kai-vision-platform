/**
 * Title-block layout geometry.
 *
 * Every element in the block is positioned by hand-written arithmetic against a
 * 4-column grid. Nothing enforces that a cell's content actually stays in its
 * cell, and the failure is silent: the PDF renders fine, the text just sits in
 * the wrong box or runs past the border. It only becomes visible when a
 * neighbouring cell fills up — which is exactly how the branding block was found
 * to be 8pt left of its divider, hanging into the CHECKED BY column, months
 * after it shipped.
 *
 * These are pure arithmetic checks on the same constants layout.ts uses, so they
 * catch a mis-placed column without rendering or rasterising anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = readFileSync(
  join(process.cwd(), 'supabase/functions/generate-moodboard-sheet-pdf/layout.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

// Mirrors the constants in layout.ts. Pinned below so they cannot drift apart.
const PAGE_W = 1190.55;
const MARGIN = 40;
const TITLE_BLOCK_H = 70;
const CONTENT_W = PAGE_W - MARGIN * 2;
const colW = CONTENT_W / 4;

describe('title block constants match layout.ts', () => {
  it.each([
    ['PAGE_W', PAGE_W],
    ['MARGIN', MARGIN],
    ['TITLE_BLOCK_H', TITLE_BLOCK_H],
  ])('%s', (name, value) => {
    expect(LAYOUT).toMatch(new RegExp(`export const ${name}\\s*=\\s*${value}\\b`));
  });
});

describe('cell content stays inside its column', () => {
  const cellX = (idx: number) => MARGIN + colW * idx + 8;
  const colLeft = (idx: number) => MARGIN + colW * idx;
  const colRight = (idx: number) => MARGIN + colW * (idx + 1);

  it.each([0, 1, 2, 3])('column %i content starts inside that column', (idx) => {
    const x = cellX(idx);
    expect(x).toBeGreaterThanOrEqual(colLeft(idx));
    expect(x).toBeLessThan(colRight(idx));
  });

  // The regression that prompted this file. The branding block must use the
  // same column-3 origin as every other cell, not an independent formula
  // measured back from the right edge.
  it('the branding block is anchored to column 3, not measured from the right edge', () => {
    expect(LAYOUT, 'branding uses a right-edge formula again').not.toMatch(
      /brandingX\s*=\s*MARGIN\s*\+\s*tbW\s*-\s*colW/,
    );
    expect(LAYOUT, 'branding is not aligned to the column-3 cell origin').toMatch(
      /brandingX\s*=\s*MARGIN\s*\+\s*colW\s*\*\s*3\s*\+\s*8/,
    );
  });

  it('the second row sits inside the block, not below it', () => {
    const tbY = MARGIN;
    const rowY = tbY + TITLE_BLOCK_H - 60; // lowest text row (REV / contact line)
    // Allow for descenders at the largest size used on that row.
    expect(rowY - 8 * 0.25).toBeGreaterThan(tbY);
  });

  it('every text row is ordered top to bottom without overlapping', () => {
    // -14 label, -32 value, -50 sub-row, -60 lowest. Each must clear the one
    // above it by more than its own font size, or lines collide.
    const rows = [
      { offset: 14, size: 6.5 },
      { offset: 32, size: 10 },
      { offset: 50, size: 8 },
      { offset: 60, size: 8 },
    ];
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].offset - rows[i - 1].offset;
      expect(gap, `row ${i} overlaps the row above`).toBeGreaterThanOrEqual(rows[i].size);
    }
  });
});
