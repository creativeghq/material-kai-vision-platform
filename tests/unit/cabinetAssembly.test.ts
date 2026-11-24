import { describe, it, expect } from 'vitest';

import { cabinetAssemblies, cutList, edgeBanding, generateCabinet, type AssemblyPiece } from '../../src/lib/scene/cabinetPanels';
import { assemblyPiecesOf } from '../../src/lib/scene/kitchenComposition';

const piece = (type: string, width_mm: number, extra: Partial<AssemblyPiece> = {}): AssemblyPiece =>
  ({ zone: 'base', type, width_mm, height_mm: 720, depth_mm: 560, stated: true, where: 'Run #1', ...extra });
const check = (a: ReturnType<typeof cabinetAssemblies>[number], rule: string) => a.checks.find((c) => c.rule === rule);

describe('workshop assembly sheet', () => {
  it('lists every panel the cabinet is cut from, grouped, and agrees with the cut list', () => {
    const [a] = cabinetAssemblies([piece('door2', 800)]);
    const cab = generateCabinet({ zone: 'base', type: 'door2', width_mm: 800, height_mm: 720, depth_mm: 560 })!;
    expect(a.parts.reduce((n, p) => n + p.qty, 0)).toBe(cab.panels.length);
    expect(a.parts.find((p) => p.role === 'side')?.qty).toBe(2);
    expect(a.panel_part).toHaveLength(cab.panels.length);
    const area = a.parts.reduce((s, p) => s + (p.qty * p.length_mm * p.width_mm) / 1e6, 0);
    expect(Math.round(area * 100) / 100).toBeCloseTo(cutList([cab.panels]).reduce((s, e) => s + e.area_m2, 0), 1);
    expect(a.hardware.doors).toBe(2);
    expect(a.checks.every((c) => c.ok)).toBe(true);
  });

  it('states edge banding as whole edges: a door on four sides, a side on its front edge, a back on none', () => {
    const [a] = cabinetAssemblies([piece('door2', 800)]);
    const by = (role: string) => a.parts.find((p) => p.role === role)!;
    expect([by('door').band_long, by('door').band_short]).toEqual([2, 2]);
    expect([by('side').band_long, by('side').band_short]).toEqual([1, 0]);
    expect([by('back').band_long, by('back').band_short]).toEqual([0, 0]);
    expect(edgeBanding({ role: 'shelf', slot: 'carcass', size: [700, 18, 500], pos: [0, 0, 0], edge_mm: 333 })).toBeNull();
  });

  it('counts identical cabinets once and keeps where each one stands', () => {
    const list = cabinetAssemblies([piece('door1', 450), piece('door1', 450, { where: 'Run #3' }), piece('drawers', 600)]);
    expect(list).toHaveLength(2);
    expect(list[0].count).toBe(2);
    expect(list[0].where).toEqual(['Run #1', 'Run #3']);
  });

  it('fails a panel longer than a board, a drawer box too tall for its front, and an assumed width', () => {
    const [tall] = cabinetAssemblies([piece('larder', 600, { zone: 'tall', height_mm: 2900 })]);
    expect(check(tall, 'Every Panel Fits a Standard Board')?.ok).toBe(false);
    const [low] = cabinetAssemblies([piece('drawers', 600, { height_mm: 240 })]);
    expect(check(low, 'Drawer Boxes Fit Their Fronts and the Carcass')?.ok).toBe(false);
    const [guess] = cabinetAssemblies([piece('door1', 450, { stated: false })]);
    expect(check(guess, 'Cabinet Size Stated by a Person')?.ok).toBe(false);
  });

  it('builds pieces from a kitchen run with the run label and the stated flag', () => {
    const run = { label: 'Base', kind: 'kitchen_base', width_mm: 1400, depth_mm: 600, height_mm: 900, kitchen_layout: { modules: [{ type: 'door2', width_mm: 800 }, { type: 'drawers', width_mm: 600 }] } };
    const pieces = assemblyPiecesOf(run, { plinth_mm: 100, front_mm: 18, worktop_mm: 40 });
    expect(pieces.map((p) => [p.type, p.width_mm, p.stated, p.where])).toEqual([['door2', 800, true, 'Base #1'], ['drawers', 600, true, 'Base #2']]);
  });
});
