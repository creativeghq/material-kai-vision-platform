/**
 * The tile counter's arithmetic, and the rounding leak underneath it (#436).
 *
 * 42 m² of a tile that comes 1.44 m² to a box is 33 boxes and 47.52 m². Every counter does that
 * mentally; nobody's software advertises doing it. The uplift has to be VISIBLE — a customer
 * comparing quotes needs to see 42 m² + 10%, not 46.2 m² with no explanation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { roomArea, totalArea, describeRooms, round4 } from '@/modules/finance/tileQuantity';
import { hasVisibleUplift, type TileQuantity } from '@/modules/finance/approvalRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const geometry = read('src/modules/finance/tileQuantity.ts');
const service = read('src/modules/finance/services/tileQuantityService.ts');
const dialog = read('src/modules/finance/components/TileQuantityDialog.tsx');
const quoteList = read('src/modules/quotes/components/QuoteItemsList.tsx');

const q = (over: Partial<TileQuantity>): TileQuantity =>
  ({ status: 'partial_allowed', reason: '', ...over });

describe('a room that cannot be measured is reported, not counted as nothing', () => {
  it('an unusable dimension is null, never 0', () => {
    // A zero area reads as "this room needs no tiles", which is a quieter wrong answer than
    // "you have not told me the size".
    expect(roomArea({ length: 0, width: 3 })).toBeNull();
    expect(roomArea({ length: 4, width: -1 })).toBeNull();
    expect(roomArea({ length: Number.NaN, width: 3 })).toBeNull();
    expect(roomArea({ length: 4, width: 3, count: 0 })).toBeNull();
  });

  it('the total says how many it could not use', () => {
    const t = totalArea([
      { length: 4.2, width: 3.6 },
      { length: 0, width: 2 },
      { length: 2, width: 1.5, count: 2 },
    ]);
    expect(t.area).toBe(round4(4.2 * 3.6 + 2 * 1.5 * 2));
    expect(t.unusable).toBe(1);
  });
});

describe('the units are the ones a tape measure gives', () => {
  it('centimetres and millimetres convert', () => {
    expect(roomArea({ length: 420, width: 360, unit: 'cm' })).toBe(round4(4.2 * 3.6));
    expect(roomArea({ length: 4200, width: 3600, unit: 'mm' })).toBe(round4(4.2 * 3.6));
  });

  it('a count multiplies the room', () => {
    expect(roomArea({ length: 2, width: 1.5, count: 3 })).toBe(9);
  });
});

describe('what was measured is written down', () => {
  it('the description can be read back against the tape', () => {
    // A quantity nobody can re-derive a month later is a quantity nobody can check.
    expect(describeRooms([
      { length: 4.2, width: 3.6, label: 'kitchen' },
      { length: 2, width: 1.5, count: 2, unit: 'm' },
    ])).toBe('kitchen: 4.2 × 3.6 m; 2 × 1.5 m × 2');
  });
});

describe('the allowance and the box rounding are derived ONCE, in SQL', () => {
  it('the geometry module does no wastage and no box maths', () => {
    // Two derivations of "how much tile is coming" is anti-regression rule 1 wearing a hat: the
    // screen and the order would be free to disagree.
    expect(geometry).not.toMatch(/wastage|1\.1\b|ceil|boxes/i);
    expect(service).toContain('tile_line_quantity');
  });

  it('the dialog asks the server rather than multiplying by 1.1', () => {
    expect(dialog).toContain('tileQuantityService.forLine');
    expect(dialog).not.toMatch(/\*\s*1\.1|\/\s*1\.44|Math\.ceil\(/);
  });
});

describe('the uplift is shown as an uplift', () => {
  it('a rounded line always has something to explain', () => {
    expect(hasVisibleUplift(q({ status: 'rounded_to_packs' }))).toBe(true);
    expect(hasVisibleUplift(q({ status: 'partial_allowed', wastage_percent: 10 }))).toBe(true);
    expect(hasVisibleUplift(q({ status: 'partial_allowed', wastage_percent: 0 }))).toBe(false);
    expect(hasVisibleUplift(q({ status: 'partial_allowed', wastage_percent: null }))).toBe(false);
    expect(hasVisibleUplift(null)).toBe(false);
  });

  it('the dialog prints the derivation`s own sentence', () => {
    expect(dialog).toContain('quantity.reason');
    expect(dialog).toMatch(/not folded into the quantity/);
  });

  it('an unreadable packing is unknown, not "no rounding needed"', () => {
    expect(dialog).toMatch(/box rounding is unknown/);
  });
});

describe('it is reachable where the counter actually works', () => {
  it('the quote line offers it', () => {
    expect(quoteList).toContain('TileQuantityDialog');
    expect(quoteList).toContain('calcFor');
  });

  it('the measurement is written onto the line, not thrown away', () => {
    expect(quoteList).toMatch(/dimensions: note/);
  });
});
