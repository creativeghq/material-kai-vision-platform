import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { cameraOnProduct } from '@/lib/installation/photoPlacement';

describe('photo camera placed on the product', () => {
  it('recovers the camera that photographed the product footprint', () => {
    const W = 1.8;
    const D = 0.6;
    const center = { x: 0.3, z: 0.2 };
    const imgW = 1024;
    const imgH = 768;
    const truth = new THREE.PerspectiveCamera(50, imgW / imgH, 0.05, 50);
    truth.position.set(1.2, 1.5, 3.4);
    truth.lookAt(center.x, 0.3, center.z);
    truth.updateMatrixWorld();
    const corners = [
      [center.x - W / 2, center.z + D / 2],
      [center.x + W / 2, center.z + D / 2],
      [center.x + W / 2, center.z - D / 2],
      [center.x - W / 2, center.z - D / 2],
    ];
    const footprint = corners.map(([x, z]) => {
      const p = new THREE.Vector3(x, 0, z).project(truth);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    });

    const cam = cameraOnProduct(footprint, imgW, imgH, W, D, center)!;
    expect(cam).not.toBeNull();
    expect(cam.position[0]).toBeCloseTo(1.2, 1);
    expect(cam.position[1]).toBeCloseTo(1.5, 1);
    expect(cam.position[2]).toBeCloseTo(3.4, 1);
    expect(cam.fovDeg).toBeCloseTo(50, 0);

    const solved = new THREE.PerspectiveCamera(cam.fovDeg, imgW / imgH, 0.05, 50);
    solved.position.set(...cam.position);
    solved.quaternion.set(...cam.quaternion);
    solved.updateMatrixWorld();
    corners.forEach(([x, z], i) => {
      const p = new THREE.Vector3(x, 0, z).project(solved);
      expect((p.x + 1) / 2).toBeCloseTo(footprint[i].x, 2);
      expect((1 - p.y) / 2).toBeCloseTo(footprint[i].y, 2);
    });
  });
});
