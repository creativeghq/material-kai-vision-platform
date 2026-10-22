import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { cameraOnFrontFace, cameraOnProduct } from '@/lib/installation/photoPlacement';

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
