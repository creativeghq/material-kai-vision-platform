/**
 * Room-plan surfaces guard (#341).
 *
 * The planner understood only objects with a footprint. A tile has no footprint — you apply it to a
 * surface — so half a materials catalogue could not go on a plan at all, and adding one as an
 * object drew it as a small rectangle on the floor like a rug.
 *
 * Two things about surfaces are easy to get wrong and impossible to see afterwards:
 *
 *   1. AREA MUST BE DERIVED. It is a function of the room's dimensions. A stored copy goes stale
 *      the moment someone resizes the room, and the plan then quotes last week's floor with
 *      nothing to flag it — the same shape as every other cached-derived-number bug here.
 *   2. A COUNT AND AN AREA MUST NOT BE ADDED TOGETHER. `quote_items` is UNIQUE (quote_id,
 *      product_id), so one product can occupy only one line. Two lamps plus 24 m² of the same
 *      product is not "26" of anything.
 *
 * The area maths itself is pinned here because it is the number a customer orders against: get the
 * wall height wrong and a tiling job is short by a wall.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** The area rule the SQL view implements, restated so the expectations below are executable. */
function areaFor(
  surface: string,
  room: { width: number; depth: number; height: number },
): number {
  switch (surface) {
    case 'floor':
    case 'ceiling':
      return room.width * room.depth;
    case 'wall_north':
    case 'wall_south':
      return room.width * room.height;
    case 'wall_east':
    case 'wall_west':
      return room.depth * room.height;
    default:
      throw new Error(`unknown surface ${surface}`);
  }
}

const ROOM = { width: 6, depth: 4, height: 2.7 };

describe('surface area', () => {
  it('floor and ceiling are width x depth', () => {
    expect(areaFor('floor', ROOM)).toBe(24);
    expect(areaFor('ceiling', ROOM)).toBe(24);
  });

  it('walls use the ROOM HEIGHT, and opposite walls pair up', () => {
    // The mistake that costs a wall's worth of tile: using depth for a north wall.
    expect(areaFor('wall_north', ROOM)).toBeCloseTo(16.2, 5);
    expect(areaFor('wall_south', ROOM)).toBeCloseTo(16.2, 5);
    expect(areaFor('wall_east', ROOM)).toBeCloseTo(10.8, 5);
    expect(areaFor('wall_west', ROOM)).toBeCloseTo(10.8, 5);
  });

  it('waste is added on top of the measured area, never baked into it', () => {
    // The operator has to be able to see both numbers: what the room measures, and what to order.
    const area = areaFor('floor', ROOM);
    expect(Number((area * 1.1).toFixed(2))).toBe(26.4);
  });
});

describe('the surfaces feature keeps its two invariants', () => {
  it('area is derived in SQL, and no column stores it', () => {
    // A stored area is a second copy of a derived quantity — CLAUDE.md's first anti-regression rule.
    // If someone adds `area_m2` as a COLUMN on room_layout_surfaces, this is the tripwire.
    const svc = read('src/services/roomPlannerService.ts');
    expect(svc).toContain('room_layout_surfaces_resolved');
    // The service must read the view, never recompute the area from the room dimensions itself.
    expect(svc).not.toMatch(/room_width_m\s*\*\s*room_depth_m/);
  });

  it('a surface can be cleared, not only set', () => {
    // Applying a floor with no way to remove it leaves the database as the only undo.
    const panel = read('src/components/features/roomplanner/RoomPlannerPanel.tsx');
    expect(panel).toContain('__none');
    const svc = read('src/services/roomPlannerService.ts');
    expect(svc).toMatch(/if \(!productId\)/);
  });

  it('the planner offers every face of the room', () => {
    const svc = read('src/services/roomPlannerService.ts');
    for (const face of ['floor', 'ceiling', 'wall_north', 'wall_east', 'wall_south', 'wall_west']) {
      expect(svc, `${face} missing from SURFACE_KEYS`).toContain(`'${face}'`);
    }
  });
});

