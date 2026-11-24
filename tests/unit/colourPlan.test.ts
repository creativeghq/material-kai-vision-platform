import { describe, it, expect } from 'vitest';

import { applyColourPlan, colourPlanLines, colourRolesOf, defaultColourPlan } from '../../src/lib/scene/colourPlan';
import type { SceneObject } from '../../src/services/sceneStudioService';

const SCANDI = ['#f6f4ef', '#e2d9c8', '#b8a88a', '#7b8a7a'];
const kitchen = ['kitchen_base', 'kitchen_wall', 'kitchen_tall', 'sink'].map((kind) => ({ kind, removed_at: null }));

const obj = (id: string, kind: string, extra: Partial<SceneObject> = {}) => ({
  id, floor_plan_id: 'f', room_id: 'r', kind, label: kind, product_id: null, x_mm: 0, y_mm: 0, rotation_deg: 0,
  width_mm: 600, depth_mm: 600, height_mm: 900, elevation_mm: 0, size_source: 'estimated', colour_hex: null, removed_at: null, ...extra,
}) as unknown as SceneObject;

describe('a style palette becomes a colour plan', () => {
  it('uses every colour of the palette, lightest on the walls, darkest on the accents', () => {
    const plan = defaultColourPlan(SCANDI, kitchen);
    expect(new Set(plan.map((p) => p.hex))).toEqual(new Set(SCANDI));
    expect(plan.find((p) => p.role === 'walls')?.hex).toBe('#f6f4ef');
    expect(plan.find((p) => p.role === 'accent')?.hex).toBe('#7b8a7a');
  });

  it('still uses every colour when the room has fewer parts than the palette has colours', () => {
    const five = ['#ffffff', '#dddddd', '#999999', '#555555', '#111111'];
    const plan = defaultColourPlan(five, [{ kind: 'rug', removed_at: null }]);
    expect(colourRolesOf([{ kind: 'rug', removed_at: null }])).toEqual(['walls', 'floor', 'accent']);
    expect(new Set(plan.map((p) => p.hex))).toEqual(new Set(five));
  });

  it('names each part in the prompt lines', () => {
    expect(colourPlanLines(defaultColourPlan(SCANDI, kitchen))[0]).toBe('Walls: #f6f4ef');
  });

  it('colours only what the person has not coloured, and adds walls and floor per room', () => {
    const plan = defaultColourPlan(SCANDI, kitchen);
    const objects = [obj('a', 'kitchen_base'), obj('b', 'kitchen_wall', { colour_hex: '#ff0000' })];
    const v = applyColourPlan(plan, objects, [], [], ['r']);
    expect(v.objects[0].colour_hex).toBe(plan.find((p) => p.role === 'base_fronts')!.hex);
    expect(v.objects[1].colour_hex).toBe('#ff0000');
    expect(v.finishes.some((f) => f.object_id === 'a' && f.slot === 'worktop')).toBe(true);
    expect(v.surfaces.map((s) => s.surface).sort()).toEqual(['floor', 'walls']);
    expect(applyColourPlan([], objects, [], [], ['r']).objects).toBe(objects);
  });
});
