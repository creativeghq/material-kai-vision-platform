import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GUIDE_OUTPUT_SCHEMA, sanitizeGuide } from '@/lib/installation/guideSchema';
import { buildGuide, countsAt, poseAt, stepAt, type GuideBuild } from '@/lib/installation/guideBuild';
import { hardwareShape, panelHoles } from '@/components/features/guides/partModels';

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
    expect(poseAt(build, side, 0, 0).pos).toEqual(side.kit.pos);
    expect(poseAt(build, side, 2, 0).pos).toEqual(side.target.pos);
    expect(poseAt(build, side, (side.t0 + side.ta) / 2, 0).moving).toBe(true);
  });

  it('carries fitted hardware with its panel', () => {
    const dowel = build.items.find((it) => it.partId === 'DOWEL' && it.host !== null)!;
    const host = build.items[dowel.host!];
    const early = poseAt(build, dowel, host.t0 - 0.01, 0).pos;
    const late = poseAt(build, dowel, build.steps, 0).pos;
    const reach = Math.max(host.size.x, host.size.y, host.size.z) / 2 + 0.1;
    expect(Math.hypot(early.x - host.kit.pos.x, early.y - host.kit.pos.y, early.z - host.kit.pos.z)).toBeLessThan(reach);
    expect(Math.hypot(late.x - host.target.pos.x, late.y - host.target.pos.y, late.z - host.target.pos.z)).toBeLessThan(reach);
  });

  it('fits hardware on the face of a kit panel that is facing up', () => {
    for (const it of build.items.filter((x) => x.host !== null && x.step <= build.items[x.host!].step)) {
      expect(poseAt(build, it, it.ta, 0).outward.y).toBeGreaterThan(-1e-6);
    }
  });

  it('drills a hole on the face of the panel for each piece of hardware it hosts', () => {
    const hosts = [...new Set(build.items.filter((it) => it.host !== null).map((it) => it.host!))];
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) {
      const panel = build.items[h];
      const holes = panelHoles(build, h, (it) => guide.parts[it.partIndex].name);
      expect(holes.length).toBeGreaterThan(0);
      for (const hole of holes) {
        const axis = (['x', 'y', 'z'] as const).find((a) => hole.normal[a] !== 0)!;
        expect(Math.abs(hole.pos[axis])).toBeCloseTo(panel.size[axis] / 2, 2);
      }
    }
  });

  it('gives the hardware a recognisable shape', () => {
    expect(hardwareShape('Door hinge')).toBe('hinge');
    expect(hardwareShape('Hinge screw')).toBe('screw');
    expect(hardwareShape('Wooden dowel')).toBe('dowel');
    expect(hardwareShape('Corner bracket')).toBe('bracket');
  });

  it('frames a step on where its work is, not on the finished product', () => {
    const top = build.items.find((it) => it.partId === 'TOP')!;
    const dowel = build.items.find((it) => it.partId === 'DOWEL' && it.host !== null)!;
    expect(dowel.step).toBeLessThan(top.step);
    const shot = build.cameras[dowel.step];
    const d = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(d(shot.target, top.kit.pos)).toBeLessThan(d(shot.target, build.product.center));
  });

  it('pushes placed parts apart when exploded', () => {
    const side = build.items.find((it) => it.partId === 'SIDE')!;
    const apart = poseAt(build, side, 2, 1).pos;
    expect(Math.hypot(apart.x - side.target.pos.x, apart.y - side.target.pos.y, apart.z - side.target.pos.z)).toBeGreaterThan(0.1);
  });

  it('still builds a guide with no assembled shape', () => {
    const flat = buildGuide(sanitizeGuide({ ...raw, assembly: { available: false, placements: [] } }, 12));
    expect(flat.hasAssembly).toBe(false);
    expect(flat.items.filter((it) => it.kind === 'panel')).toHaveLength(3);
    expect(flat.items.every((it) => !it.placed)).toBe(true);
  });
});

