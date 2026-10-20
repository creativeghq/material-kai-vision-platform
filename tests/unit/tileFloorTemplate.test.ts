import { describe, expect, it } from 'vitest';

import {
  buildTileFloorPlan,
  DEFAULT_TILE_FLOOR,
  groutKgPerM2,
  progressCounts,
  sceneStateAt,
  type TileFloorParams,
} from '@/lib/installation/tileFloorTemplate';

const plan = (over: Partial<TileFloorParams> = {}) => buildTileFloorPlan({ ...DEFAULT_TILE_FLOOR, ...over });

describe('tile floor layout', () => {
  it('covers the tiled area exactly, row by row and down the rows', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11, tileLengthMm: 450, tileWidthMm: 300, pattern: 'offset_1_3' });
    const j = p.params.jointMm;
    const rows = new Map<number, typeof p.pieces>();
    for (const pc of p.pieces) rows.set(pc.row, [...(rows.get(pc.row) ?? []), pc]);
    for (const row of rows.values()) {
      const width = row.reduce((s, pc) => s + pc.visible!.lx, 0) + (row.length - 1) * j;
      expect(width).toBeCloseTo(p.innerWidthMm, 6);
    }
    const depths = [...rows.values()].map((r) => r[0].visible!.lz);
    expect(depths.reduce((s, d) => s + d, 0) + (depths.length - 1) * j).toBeCloseTo(p.innerDepthMm, 6);
  });

  it('starts from the centre, so a grid has matching cuts at opposite walls', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11 });
    const first = Math.min(...p.pieces.map((pc) => pc.row));
    const row0 = p.pieces.filter((pc) => pc.row === first).sort((a, b) => a.cx - b.cx);
    expect(row0[0].visible!.lx).toBeCloseTo(row0[row0.length - 1].visible!.lx, 6);
  });

  it('lays every full tile before any cut', () => {
    const p = plan({ areaWidthM: 3.37 });
    const firstCut = p.pieces.find((pc) => pc.cut)!.order;
    expect(p.pieces.filter((pc) => !pc.cut).every((pc) => pc.order < firstCut)).toBe(true);
    expect(p.quantities.fullTiles + p.quantities.cutTiles).toBe(p.pieces.length);
  });

  it('puts a spacer at every grid crossing and where each joint meets a wall', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11 });
    const rows = new Set(p.pieces.map((pc) => pc.row)).size;
    const cols = p.pieces.filter((pc) => pc.row === Math.min(...p.pieces.map((x) => x.row))).length;
    expect(p.quantities.spacers).toBe((rows + 1) * (cols - 1) + 2 * (rows - 1));
  });

  it('skips a laying step with nothing to lay', () => {
    const p = plan({ areaWidthM: 3, areaDepthM: 0.55 });
    expect(p.quantities.fullTiles).toBe(0);
    expect(p.steps.map((s) => s.key)).not.toContain('lay_full');
    const end = sceneStateAt(p, p.steps.findIndex((s) => s.key === 'lay_cuts'), 1);
    expect(progressCounts(p, end).spacersPlaced).toBe(p.quantities.spacers);
  });

  it('spaces the joints of a single-row floor', () => {
    const p = plan({ areaWidthM: 3, areaDepthM: 0.55 });
    expect(new Set(p.pieces.map((pc) => pc.row)).size).toBe(1);
    expect(p.quantities.spacers).toBe(2 * (p.pieces.length - 1));
  });
});

describe('tile floor quantities', () => {
  it('never orders fewer tiles than the layout cuts from', () => {
    const p = plan({ areaWidthM: 1.3, areaDepthM: 1.3 });
    expect(p.pieces).toHaveLength(9);
    expect(p.quantities.tilesFromLayout).toBe(9);
    expect(p.quantities.tilesToBuy).toBeGreaterThanOrEqual(9);
  });

  it('reuses an offcut from one row in the next on an offset pattern', () => {
    const p = plan({ areaWidthM: 2, areaDepthM: 1.2, tileLengthMm: 600, tileWidthMm: 300, pattern: 'offset_1_2' });
    const { fullTiles, cutTiles, tilesFromLayout } = p.quantities;
    expect(cutTiles).toBeGreaterThan(0);
    expect(tilesFromLayout).toBeLessThan(fullTiles + cutTiles);
    expect(tilesFromLayout).toBeGreaterThan(fullTiles);
  });

  it('uses the manufacturers grout formula', () => {
    expect(groutKgPerM2(600, 600, 10, 3)).toBeCloseTo(0.16, 6);
    expect(plan().quantities.groutKg).toBeCloseTo(7.2 * 0.16, 6);
  });

  it('adds back-buttering to the adhesive', () => {
    expect(plan({ backButter: true }).quantities.adhesiveKg).toBeGreaterThan(plan({ backButter: false }).quantities.adhesiveKg);
  });
});

describe('tile floor issues and steps', () => {
  it('refuses an impossible input with no steps to show', () => {
    const p = plan({ tileLengthMm: 10 });
    expect(p.issues.some((i) => i.level === 'error')).toBe(true);
    expect(p.steps).toHaveLength(0);
    expect(p.pieces).toHaveLength(0);
  });

  it('refuses a floor too large to draw', () => {
    const p = plan({ areaWidthM: 8, areaDepthM: 8, tileLengthMm: 50, tileWidthMm: 50 });
    expect(p.issues.some((i) => i.level === 'error' && /pieces/.test(i.message))).toBe(true);
  });

  it('warns about a half offset on large tiles', () => {
    expect(plan({ pattern: 'offset_1_2' }).issues.some((i) => i.level === 'warning' && /offset/.test(i.message))).toBe(true);
    expect(plan({ pattern: 'offset_1_3' }).issues.some((i) => /offset/.test(i.message))).toBe(false);
  });

  it('drops the priming and back-buttering steps when they are switched off', () => {
    const keys = plan({ prime: false, backButter: false }).steps.map((s) => s.key);
    expect(keys).not.toContain('prime');
    expect(keys).not.toContain('back_butter');
    expect(plan({ prime: true, backButter: true }).steps.map((s) => s.key)).toEqual(
      expect.arrayContaining(['prime', 'back_butter']),
    );
  });
});

describe('tile floor scene state', () => {
  it('has every full tile down and no cut at the end of laying the field', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11 });
    const i = p.steps.findIndex((s) => s.key === 'lay_full');
    const counts = progressCounts(p, sceneStateAt(p, i, 1));
    expect(counts.tilesPlaced).toBe(p.quantities.fullTiles);
    expect(counts.cutsPlaced).toBe(0);
    expect(counts.spacersPlaced).toBeLessThan(p.quantities.spacers);
  });

  it('ends grouted, with every piece placed and the spacers gone', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11 });
    const end = sceneStateAt(p, p.steps.length - 1, 1);
    expect(end.placed).toBe(p.pieces.length);
    expect(end.grout).toBe(1);
    expect(end.spacersVisible).toBe(false);
    expect(progressCounts(p, end).cutsPlaced).toBe(p.quantities.cutTiles);
  });

  it('shows the spacers once the cuts are in and before grouting', () => {
    const p = plan({ areaWidthM: 3.37, areaDepthM: 2.11 });
    const i = p.steps.findIndex((s) => s.key === 'lay_cuts');
    expect(progressCounts(p, sceneStateAt(p, i, 1)).spacersPlaced).toBe(p.quantities.spacers);
  });
});
