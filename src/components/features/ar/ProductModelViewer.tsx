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

// The placement math lives in a React-free module so the #258 embed bundle can use the SAME
// function rather than a copy — see modelTransform.ts. Re-exported here because this was its
// original home and callers (plus the guard test's older import path) still name it.
export { TARGET_SIZE, normalizeModelTransform } from './modelTransform';
import { TARGET_SIZE, normalizeModelTransform } from './modelTransform';

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
