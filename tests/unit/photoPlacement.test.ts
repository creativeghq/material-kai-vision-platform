import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { cameraOnFrontFace } from '@/lib/installation/photoPlacement';

describe('photo camera placed on the product', () => {
  it('recovers the camera from the front face of the product', () => {
    const W = 1.8;
    const H = 0.9;
    const front = { x: 0.3, y: H / 2, z: 0.5 };
    const imgW = 1200;
    const imgH = 900;
    const truth = new THREE.PerspectiveCamera(45, imgW / imgH, 0.05, 50);
    truth.position.set(0.9, 1.55, 3.6);
    truth.lookAt(front.x, 0.5, front.z);
    truth.updateMatrixWorld();
    const corners = [[front.x - W / 2, 0], [front.x + W / 2, 0], [front.x + W / 2, H], [front.x - W / 2, H]];
    const pts = corners.map(([x, y]) => {
      const p = new THREE.Vector3(x, y, front.z).project(truth);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    });
    const cam = cameraOnFrontFace(pts, imgW, imgH, W, H, front)!;
    expect(cam).not.toBeNull();
    expect(cam.position[0]).toBeCloseTo(0.9, 1);
    expect(cam.position[1]).toBeCloseTo(1.55, 1);
    expect(cam.position[2]).toBeCloseTo(3.6, 1);
    const solved = new THREE.PerspectiveCamera(cam.fovDeg, imgW / imgH, 0.05, 50);
    solved.position.set(...cam.position);
    solved.quaternion.set(...cam.quaternion);
    solved.updateMatrixWorld();
    corners.forEach(([x, y], i) => {
      const p = new THREE.Vector3(x, y, front.z).project(solved);
      expect((p.x + 1) / 2).toBeCloseTo(pts[i].x, 2);
      expect((1 - p.y) / 2).toBeCloseTo(pts[i].y, 2);
    });
  });
});