describe('installation guide hardware placed where the drawing shows it', () => {
  it('puts each dowel on the edge the step drew it on', () => {
    const drawn = sanitizeGuide({
      ...raw,
      steps: raw.steps.map((st, i) => (i === 1 ? {
        ...st,
        parts_used: [{ part_id: 'DOWEL', quantity: 2, fixes_to: 'TOP', spots: [{ where: 'left', u: 0.5, v: 0.5 }, { where: 'right', u: 0.5, v: 0.5 }] }],
      } : st)),
    }, 12);
    const b = buildGuide(drawn);
    const top = b.items.find((it) => it.partId === 'TOP')!;
    const dowels = b.items.filter((it) => it.partId === 'DOWEL' && it.host !== null);
    expect(dowels).toHaveLength(2);
    for (const d of dowels) expect(Math.abs(d.target.pos.x)).toBeGreaterThan(top.size.x / 2 - 0.05);
    expect(Math.sign(dowels[0].target.pos.x)).toBe(-Math.sign(dowels[1].target.pos.x));
  });

  it('drops spots that name no panel', () => {
    const g = sanitizeGuide({ ...raw, steps: raw.steps.map((st, i) => (i === 1 ? { ...st, parts_used: [{ part_id: 'DOWEL', quantity: 1, fixes_to: '', spots: [{ where: 'top', u: 0.2, v: 0.2 }] }] } : st)) }, 12);
    expect(g.steps[1].parts_used[0].spots).toEqual([]);
  });
});

