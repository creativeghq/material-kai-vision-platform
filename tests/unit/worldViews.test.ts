import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { pointInPolygon } from '@/lib/scene/sceneGeometry';
import { crowded } from '@/lib/scene/splatFit';
import { roomPoses, type WalkRoom } from '@/lib/scene/walkthroughTimeline';
import { MAX_WORLD_VIEWS, encodeLogDepthPng, nearest, solidDots, worldViewPoses } from '@/lib/scene/worldViews';

const ROOM = { outline: [[4055, 100], [7145, 100], [7145, 4900], [4055, 4900]] as Array<[number, number]>, height_mm: 2700 };
const FRAME = { cx: 5000, cy: 2500 };
const PLANT = { x_mm: 6850, y_mm: 450, width_mm: 500, depth_mm: 500, rotation_deg: 0, top_mm: 1600 };
const SOFA = { x_mm: 5600, y_mm: 4350, width_mm: 2400, depth_mm: 900, rotation_deg: 180, top_mm: 850 };

const plan = (p: [number, number, number]): [number, number] => [p[0] * 1000 + FRAME.cx, p[2] * 1000 + FRAME.cy];

describe('worldViewPoses', () => {
  const shot = { position: [1.95, 1.45, 2.2] as [number, number, number], target: [-0.3, 1, -2] as [number, number, number], fov: 62 };
  const poses = worldViewPoses(ROOM, FRAME, [PLANT, SOFA], shot);
  const wallGap = ([x, y]: [number, number]) => Math.min(x - 4055, 7145 - x, y - 100, 4900 - y);

  it('covers the room, and never films from the approved shot when that stands against a wall', () => {
    expect(poses).not.toContainEqual(shot);
    expect(poses.length).toBeGreaterThanOrEqual(12);
    expect(poses.length).toBeLessThanOrEqual(MAX_WORLD_VIEWS);
    const open = { ...shot, position: [0.6, 1.45, 0] as [number, number, number] };
    expect(worldViewPoses(ROOM, FRAME, [PLANT, SOFA], open)[0]).toEqual(open);
  });

  it('keeps every camera inside the room, off the walls and out of tall furniture', () => {
    for (const p of poses) {
      const [x, y] = plan(p.position);
      expect(wallGap([x, y])).toBeGreaterThanOrEqual(599);
      const dx = Math.max(Math.abs(x - PLANT.x_mm) - PLANT.width_mm / 2, 0);
      const dy = Math.max(Math.abs(y - PLANT.y_mm) - PLANT.depth_mm / 2, 0);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(400);
    }
  });

  it('faces every wall straight on and looks down at the floor', () => {
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(poses.some((p) => {
        const [dx, , dz] = p.target.map((t, i) => t - p.position[i]);
        return (dx * nx + dz * nz) / Math.hypot(dx, dz) > 0.99;
      })).toBe(true);
    }
    expect(poses.filter((p) => p.target[1] === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('a narrow room steps closer to its walls rather than finding nowhere to stand', () => {
    const hall = { outline: [[0, 0], [1000, 0], [1000, 4000], [0, 4000]] as Array<[number, number]>, height_mm: 2700 };
    expect(worldViewPoses(hall, { cx: 500, cy: 2000 }, []).length).toBeGreaterThanOrEqual(6);
  });

  it('looks in every direction', () => {
    const angles = poses.map((p) => Math.atan2(p.target[2] - p.position[2], p.target[0] - p.position[0]));
    for (const want of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
      expect(angles.some((a) => Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))) < 0.8)).toBe(true);
    }
  });
});

describe('encodeLogDepthPng', () => {
  it('writes a 16-bit gray PNG with the nearest surface white and empty pixels zero', async () => {
    const { png, zMin, zMax } = await encodeLogDepthPng(new Float32Array([1, 2, 4, 0]), 2, 2);
    expect([zMin, zMax]).toEqual([1, 4]);
    const b = Buffer.from(await png.arrayBuffer());
    expect(b.subarray(1, 4).toString()).toBe('PNG');
    expect([b.readUInt32BE(16), b.readUInt32BE(20), b[24], b[25]]).toEqual([2, 2, 16, 0]);
    const raw = inflateSync(b.subarray(41, 41 + b.readUInt32BE(33)));
    expect([raw.readUInt16BE(1), raw.readUInt16BE(3), raw.readUInt16BE(6), raw.readUInt16BE(8)]).toEqual([65535, 32768, 1, 0]);
  });
});

describe('furniture depth', () => {
  const W = 60; const H = 60;
  it('fills pinholes, drops a stray dot and keeps the rest of the picture empty', () => {
    const dots = new Float32Array(W * H);
    for (let y = 15; y < 45; y++) for (let x = 15; x < 45; x++) dots[y * W + x] = 2;
    dots[30 * W + 30] = 0;
    dots[5 * W + 5] = 1;
    const out = solidDots(dots, W, H);
    expect(out[30 * W + 30]).toBe(2);
    expect(out[5 * W + 5]).toBe(0);
    expect(out[55 * W + 55]).toBe(0);
    expect([...nearest(new Float32Array([3, 0, 1]), new Float32Array([2, 4, 5]))]).toEqual([2, 4, 1]);
  });

  it('drops splats that float alone and keeps the crowded ones', () => {
    const n = 400;
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n - 1; i++) { xyz[i * 3] = (i % 20) * 0.01; xyz[i * 3 + 1] = Math.floor(i / 20) * 0.01; }
    xyz.set([3, 3, 3], (n - 1) * 3);
    const keep = crowded(xyz, new Float32Array(n).fill(0.9));
    expect(keep[n - 1]).toBe(0);
    expect(keep[200]).toBe(1);
  });
});

describe('the walkthrough of a photoreal room', () => {
  it('starts from an open spot the room was filmed from, not from the render camera', () => {
    const room: WalkRoom = { centre: [0, 0], far: [2, 2], focus: [0, 1], corners: [[-2, -2], [2, -2], [2, 2], [-2, 2]], shot: null, start: [1, -1.2] };
    const [a, b] = roomPoses(room);
    expect([a.position[0], a.position[2]]).toEqual([1, -1.2]);
    expect(Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2])).toBeLessThanOrEqual(0.5);
  });
});
