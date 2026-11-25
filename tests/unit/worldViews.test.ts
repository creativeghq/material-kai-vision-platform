import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { pointInPolygon } from '@/lib/scene/sceneGeometry';
import { MAX_WORLD_VIEWS, encodeLogDepthPng, worldViewPoses } from '@/lib/scene/worldViews';

const ROOM = { outline: [[4055, 100], [7145, 100], [7145, 4900], [4055, 4900]] as Array<[number, number]>, height_mm: 2700 };
const FRAME = { cx: 5000, cy: 2500 };
const PLANT = { x_mm: 6850, y_mm: 450, width_mm: 500, depth_mm: 500, rotation_deg: 0, top_mm: 1600 };
const SOFA = { x_mm: 5600, y_mm: 4350, width_mm: 2400, depth_mm: 900, rotation_deg: 180, top_mm: 850 };

const plan = (p: [number, number, number]): [number, number] => [p[0] * 1000 + FRAME.cx, p[2] * 1000 + FRAME.cy];

describe('worldViewPoses', () => {
  const shot = { position: [1.95, 1.45, 2.2] as [number, number, number], target: [-0.3, 1, -2] as [number, number, number], fov: 62 };
  const poses = worldViewPoses(ROOM, FRAME, [PLANT, SOFA], shot);

  it('starts from the approved shot and covers the room with enough views', () => {
    expect(poses[0]).toEqual(shot);
    expect(poses.length).toBeGreaterThanOrEqual(8);
    expect(poses.length).toBeLessThanOrEqual(MAX_WORLD_VIEWS);
  });

  it('keeps every planned camera inside the room and out of tall furniture', () => {
    for (const p of poses.slice(1)) {
      const [x, y] = plan(p.position);
      expect(pointInPolygon(x, y, ROOM.outline)).toBe(true);
      const dx = Math.max(Math.abs(x - PLANT.x_mm) - PLANT.width_mm / 2, 0);
      const dy = Math.max(Math.abs(y - PLANT.y_mm) - PLANT.depth_mm / 2, 0);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(300);
    }
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
