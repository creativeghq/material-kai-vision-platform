import React, { useContext, useEffect, useId, useState } from 'react';
import { Box3, Group, Vector3, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { AssetContext } from '@/components/features/scenestudio/assetContext';
import { fitModel } from '@/lib/scene/splatFit';

const loaded = new Map<string, Promise<Object3D>>();

function load(url: string): Promise<Object3D> {
  const known = loaded.get(url);
  if (known) return known;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const job = loader.loadAsync(url).then((g) => g.scene as Object3D);
  loaded.set(url, job);
  job.catch(() => loaded.delete(url));
  return job;
}

/** Stands a mesh in its true-size box: on the floor, centred, front to +Z. Null when there is nothing to draw. */
export function fitMesh(source: Object3D, w: number, d: number, h: number, userData: Record<string, unknown>): Group | null {
  const copy = source.clone(true);
  copy.updateMatrixWorld(true);
  const box = new Box3().setFromObject(copy);
  if (box.isEmpty()) return null;
  const size = box.getSize(new Vector3());
  const [kx, ky, kz] = fitModel({ x: size.z, y: size.y, z: size.x }, w, d, h);
  const c = box.getCenter(new Vector3());
  const out = new Group();
  out.add(copy);
  out.scale.set(kx, ky, kz);
  out.position.set(-c.x * kx, -box.min.y * ky, -c.z * kz);
  out.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData = { ...o.userData, ...userData };
  });
  return out;
}

/** A real mesh for an object; `children` stand in while it loads and if it cannot. */
export const MeshModel: React.FC<React.PropsWithChildren<{ url: string; w: number; d: number; h: number; objectId: string; idHex: string }>> = ({ url, w, d, h, objectId, idHex, children }) => {
  const [model, setModel] = useState<Group | null>(null);
  const track = useContext(AssetContext);
  const key = useId();
  useEffect(() => {
    let live = true;
    track(key, true);
    load(url)
      .then((source) => { if (live) setModel(fitMesh(source, w, d, h, { objectId, idHex })); })
      .catch(() => { if (live) setModel(null); })
      .finally(() => { if (live) track(key, false); });
    return () => { live = false; track(key, false); };
  }, [url, w, d, h, objectId, idHex, track, key]);
  return model ? <primitive object={model} /> : <>{children}</>;
};
