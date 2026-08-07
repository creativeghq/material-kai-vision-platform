/**
 * Real glTF/GLB product model rendering (#321 asset foundation).
 *
 * `ProductModelStage` is Canvas *content* — drop it inside any R3F Canvas
 * (ARPreviewModal today; configurator and room planner later). It loads the
 * model with drei's `useGLTF` (GLTFLoader ships via three-stdlib, so this all
 * stays inside the existing `vendor-3d` chunk), then centers the scene and
 * normalizes it to a fixed on-screen size: the turntable camera is tuned in
 * scene units, so a 4 m wardrobe and a 20 cm vase should occupy the same
 * frame. True-to-scale rendering is AR's job (USDZ carries real units), not
 * the preview's.
 */
import React, { useMemo } from 'react';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';
import { Box3, Vector3, type Object3D } from 'three';

/** Scene units the model's largest dimension is normalized to. */
export const TARGET_SIZE = 2.5;

/**
 * Turntable placement for an arbitrary model: uniform scale so its largest
 * dimension is TARGET_SIZE, and an offset that centers it on x/z and rests its
 * bounding-box bottom on y=0. Exported as a pure function so the guard test can
 * exercise this exact code against a real GLB rather than a copy of the math.
 */
export function normalizeModelTransform(object: Object3D): { scale: number; offset: Vector3 } {
  const box = new Box3().setFromObject(object);
  // An empty box (a GLB that parses but holds no renderable mesh — lights and
  // empty nodes only, a real exporter artifact) has min = +Infinity. getSize()
  // and getCenter() special-case that, but reading box.min directly does not,
  // and -Infinity in the offset poisons the whole scene graph's matrices.
  if (box.isEmpty()) return { scale: 1, offset: new Vector3(0, 0, 0) };

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = TARGET_SIZE / maxDim;
  return {
    scale,
    offset: new Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale),
  };
}

interface ProductModelProps {
  url: string;
}

const ProductModel: React.FC<ProductModelProps> = ({ url }) => {
  const gltf = useGLTF(url);
  const { scale, offset } = useMemo(() => normalizeModelTransform(gltf.scene), [gltf.scene]);

  return (
    <group position={offset} scale={scale}>
      <primitive object={gltf.scene} />
    </group>
  );
};

interface ProductModelStageProps {
  url: string;
}

export const ProductModelStage: React.FC<ProductModelStageProps> = ({ url }) => (
  <>
    <Environment preset="apartment" background={false} />
    <ambientLight intensity={0.4} />
    <directionalLight position={[5, 8, 5]} intensity={1.0} castShadow />
    <directionalLight position={[-3, 4, -2]} intensity={0.4} />
    <pointLight position={[0, 5, 0]} intensity={0.3} />

    <ProductModel url={url} />

    <OrbitControls
      enablePan={false}
      enableZoom
      enableRotate
      minDistance={2}
      maxDistance={8}
      target={[0, TARGET_SIZE / 2 - 0.25, 0]}
    />
  </>
);
