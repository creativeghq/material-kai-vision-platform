import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { projectFloorPoint, solvePhotoCamera } from '@/lib/installation/photoCamera';
import { layPattern } from '@/lib/installation/tilePieces';
import { lookupAt, normalizeFormat } from '@/lib/surfaceRenderer/patterns';
import { PATTERNS } from '@/lib/surfaceRenderer/patternVocabulary';

function photograph(widthM: number, depthM: number, imgW: number, imgH: number, fov: number, pos: [number, number, number], look: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(fov, imgW / imgH, 0.01, 100);
  cam.position.set(...pos);
  cam.lookAt(...look);
  cam.updateMatrixWorld();
  const toPx = (x: number, z: number) => {
    const v = new THREE.Vector3(x, 0, z).project(cam);
    return { x: ((v.x + 1) / 2) * imgW, y: ((1 - v.y) / 2) * imgH };
  };
  const quad = [
    toPx(-widthM / 2, -depthM / 2), toPx(widthM / 2, -depthM / 2), toPx(widthM / 2, depthM / 2), toPx(-widthM / 2, depthM / 2),
  ] as [ReturnType<typeof toPx>, ReturnType<typeof toPx>, ReturnType<typeof toPx>, ReturnType<typeof toPx>];
  return { cam, quad, toPx };
}

describe('matching the 3D floor to a room photo', () => {
  const cases: Array<{ name: string; w: number; d: number; fov: number; pos: [number, number, number]; look: [number, number, number] }> = [
    { name: 'standing in the doorway', w: 3.2, d: 4.1, fov: 55, pos: [0.4, 1.6, 4.2], look: [0, 0, -0.4] },
    { name: 'from a corner, turned', w: 2.6, d: 2.2, fov: 62, pos: [-2.1, 1.45, 2.4], look: [0.3, 0.1, -0.2] },
  ];
  for (const c of cases) {
    it(`recovers the camera ${c.name}`, () => {
      const imgW = 1600;
      const imgH = 1200;
      const { cam, quad, toPx } = photograph(c.w, c.d, imgW, imgH, c.fov, c.pos, c.look);
      const solved = solvePhotoCamera(quad, imgW, imgH, c.w, c.d);
      expect(solved).not.toBeNull();
      expect(solved!.fovDeg).toBeCloseTo(cam.fov, 0);
      expect(Math.hypot(...solved!.position.map((p, i) => p - c.pos[i]))).toBeLessThan(0.02);
      for (const [x, z] of [[0, 0], [0.7, -0.9], [-1, 0.5]] as const) {
        const want = toPx(x, z);
        const got = projectFloorPoint(solved!, imgW, imgH, x, z);
        expect(Math.abs(got.x - want.x)).toBeLessThan(1);
        expect(Math.abs(got.y - want.y)).toBeLessThan(1);
      }
    });
  }

  it('refuses a degenerate quad rather than inventing a camera', () => {
    const p = { x: 10, y: 10 };
    expect(solvePhotoCamera([p, p, p, p], 100, 100, 1, 1)).toBeNull();
  });
});

describe('3D tile pieces follow the same lattice as the 2D visualizer', () => {
  const W = 300;
  const L = 600;
  const g = 3;
  const area = { x0: 0, z0: 0, x1: 2400, z1: 1800 };
  for (const pattern of PATTERNS) {
    for (const rotationDeg of [0, 30]) {
      it(`${pattern} at ${rotationDeg}° puts a piece wherever the visualizer draws tile`, () => {
        const pieces = layPattern(pattern, W, L, g, { originX: 0, originZ: 0, rotationDeg }, area);
        expect(pieces.length).toBeGreaterThan(0);
        const format = normalizeFormat(W / 10, L / 10);
        const inside = (px: number, pz: number) => pieces.some((p) => {
          const dx = px - p.cx;
          const dz = pz - p.cz;
          const c = Math.cos(-p.angle);
          const s = Math.sin(-p.angle);
          const u = dx * c + dz * s;
          const v = -dx * s + dz * c;
          return Math.abs(u) <= p.length / 2 + 0.01 && Math.abs(v) <= p.width / 2 + 0.01;
        });
        let checked = 0;
        for (let x = 37; x < area.x1; x += 173) {
          for (let z = 29; z < area.z1; z += 157) {
            const hit = lookupAt(x / 10, z / 10, format, pattern, g / 10, rotationDeg);
            if (hit.grout) continue;
            checked++;
            expect(inside(x, z)).toBe(true);
          }
        }
        expect(checked).toBeGreaterThan(20);
      });
    }
  }
});
