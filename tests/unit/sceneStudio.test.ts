import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dilateMask, effectiveSize, hexToRgb, idColour, maskBox, maskForColour, planBounds, planFrame, pointInPolygon,
  productSizeMm, rgbToHex, rotationToPlan, rotationToScene, toPlan, toScene, walkBlocked, walkStep, wallPieces,
} from '@/lib/scene/sceneGeometry';
import { sanitizeSceneRead, wallsFromRooms } from '@/lib/scene/sceneReadSchema';
import { indexSurfaces, objectSlotFinishes, resolveFinish, splashFinish, surfaceKey, targetKey, wallFaceFinish, zonesOn } from '@/lib/scene/sceneSurfaces';
import { objectParts } from '@/lib/scene/objectParts';
import { groupSplats, tintSplats } from '@/lib/scene/splatTint';
import { kitchenCompositionFromRoom } from '@/lib/scene/kitchenComposition';
import { SCENE_OBJECT_KINDS, slotsForKind } from '@/lib/scene/sceneReadSchema';
import type { SceneSurface } from '@/services/sceneStudioService';
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

describe('walking through a 3D room', () => {
  const wall = { id: 'w', x1_mm: 0, y1_mm: 0, x2_mm: 4000, y2_mm: 0, thickness_mm: 120, height_mm: null };
  const door = { id: 'd', wall_id: 'w', kind: 'door' as const, offset_mm: 1500, width_mm: 900, sill_mm: 0, head_mm: 2100 };
  const window = { ...door, id: 'win', kind: 'window' as const, offset_mm: 3000, width_mm: 800 };

  it('stops at a wall and lets you through a door, never a window', () => {
    expect(walkBlocked(500, 100, [wall], [door, window])).toBe(true);
    expect(walkBlocked(1950, 0, [wall], [door, window])).toBe(false);
    expect(walkBlocked(3400, 0, [wall], [door, window])).toBe(true);
    expect(walkBlocked(500, 1500, [wall], [door, window])).toBe(false);
  });

  it('slides along a wall instead of sticking to it', () => {
    expect(walkStep([500, 600], [600, 300], [wall], [])).toEqual([600, 600]);
  });
});

