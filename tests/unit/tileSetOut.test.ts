import { describe, it, expect } from 'vitest';

import { buildTileFloorPlan, DEFAULT_TILE_FLOOR, tileSetOut } from '../../src/lib/installation/tileFloorTemplate';
import type { Pattern } from '../../src/lib/surfaceRenderer/patternVocabulary';

const setOut = (w: number, d: number, tl: number, tw: number, pattern: Pattern, stated = true) =>
  tileSetOut(buildTileFloorPlan({ ...DEFAULT_TILE_FLOOR, areaWidthM: w, areaDepthM: d, tileLengthMm: tl, tileWidthMm: tw, pattern }), { sizesStated: stated });
const check = (s: ReturnType<typeof setOut>, rule: string) => s.checks.find((c) => c.rule === rule)!;

describe('tiling setting out', () => {
  it('balances the edge pieces on opposite walls and passes when no cut is thin', () => {
    const s = setOut(3.1, 2.4, 600, 600, 'stack');
    expect(s.edges.left).toBe(s.edges.right);
    expect(s.edges.top).toBe(s.edges.bottom);
    expect(s.edges.left).toBeGreaterThan(200);
    expect(s.checks.every((c) => c.ok)).toBe(true);
  });

  it('flags a cut under a third of the tile and lists it in the cut schedule', () => {
    const s = setOut(3.1, 2.17, 1200, 600, 'offset_1_3');
    const c = check(s, 'No Cut Under a Third of a Tile');
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/narrowest 341 mm/);
    expect(s.cuts.some((g) => g.thin && g.xMm === 341)).toBe(true);
    expect(s.full + s.cuts.reduce((n, g) => n + g.count, 0)).toBeGreaterThan(s.full);
  });

  it('does not pass an angled pattern it cannot measure', () => {
    const s = setOut(3, 3, 600, 600, 'diagonal');
    expect(s.axisAligned).toBe(false);
    expect(check(s, 'No Cut Under a Third of a Tile').ok).toBe(false);
    expect(s.edges.left).toBeNull();
  });

  it('fails while the room sizes are assumed', () => {
    expect(check(setOut(3, 2.4, 600, 600, 'stack', false), 'Room Sizes Stated by a Person').ok).toBe(false);
  });
});
