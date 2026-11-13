import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dilateMask, effectiveSize, hexToRgb, idColour, maskBox, maskForColour, planBounds, planFrame, pointInPolygon,
  productSizeMm, rgbToHex, rotationToPlan, rotationToScene, toPlan, toScene, wallPieces,
} from '@/lib/scene/sceneGeometry';
import { sanitizeSceneRead, wallsFromRooms } from '@/lib/scene/sceneReadSchema';
import { blankComments } from '../helpers/stripComments';

const wall = { id: 'w', x1_mm: 0, y1_mm: 0, x2_mm: 4000, y2_mm: 0, thickness_mm: 100, height_mm: null };

describe('scene geometry', () => {
  it('maps plan to scene and back without mirroring', () => {
    const f = planFrame(planBounds([{ outline: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]] }], []));
    expect(toScene(4000, 3000, f)).toEqual([2, 1.5]);
    expect(toPlan(2, 1.5, f)).toEqual([4000, 3000]);
    expect(rotationToPlan(rotationToScene(90))).toBe(90);
  });

  it('cuts a wall around a door and a window', () => {
    const f = planFrame(planBounds([], [wall]));
    const pieces = wallPieces(wall, [
      { id: 'd', wall_id: 'w', kind: 'door', offset_mm: 500, width_mm: 900, sill_mm: 0, head_mm: 2100 },
      { id: 'n', wall_id: 'w', kind: 'window', offset_mm: 2500, width_mm: 1000, sill_mm: 900, head_mm: 2100 },
    ], f, 2700);
    const total = (from: number, to: number) => pieces.filter((p) => p.height > 2.6).reduce((s, p) => s + p.length, 0) + from + to;
    expect(total(0, 0)).toBeCloseTo(0.5 + 1.1 + 0.5, 5);
    expect(pieces.filter((p) => p.height < 1 && p.center[1] < 0.5)).toHaveLength(1);
    expect(pieces.every((p) => p.length > 0 && p.height > 0)).toBe(true);
  });

  it('never produces a negative piece from an opening that overruns the wall', () => {
    const f = planFrame(planBounds([], [wall]));
    const pieces = wallPieces(wall, [{ id: 'o', wall_id: 'w', kind: 'opening', offset_mm: 3800, width_mm: 900, sill_mm: 0, head_mm: 2100 }], f, 2700);
    expect(pieces.every((p) => p.length > 0)).toBe(true);
  });

  it('prefers the product size over the estimate, and says so', () => {
    const obj = { width_mm: 2000, depth_mm: 900, height_mm: 800, size_source: 'estimated' as const };
    expect(effectiveSize(obj, { attributes: { width_mm: 2400, depth_mm: 1000, height_mm: 850 } }).basis).toBe('product');
    expect(productSizeMm({ metadata: { dimensions: { width: 240, depth: 100, height: 85, unit: 'cm' } } })).toEqual({ width_mm: 2400, depth_mm: 1000, height_mm: 850 });
    expect(effectiveSize(obj, { attributes: { width_mm: 2400 } })).toMatchObject({ width_mm: 2000, basis: 'estimated' });
  });

  it('gives every object a distinct non-black ID colour and finds its pixels', () => {
    const hexes = new Set(Array.from({ length: 160 }, (_, i) => rgbToHex(idColour(i + 1))));
    expect(hexes.size).toBe(160);
    expect(hexes.has('#000000')).toBe(false);
    const rgb = hexToRgb(rgbToHex(idColour(3)))!;
    const px = new Uint8ClampedArray(4 * 4 * 4);
    for (const i of [5, 6]) px.set([...rgb, 255], i * 4);
    const mask = maskForColour(px, rgb);
    expect(maskBox(mask, 4, 4)).toMatchObject({ x0: 0.25, x1: 0.75 });
    expect(dilateMask(mask, 4, 4, 1).reduce((s, v) => s + v, 0)).toBe(12);
  });

  it('tests points against a room outline', () => {
    const sq: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
});

describe('scene reader output', () => {
  it('refuses a read with no rooms and builds walls when the reader drew none', () => {
    expect(sanitizeSceneRead({ read_ok: true, rooms: [] }).read_ok).toBe(false);
    const read = sanitizeSceneRead({
      read_ok: true,
      rooms: [{ name: 'A', outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }] }],
      walls: [],
      openings: [{ wall: 0, kind: 'door', offset_mm: 100, width_mm: 900 }],
      objects: [{ label: 'Sofa', kind: 'not-a-kind', room: 7, width_mm: -5, elevation_mm: 99999 }],
    });
    expect(read.read_ok).toBe(true);
    expect(read.walls).toHaveLength(4);
    expect(read.openings).toHaveLength(0);
    expect(read.objects[0]).toMatchObject({ kind: 'other', room: -1, width_mm: 50, elevation_mm: 5000 });
  });

  it('dedupes a wall shared by two rooms', () => {
    const rooms = [
      { name: 'A', room_type: '', floor_colour_hex: '', wall_colour_hex: '', outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }] },
      { name: 'B', room_type: '', floor_colour_hex: '', wall_colour_hex: '', outline: [{ x: 3000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 3000, y: 3000 }] },
    ];
    expect(wallsFromRooms(rooms)).toHaveLength(7);
  });

  it('keeps an opening only on a wall the reader actually returned, inside its length', () => {
    const read = sanitizeSceneRead({
      read_ok: true,
      rooms: [{ name: 'A', outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }] }],
      walls: [{ x1: 0, y1: 0, x2: 3000, y2: 0, thickness_mm: 100 }],
      openings: [{ wall: 0, kind: 'window', offset_mm: 2900, width_mm: 1200, sill_mm: 900, head_mm: 2100 }, { wall: 3, kind: 'door' }],
    });
    expect(read.openings).toHaveLength(1);
    expect(read.openings[0].offset_mm + read.openings[0].width_mm).toBeLessThanOrEqual(3000);
  });
});

describe('scene studio wiring', () => {
  const editor = blankComments(readFileSync('src/components/features/scenestudio/SceneEditor.tsx', 'utf8'));
  const reader = blankComments(readFileSync('supabase/functions/scene-studio-read/index.ts', 'utf8'));

  it('renders and edits only through the shared image chokepoint', () => {
    expect(editor).toContain("mode: 'scene-render'");
    expect(editor).not.toMatch(/fetch\(\s*['"`]https:\/\/(api\.anthropic|generativelanguage)/);
  });

  it('debits before the model call and takes the workspace from the scene row', () => {
    expect(reader.indexOf('debitExternalServiceCredits(')).toBeGreaterThan(0);
    expect(reader.indexOf('debitExternalServiceCredits(')).toBeLessThan(reader.indexOf('readSource(admin, plan'));
    expect(reader).toContain("userHasWorkspaceCapability(admin, uid, plan.workspace_id, 'moodboards.use')");
    expect(reader).not.toMatch(/body\.workspace_id|workspace_id\s*}\s*=\s*\(await req\.json/);
  });

  it('lives in the interior designer canvas, not on a page of its own', () => {
    const app = blankComments(readFileSync('src/App.tsx', 'utf8'));
    const hub = blankComments(readFileSync('src/components/features/ai/AgentHub.tsx', 'utf8'));
    expect(app).not.toContain('/scene-studio');
    expect(hub).toContain('<SceneEditor');
    for (const chunk of ['scene_studio_scene', 'scene_studio_scenes']) expect(hub).toContain(`chunk.type === '${chunk}'`);
    expect(hub).toMatch(/onRendered=\{\(ev\) => handleSceneRendered/);
  });
});
