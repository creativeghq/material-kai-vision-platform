import { describe, expect, it } from 'vitest';

import { GUIDE_OUTPUT_SCHEMA, sanitizeGuide } from '@/lib/installation/guideSchema';
import { buildGuide, countsAt, poseAt, stepAt } from '@/lib/installation/guideBuild';

const raw = {
  title: 'BILLY',
  summary: 'A bookcase.',
  overall_cm: { x: 80, y: 202, z: 28, stated: true },
  people_required: 2,
  tools: ['Hammer'],
  warnings: ['Fix it to the wall.'],
  parts: [
    { id: 'SIDE', name: 'Side panel', code: '', quantity: 2, kind: 'panel', size_cm: { x: 1.5, y: 202, z: 28 }, size_stated: true },
    { id: 'TOP', name: 'Top', code: '', quantity: 1, kind: 'panel', size_cm: { x: 77, y: 1.5, z: 28 }, size_stated: false },
    { id: 'DOWEL', name: 'Wooden dowel', code: '101351', quantity: 4, kind: 'hardware', size_cm: { x: 0.8, y: 3, z: 0.8 }, size_stated: false },
    { id: 'BAD', name: 'Ghost', code: '', quantity: 1, kind: 'robot', size_cm: { x: 1, y: 1, z: 1 }, size_stated: false },
  ],
  steps: [
    { title: 'What is in the box', page: 2, box: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 }, instruction: 'Lay it out.', parts_used: [], tools: [], warning: '', people: 1, action: 'prepare' },
    { title: 'Dowels', page: 3, box: { x0: 0.9, y0: 0.5, x1: 0.1, y1: 0.1 }, instruction: 'Push in 101351.', parts_used: [{ part_id: 'DOWEL', quantity: 4, fixes_to: 'TOP' }, { part_id: 'NOPE', quantity: 1, fixes_to: '' }], tools: [], warning: '', people: 1, action: 'insert' },
    { title: 'Sides', page: 99, box: { x0: 0, y0: 0, x1: 0.001, y1: 0.001 }, instruction: 'Stand them up.', parts_used: [{ part_id: 'SIDE', quantity: 2, fixes_to: '' }, { part_id: 'TOP', quantity: 1, fixes_to: '' }], tools: [], warning: 'Two people.', people: 2, action: 'place' },
  ],
  assembly: {
    available: true,
    placements: [
      { part_id: 'SIDE', instance: 0, center_cm: { x: -39, y: 101, z: 0 }, extent_cm: { x: 1.5, y: 202, z: 28 }, step: 2 },
      { part_id: 'SIDE', instance: 1, center_cm: { x: 39, y: 101, z: 0 }, extent_cm: { x: 1.5, y: 202, z: 28 }, step: 2 },
      { part_id: 'TOP', instance: 0, center_cm: { x: 0, y: 201, z: 0 }, extent_cm: { x: 77, y: 1.5, z: 28 }, step: 2 },
      { part_id: 'NOPE', instance: 0, center_cm: { x: 0, y: 0, z: 0 }, extent_cm: { x: 1, y: 1, z: 1 }, step: 1 },
    ],
  },
};

describe('installation guide schema', () => {
  it('is a closed strict schema at every level', () => {
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
      }
      Object.values(o).forEach(walk);
    };
    walk(GUIDE_OUTPUT_SCHEMA);
  });

  it('drops parts it cannot classify only by kind, and references to parts that do not exist', () => {
    const g = sanitizeGuide(raw, 12);
    expect(g.parts.find((p) => p.id === 'BAD')?.kind).toBe('accessory');
    expect(g.steps[1].parts_used.map((u) => u.part_id)).toEqual(['DOWEL']);
    expect(g.assembly.placements.map((p) => p.part_id)).not.toContain('NOPE');
  });

  it('keeps a step on a page that exists and a box that is a real rectangle', () => {
    const g = sanitizeGuide(raw, 12);
    expect(g.steps[2].page).toBe(12);
    expect(g.steps[1].box).toEqual({ x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.5 });
    expect(g.steps[2].box).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it('survives garbage', () => {
    const g = sanitizeGuide({ parts: 'x', steps: [null, 3], assembly: 7 }, 1);
    expect(g.parts).toEqual([]);
    expect(g.steps).toEqual([]);
    expect(g.assembly.available).toBe(false);
  });
});