describe('finishing a room surface by surface', () => {
  const row = (surface: SceneSurface['surface'], extra: Partial<SceneSurface> = {}): SceneSurface => ({
    id: `${surface}-${extra.wall_id ?? ''}`, room_id: 'r', surface, wall_id: null, band_from_mm: null, band_to_mm: null,
    product_id: null, colour_hex: '#112233', ...extra,
  });

  it('gives one wall its own finish over the room walls, and only that wall', () => {
    const idx = indexSurfaces([row('walls'), row('wall', { wall_id: 'w2', colour_hex: '#aa0000' })]);
    expect(wallFaceFinish(idx, 'r', 'w2')?.colour_hex).toBe('#aa0000');
    expect(wallFaceFinish(idx, 'r', 'w1')?.colour_hex).toBe('#112233');
    expect(wallFaceFinish(idx, 'other', 'w2')).toBeNull();
  });

  it('keeps a backsplash on top of the wall finish, never instead of it', () => {
    const idx = indexSurfaces([row('wall', { wall_id: 'w1' }), row('splash', { wall_id: 'w1', band_from_mm: 900, band_to_mm: 1500, colour_hex: '#ffffff' })]);
    expect(wallFaceFinish(idx, 'r', 'w1')?.surface).toBe('wall');
    expect(splashFinish(idx, 'r', 'w1')?.band_to_mm).toBe(1500);
  });

  it('shows a chosen colour option as that option, and a product without one as its photo at its real size', () => {
    const product = {
      id: 'p', name: 'Laminate', imageUrl: 'https://x/p.jpg', attributes: { width_mm: 190, length_mm: 1380 },
      metadata: { colour_options: [{ hex: '#A49084', name: 'Vintage Oak', swatch_url: 'https://x/s.png' }] },
    };
    const opt = resolveFinish(row('floor', { product_id: 'p', colour_hex: '#a49084' }), product);
    expect(opt).toMatchObject({ imageUrl: 'https://x/s.png', label: 'Laminate — Vintage Oak', jointed: true, tileW: 0.19 });
    expect(resolveFinish(row('floor', { product_id: 'p', colour_hex: null }), product)?.imageUrl).toBe('https://x/p.jpg');
    expect(resolveFinish(row('walls'), undefined)).toMatchObject({ hex: '#112233', imageUrl: null, jointed: false });
  });

  it('lays a wall piece knowing where it starts, so tiles run on across a door', () => {
    const f = planFrame(planBounds([], [wall]));
    const pieces = wallPieces(wall, [{ id: 'd', wall_id: 'w', kind: 'door', offset_mm: 1000, width_mm: 900, sill_mm: 0, head_mm: 2100 }], f, 2700);
    const after = pieces.find((p) => p.start > 1.8 && p.bottom === 0);
    expect(after?.start).toBeCloseTo(1.9, 5);
    expect(after?.wallLength).toBeCloseTo(4, 5);
    expect(pieces.find((p) => p.bottom > 2)?.bottom).toBeCloseTo(2.1, 5);
  });

  it('photo mode leaves click boxes and splat furniture out of the traced scene', () => {
    const src = blankComments(readFileSync('src/components/features/scenestudio/PhotoMode.tsx', 'utf8'));
    expect(src).toMatch(/invisibleMaterial\(mesh\.material\)/);
    expect(src).toMatch(/withTraceView\(scene, \(\) => tracer\.setScene/);
    expect(src).toMatch(/new ThreeMesh\(sub, material\)/);
    expect(src).toMatch(/_generator = new PathTracingSceneGenerator\(\)/);
    const canvas = blankComments(readFileSync('src/components/features/scenestudio/SceneCanvas.tsx', 'utf8'));
    expect(canvas).toMatch(/!wireframe && !photo && hasSplats && <SplatsAfterComposer/);
    expect(canvas).toMatch(/isSplat\(o\) && o\.visible[\s\S]{0,120}\}, 0\.5\);[\s\S]{0,200}drawSplatsOver\([\s\S]{0,120}\}, 2\);/);
  });
});

describe('every object takes any material, slot by slot', () => {
  it('only paints a part with a slot its kind declares, and every declared slot reaches a part', () => {
    for (const kind of SCENE_OBJECT_KINDS.filter((k) => k !== 'plant' && k !== 'pendant')) {
      const declared = slotsForKind(kind);
      const used = new Set(objectParts(kind, 1.2, 0.8, 0.9, '#999999').map((p) => p.slot).filter(Boolean));
      for (const slot of used) expect(declared, `${kind} paints ${slot}`).toContain(slot);
      for (const slot of declared) expect(used.has(slot), `${kind} declares ${slot} but draws none`).toBe(true);
    }
  });

  it('a kitchen carcass follows its fronts until it is given its own finish', () => {
    const rows = [{ id: 'f', object_id: 'k', slot: 'fronts' as const, product_id: null, colour_hex: '#224466' }];
    const k = { id: 'k', kind: 'kitchen_base' };
    expect(objectSlotFinishes(k, rows, {}).carcass?.hex).toBe('#224466');
    const own = [...rows, { id: 'c', object_id: 'k', slot: 'carcass' as const, product_id: null, colour_hex: '#ffffff' }];
    expect(objectSlotFinishes(k, own, {}).carcass?.hex).toBe('#ffffff');
    expect(objectSlotFinishes(k, own, {}).worktop).toBeUndefined();
  });
});