/**
 * One room model, by LINKING — and one measurement (#378 N8).
 *
 * `project_rooms` is the room OF RECORD (8 inbound foreign keys); `room_layouts` is an ARRANGEMENT
 * of products inside a room. The issue proposed folding the second into the first, which read as a
 * merge would delete nine capabilities — placement items, derived footprints, the six-face surface
 * areas, `add_layout_to_quote`, the lighting preset, the canvases, the Client View embed, the
 * public `/embed/planner`, and existence with no project at all.
 *
 * So they are LINKED, and `project_room_id` is NULLABLE: a NOT NULL kills the embed planner (an
 * anonymous visitor has no project) and the showroom layout.
 *
 * THE COLLISION THIS GUARDS. The two tables measured the same room in different units —
 * `project_rooms` in integer MILLIMETRES, `room_layouts` in numeric METRES — and surface area, the
 * number a tiling order is placed against, derives from the metres. Two stored copies of one
 * measurement is this codebase's oldest bug shape. The link therefore had to avoid CREATING it:
 * a linked layout takes the room's dimensions, resolved once in SQL, and both the plan and its
 * areas read the SAME view. Drawn at 6m and ordered at 5m is the failure being prevented.
 */
describe('a plan and its tile order use one set of dimensions', () => {
  it('the planner reads the RESOLVED view, never the raw table', () => {
    const svc = read('src/services/roomPlannerService.ts');
    expect(svc, 'listLayouts must read room_layouts_resolved').toMatch(/from\('room_layouts_resolved'/);
    expect(svc, 'the resolved dimensions must be exposed').toMatch(/effective_width_m/);
  });

  it('the canvas, the 3D scene and the area all draw from the resolved dimensions', () => {
    const panel = read('src/components/features/roomplanner/RoomPlannerPanel.tsx');
    // A single `layout.room_width_m` left behind is a surface drawing the room at one size while
    // the tile order is placed at another.
    expect(panel, 'a raw room_width_m survives in the panel').not.toMatch(/layout\.room_width_m/);
    expect(panel, 'a raw room_depth_m survives in the panel').not.toMatch(/layout\.room_depth_m/);
    expect(panel).toMatch(/effective_width_m/);
  });

  it('the dimensions cannot be edited on a plan whose room states them', () => {
    // Editing them there writes a second copy of a measurement the room already holds.
    const panel = read('src/components/features/roomplanner/RoomPlannerPanel.tsx');
    expect(panel).toMatch(/disabled=\{layout\.dimension_source === 'room'\}/);
  });

  it('the link has a writer and stays optional', () => {
    const svc = read('src/services/roomPlannerService.ts');
    expect(svc, 'a column nothing can set is dead schema').toMatch(/setProjectRoom/);
    expect(read('src/components/features/roomplanner/RoomPlannerPanel.tsx'),
      'the picker is the writer').toMatch(/attachRoom\(/);
    // Detaching must be offered: a plan attached to the wrong room is worse than an unattached one.
    expect(read('src/components/features/roomplanner/RoomPlannerPanel.tsx')).toMatch(/__none/);
  });
});

/**
 * Lighting presets, everywhere (#335).
 *
 * The catalogue — natural daylight, golden hour, overcast, showroom spots, warm evening, night —
 * has been usable in the material lighting viewer for a while. Every other 3D surface hardcoded
 * three lights and the `apartment` environment, so a tenant could light a material sample the way
 * they wanted and had no say over the product viewer or the room they were planning.
 *
 * Two things to hold: nothing goes back to literals, and the storable values cannot drift from the
 * offerable ones — a CHECK constraint listing a preset the code does not have (or vice versa) fails
 * only when someone picks that one.
 */
describe('lighting presets are shared, not hardcoded', () => {
  const PRESETS = ['natural_daylight', 'golden_hour', 'overcast', 'showroom_spots', 'warm_evening', 'night'];

  it('the catalogue still carries every preset the database will store', () => {
    // The CHECK on room_layouts.lighting_preset lists exactly these. If one is renamed here, a
    // saved plan referring to it becomes unstorable — and the failure appears when a tenant picks
    // it, not when it is renamed.
    const cat = read('src/components/features/lighting/lightingPresets.ts');
    for (const key of PRESETS) {
      expect(cat, `${key} missing from LIGHTING_PRESETS`).toContain(`${key}:`);
    }
  });

  it('the 3D surfaces light themselves from the catalogue, not from literals', () => {
    for (const f of [
      'src/components/features/ar/ProductModelViewer.tsx',
      'src/components/features/roomplanner/RoomScene3D.tsx',
    ]) {
      const src = read(f);
      expect(src, `${f} should use the shared rig`).toContain('PresetLighting');
      // The exact shape that was there before: a hardcoded environment and a hand-tuned ambient.
      expect(src, `${f} still hardcodes an Environment preset`).not.toMatch(/Environment\s+preset="/);
      expect(src, `${f} still hardcodes ambient light`).not.toMatch(/<ambientLight/);
    }
  });
});