describe('installation guide build', () => {
  const guide = sanitizeGuide(raw, 12);
  const build = buildGuide(guide);

  it('has one timeline slot per step after the kit', () => {
    expect(build.steps).toBe(2);
    expect(stepAt(0, build.steps)).toBe(0);
    expect(stepAt(1.4, build.steps)).toBe(2);
  });

  it('puts every placed panel on the floor of the finished product', () => {
    const panels = build.items.filter((it) => it.kind === 'panel');
    expect(panels).toHaveLength(3);
    const lowest = Math.min(...panels.map((p) => p.target.pos.y - p.size.y / 2));
    expect(lowest).toBeCloseTo(0, 6);
  });

  it('moves each item inside its own step window and in order', () => {
    for (const it of build.items.filter((i) => Number.isFinite(i.ta))) {
      expect(it.t0).toBeGreaterThanOrEqual(it.step - 1);
      expect(it.ta).toBeLessThanOrEqual(it.step);
      expect(it.ta).toBeGreaterThan(it.t0);
    }
  });

  it('counts hardware and panels as they arrive', () => {
    expect(countsAt(build, 0)).toEqual({ hardware: 0, panels: 0 });
    expect(countsAt(build, 1)).toEqual({ hardware: 4, panels: 0 });
    expect(countsAt(build, 2)).toEqual({ hardware: 4, panels: 3 });
  });

  it('starts in the kit and ends at the target', () => {
    const side = build.items.find((it) => it.partId === 'SIDE')!;
    expect(poseAt(side, 0, 0).pos).toEqual(side.kit.pos);
    expect(poseAt(side, 2, 0).pos).toEqual(side.target.pos);
    expect(poseAt(side, (side.t0 + side.ta) / 2, 0).moving).toBe(true);
  });

  it('pushes placed parts apart when exploded', () => {
    const side = build.items.find((it) => it.partId === 'SIDE')!;
    const apart = poseAt(side, 2, 1).pos;
    expect(Math.hypot(apart.x - side.target.pos.x, apart.y - side.target.pos.y, apart.z - side.target.pos.z)).toBeGreaterThan(0.1);
  });

  it('still builds a guide with no assembled shape', () => {
    const flat = buildGuide(sanitizeGuide({ ...raw, assembly: { available: false, placements: [] } }, 12));
    expect(flat.hasAssembly).toBe(false);
    expect(flat.items.filter((it) => it.kind === 'panel')).toHaveLength(3);
    expect(flat.items.every((it) => !it.placed)).toBe(true);
  });
});

describe('installation guide counts above the render cap', () => {
  it('counts every screw the manual lists, not just the ones drawn', () => {
    const many = sanitizeGuide({
      ...raw,
      parts: [...raw.parts.filter((p) => p.id !== 'DOWEL'), { id: 'DOWEL', name: 'Wooden dowel', code: '101351', quantity: 120, kind: 'hardware', size_cm: { x: 0.8, y: 3, z: 0.8 }, size_stated: false }],
      steps: raw.steps.map((s, i) => (i === 1 ? { ...s, parts_used: [{ part_id: 'DOWEL', quantity: 120, fixes_to: 'TOP' }] } : s)),
    }, 12);
    const b = buildGuide(many);
    expect(b.items.filter((it) => it.partId === 'DOWEL').length).toBeLessThan(120);
    expect(countsAt(b, b.steps).hardware).toBe(120);
    expect(b.hardwareTotal).toBe(120);
  });
});