describe('a photo-real 3D model previews a new material', () => {
  const model = () => {
    const n = 400;
    const y = new Float32Array(n); const rgb = new Float32Array(n * 3); const op = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      y[i] = i / n;
      const leg = i < 30; const cushion = i >= 300 && i < 330;
      const c = leg ? [0.3, 0.2, 0.1] : cushion ? [0.9, 0.1, 0.1] : [0.6 + (i % 7) * 0.02, 0.6, 0.6];
      rgb.set(c, i * 3);
    }
    return { y, rgb, op };
  };

  it('keeps the legs out of the upholstery and leaves a contrasting cushion alone', () => {
    const { y, rgb, op } = model();
    const g = groupSplats(y, rgb, op, { low: true, top: false });
    expect(g[5]).toBe(1);
    expect(g[200]).toBe(0);
    expect(g[310]).toBe(255);
  });

  it('tints a group to the target colour while keeping each splat\'s relative shading', () => {
    const { y, rgb, op } = model();
    const g = groupSplats(y, rgb, op, { low: true, top: false });
    const out = tintSplats(rgb, g, { main: [0.1, 0.4, 0.2] });
    expect(out[200 * 3 + 1]).toBeGreaterThan(out[200 * 3]);
    expect(out[5 * 3]).toBeCloseTo(rgb[5 * 3], 5);
    expect(out[206 * 3 + 1]).not.toBeCloseTo(out[200 * 3 + 1], 5);
  });
});

describe('the kitchen standing in a 3D room is priced from the kitchen blueprint', () => {
  const unit = (id: string, kind: string, w: number, h = 900, d = 600) => ({ id, kind, width_mm: w, depth_mm: d, height_mm: h });

  it('turns runs into module rows per zone, a sink into a sink base, and the base run into the worktop', () => {
    const c = kitchenCompositionFromRoom([unit('a', 'kitchen_base', 2400), unit('s', 'sink', 1200), unit('w', 'kitchen_wall', 1600, 720, 350), unit('t', 'kitchen_tall', 600, 2100)]);
    expect(c.base.enabled).toBe(true);
    expect(c.base.modules?.some((m) => m.type === 'sink_base' && m.width_cm === 90)).toBe(true);
    expect(c.base.modules?.reduce((sum, m) => sum + m.width_cm * m.qty, 0)).toBe(360);
    expect(c.base.globals?.height).toBe(76);
    expect(c.wall.globals?.depth).toBe(35);
    expect(c.tall.modules?.[0].type).toBe('larder');
    expect(c.island.enabled).toBe(false);
    expect(c.worktop.length_m).toBe(3.6);
    expect(c.appliances.enabled).toBe(false);
  });

  it('keeps the door model and worktop already chosen on the plan', () => {
    const prev = { base: { globals: { door_model: 'lacquer-id', height: 72 } }, worktop: { globals: { material: 'quartz-id' } } };
    const c = kitchenCompositionFromRoom([unit('a', 'kitchen_base', 1800)], prev);
    expect(c.base.globals?.door_model).toBe('lacquer-id');
    expect(c.worktop.globals?.material).toBe('quartz-id');
    expect(c.worktop.length_m).toBe(1.8);
  });
});

describe('a free area drawn on a wall or a floor is its own surface', () => {
  const zone = (id: string, wall: string | null): SceneSurface => ({
    id, room_id: 'r', surface: 'zone', wall_id: wall, band_from_mm: null, band_to_mm: null,
    zone_key: `k-${id}`, zone_u0_mm: 0, zone_u1_mm: 600, zone_v0_mm: 0, zone_v1_mm: 2100, product_id: null, colour_hex: '#ffffff',
  });

  it('keeps two areas on one wall apart, and a floor area off every wall', () => {
    const list = [zone('a', 'w1'), zone('b', 'w1'), zone('c', null)];
    expect(zonesOn(list, 'r', 'w1').map((z) => z.id)).toEqual(['a', 'b']);
    expect(zonesOn(list, 'r', null).map((z) => z.id)).toEqual(['c']);
    expect(surfaceKey(list[0])).not.toBe(surfaceKey(list[1]));
    expect(targetKey({ roomId: 'r', surface: 'zone', wallId: 'w1', zoneKey: 'k-a', u0: 0, u1: 1, v0: 0, v1: 1 })).toBe(surfaceKey(list[0]));
  });
});
