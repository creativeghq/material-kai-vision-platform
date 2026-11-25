import { BoxGeometry, Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { fitMesh } from '@/components/features/scenestudio/meshModel';
import { isMeshModel } from '@/lib/scene/splatFit';

describe('mesh models in the 3D room', () => {
  it('a .glb is a mesh, every other model file is splats', () => {
    expect(isMeshModel('https://x/y/model.glb')).toBe(true);
    expect(isMeshModel('https://x/y/model.GLB?v=2')).toBe(true);
    for (const u of ['https://x/model.spz', 'https://x/model.ply', 'https://x/a.glb.spz']) expect(isMeshModel(u)).toBe(false);
  });

  it('stands in its true-size box, on the floor and centred, and answers to its object', () => {
    const source = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 1, 0.5), new MeshStandardMaterial());
    mesh.position.set(7, 3, -2);
    source.add(mesh);
    const out = fitMesh(source, 1.8, 0.45, 0.9, { objectId: 'o1', idHex: '#010203' })!;
    const box = new Box3().setFromObject(out);
    const size = box.getSize(new Vector3());
    expect([size.x, size.y, size.z].map((v) => Number(v.toFixed(3)))).toEqual([1.8, 0.9, 0.45]);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0, 5);
    out.traverse((o) => { if ((o as Mesh).isMesh) { expect(o.userData.objectId).toBe('o1'); expect(o.castShadow).toBe(true); } });
    expect(mesh.userData.objectId).toBeUndefined();
    expect(fitMesh(new Group(), 1, 1, 1, {})).toBeNull();
  });
});