describe('installation guide doors', () => {
  it('swings a door shut on its hinge edge as it goes on', () => {
    const doorGuide = sanitizeGuide({
      ...raw,
      parts: [...raw.parts, { id: 'DOOR', name: 'Door', code: '', quantity: 1, kind: 'panel', size_cm: { x: 40, y: 100, z: 2 }, size_stated: true }],
      steps: [...raw.steps, { title: 'Door', page: 4, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Hang the door.', parts_used: [{ part_id: 'DOOR', quantity: 1, fixes_to: '' }], tools: [], warning: '', people: 1, action: 'place' }],
      assembly: { ...raw.assembly, placements: [...raw.assembly.placements, { part_id: 'DOOR', instance: 0, center_cm: { x: 0, y: 60, z: 15 }, extent_cm: { x: 40, y: 100, z: 2 }, step: 3 }] },
    }, 12);
    const b = buildGuide(doorGuide);
    const door = b.items.find((it) => it.partId === 'DOOR')!;
    expect(door.motion).toBe('swing');
    const mid = poseAt(b, door, door.t0 + (door.ta - door.t0) * 0.75, 0);
    const done = poseAt(b, door, door.ta, 0);
    expect(Math.abs(mid.quat[1])).toBeGreaterThan(0.05);
    expect(done.quat).toEqual(door.target.quat);
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

describe('installation guide read in passes', () => {
  it('merges step batches in page order and ties each placement to the step that places it', async () => {
    const { mergeGuidePasses, KIT_PASS_SCHEMA, STEPS_PASS_SCHEMA, ASSEMBLY_PASS_SCHEMA } = await import('@/lib/installation/guideSchema');
    const kit = { ...raw, steps: undefined, assembly: undefined };
    const later = { steps: raw.steps.slice(2) };
    const earlier = { steps: raw.steps.slice(0, 2) };
    const assembly = {
      available: true,
      placements: raw.assembly.placements.filter((p) => p.part_id !== 'NOPE').map(({ step: _s, ...p }) => ({ ...p, page: 99 })),
    };
    const g = mergeGuidePasses(kit, [later, earlier], assembly, 12);
    expect(g.steps.map((s) => s.title)).toEqual(['What is in the box', 'Dowels', 'Sides']);
    expect(g.assembly.placements.every((p) => p.step === 2)).toBe(true);
    for (const schema of [KIT_PASS_SCHEMA, STEPS_PASS_SCHEMA, ASSEMBLY_PASS_SCHEMA]) {
      expect(schema.additionalProperties).toBe(false);
    }
  });
});

describe('installation guide cabinet built upside down', () => {
  const cabinet = sanitizeGuide({
    ...raw,
    parts: [
      { id: 'SIDE', name: 'Side panel', code: '', quantity: 2, kind: 'panel', size_cm: { x: 2, y: 76, z: 40 }, size_stated: true },
      { id: 'TB', name: 'Top/bottom panel', code: '', quantity: 2, kind: 'panel', size_cm: { x: 76, y: 2, z: 40 }, size_stated: true },
      { id: 'FRONT', name: 'Drawer front panel', code: '', quantity: 1, kind: 'panel', size_cm: { x: 76, y: 16, z: 2 }, size_stated: true },
      { id: 'DSIDE', name: 'Drawer side panel', code: '', quantity: 3, kind: 'panel', size_cm: { x: 36, y: 12, z: 1 }, size_stated: false },
      { id: 'FOOT', name: 'Leveling foot', code: '', quantity: 4, kind: 'hardware', size_cm: { x: 3, y: 10, z: 3 }, size_stated: false },
    ],
    steps: [
      raw.steps[0],
      { title: 'Feet', page: 4, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Fit the feet to the panel.', parts_used: [{ part_id: 'FOOT', quantity: 4, fixes_to: 'TB' }], tools: [], warning: '', people: 1, action: 'attach' },
      { title: 'Carcass', page: 3, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Join it.', parts_used: [{ part_id: 'SIDE', quantity: 2, fixes_to: '' }, { part_id: 'TB', quantity: 2, fixes_to: '' }], tools: [], warning: '', people: 1, action: 'place' },
      { title: 'Drawer', page: 5, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Build the drawer.', parts_used: [{ part_id: 'DSIDE', quantity: 3, fixes_to: '' }, { part_id: 'FRONT', quantity: 1, fixes_to: '' }], tools: [], warning: '', people: 1, action: 'place' },
    ],
    assembly: {
      available: true,
      placements: [
        { part_id: 'SIDE', instance: 1, center_cm: { x: -39, y: 38, z: 0 }, extent_cm: { x: 2, y: 76, z: 40 }, step: 1 },
        { part_id: 'SIDE', instance: 2, center_cm: { x: 39, y: 38, z: 0 }, extent_cm: { x: 2, y: 76, z: 40 }, step: 1 },
        { part_id: 'TB', instance: 1, center_cm: { x: 0, y: 75, z: 0 }, extent_cm: { x: 76, y: 2, z: 40 }, step: 2 },
        { part_id: 'TB', instance: 2, center_cm: { x: 0, y: 1, z: 0 }, extent_cm: { x: 76, y: 2, z: 40 }, step: 2 },
        { part_id: 'FRONT', instance: 1, center_cm: { x: 0, y: 66, z: 21 }, extent_cm: { x: 76, y: 16, z: 2 }, step: 3 },
      ],
    },
  }, 12);
  const b = buildGuide(cabinet);

  it('puts every foot under the cabinet, never on the top panel the step also names', () => {
    const feet = b.items.filter((it) => it.partId === 'FOOT' && it.placed);
    expect(feet.length).toBe(4);
    const bottom = b.product.center.y - b.product.size.y / 2;
    for (const f of feet) expect(poseAt(b, f, b.steps, 0).pos.y).toBeLessThan(bottom + 0.05);
  });

  it('builds the drawer box behind a placed drawer front instead of leaving it in the kit', () => {
    const box = b.items.filter((it) => it.partId === 'DSIDE');
    expect(box.every((it) => it.placed)).toBe(true);
    const front = b.items.find((it) => it.partId === 'FRONT')!;
    for (const it of box) expect(it.target.pos.z).toBeLessThan(front.target.pos.z);
  });
});

describe('installation guide fronts cover the frame as the manual draws them', () => {
  const panel = (id: string, name: string, q: number) => ({ id, name, code: '', quantity: q, kind: 'panel', size_cm: { x: 10, y: 10, z: 10 }, size_stated: false });
  const at = (part_id: string, instance: number, c: [number, number, number], e: [number, number, number]) =>
    ({ part_id, instance, center_cm: { x: c[0], y: c[1], z: c[2] }, extent_cm: { x: e[0], y: e[1], z: e[2] }, step: 1 });
  const g = sanitizeGuide({
    ...raw,
    parts: [panel('SIDE', 'Side panel', 2), panel('MID', 'Divider', 1), panel('TOP', 'Top', 1), panel('DOOR', 'Door', 2), panel('DF', 'Drawer front', 1)],
    steps: [raw.steps[0], { title: 'All', page: 3, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Build it.', parts_used: [], tools: [], warning: '', people: 1, action: 'place' }],
    assembly: {
      available: true,
      placements: [
        at('SIDE', 1, [-60, 38, 0], [2, 76, 40]),
        at('SIDE', 2, [60, 38, 0], [2, 76, 40]),
        at('MID', 1, [0, 38, 0], [2, 76, 40]),
        at('TOP', 1, [0, 78, 0], [122, 3, 42]),
        at('DOOR', 1, [-30, 36, 21], [56, 72, 2]),
        at('DOOR', 2, [30, 30, 21], [56, 48, 2]),
        at('DF', 1, [30, 60, 21], [56, 16, 2]),
      ],
    },
  }, 12);
  const b = buildGuide(g);
  const front = (id: string, n = 0) => b.items.filter((it) => it.partId === id)[n];
  const span = (it: ReturnType<typeof front>, a: 'x' | 'y') => [it.target.pos[a] - it.size[a] / 2, it.target.pos[a] + it.size[a] / 2];
  const floor = b.items.find((it) => it.partId === 'SIDE')!;
  const base = floor.target.pos.y - floor.size.y / 2;

  it('runs a column of fronts from the bottom of the frame to the top of the sides, keeping their proportions', () => {
    const [d0, d1] = span(front('DOOR', 1), 'y');
    const [f0, f1] = span(front('DF'), 'y');
    expect(d0 - base).toBeCloseTo(0, 3);
    expect(f1 - base).toBeCloseTo(0.76, 3);
    expect(f0 - d1).toBeGreaterThan(0);
    expect(f0 - d1).toBeLessThan(0.005);
    expect((d1 - d0) / (f1 - f0)).toBeCloseTo(48 / 16, 1);
  });

  it('meets the next front at the divider and stops at the outside of the end panels', () => {
    const [l0, l1] = span(front('DOOR', 0), 'x');
    const [r0] = span(front('DOOR', 1), 'x');
    expect(l0).toBeCloseTo(-0.61, 3);
    expect(r0 - l1).toBeGreaterThan(0);
    expect(r0 - l1).toBeLessThan(0.005);
  });

  it('never stretches a front over the top panel the frame carries', () => {
    expect(span(front('DOOR', 0), 'y')[1] - base).toBeCloseTo(0.76, 3);
  });
});

function protruding(b: GuideBuild, names: string[]): string[] {
  const p = b.product;
  const out: string[] = [];
  for (const it of b.items) {
    const name = names[it.partIndex] ?? '';
    if (!it.placed || it.kind !== 'hardware' || /foot|leg|level|knob/i.test(name)) continue;
    const pose = poseAt(b, it, b.steps, 0);
    const q = new THREE.Quaternion(...pose.quat);
    for (const s of [-0.5, 0.5]) {
      const e = new THREE.Vector3(0, it.size.y * s, 0).applyQuaternion(q).add(new THREE.Vector3(pose.pos.x, pose.pos.y, pose.pos.z));
      const over = Math.max(...(['x', 'y', 'z'] as const).map((a) => Math.abs(e[a] - p.center[a]) - p.size[a] / 2));
      if (over > 0.02) out.push(`${name} ${(over * 100).toFixed(1)}cm`);
    }
  }
  return out;
}

describe('installation guide hardware stays inside the finished product', () => {
  it('seats screws, lays brackets and rails inside, and leaves nothing sticking out of the outline', () => {
    const g = sanitizeGuide({
      ...raw,
      parts: [
        ...raw.parts.filter((p) => p.id !== 'BAD'),
        { id: 'BRK', name: 'Corner bracket', code: '', quantity: 2, kind: 'hardware', size_cm: { x: 6, y: 6, z: 1 }, size_stated: false },
        { id: 'RAIL', name: 'Drawer rail', code: '', quantity: 1, kind: 'hardware', size_cm: { x: 40, y: 2, z: 2 }, size_stated: false },
        { id: 'SCR', name: 'Confirmat screw', code: '', quantity: 4, kind: 'hardware', size_cm: { x: 0.6, y: 0.6, z: 5 }, size_stated: false },
        { id: 'CAM', name: 'Cam lock', code: '', quantity: 2, kind: 'hardware', size_cm: { x: 1.5, y: 1.5, z: 1 }, size_stated: false },
      ],
      steps: [...raw.steps, { title: 'Fix', page: 4, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, instruction: 'Fix it.', parts_used: [
        { part_id: 'BRK', quantity: 2, fixes_to: 'TOP' }, { part_id: 'RAIL', quantity: 1, fixes_to: 'SIDE' },
        { part_id: 'SCR', quantity: 4, fixes_to: 'SIDE' }, { part_id: 'CAM', quantity: 2, fixes_to: 'TOP' },
      ], tools: [], warning: '', people: 1, action: 'fix' }],
    }, 12);
    expect(protruding(buildGuide(g), g.parts.map((p) => p.name))).toEqual([]);
  });
});
