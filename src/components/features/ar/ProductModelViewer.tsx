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
import React, { useEffect, useMemo } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { PresetLighting, DEFAULT_PRESET } from '@/components/features/lighting/PresetLighting';
import type { PresetKey } from '@/components/features/lighting/lightingPresets';

import {
  applyMaterialOverrides, cloneSceneWithOwnMaterials, unmatchedTargets, type MaterialOverride,
} from './materialOverrides';

// The placement math lives in a React-free module so the #258 embed bundle can use the SAME
// function rather than a copy — see modelTransform.ts. Re-exported here because this was its
// original home and callers (plus the guard test's older import path) still name it.
export { TARGET_SIZE, normalizeModelTransform } from './modelTransform';
import { TARGET_SIZE, normalizeModelTransform } from './modelTransform';

interface ProductModelProps {
  url: string;
  /** Configurator choices (#321 M2). Omit for a plain, unconfigured render. */
  overrides?: MaterialOverride[];
  /** Reports target material names that matched nothing — an authoring error, not a no-op. */
  onUnmatchedTargets?: (names: string[]) => void;
}

const ProductModel: React.FC<ProductModelProps> = ({ url, overrides, onUnmatchedTargets }) => {
  const gltf = useGLTF(url);

  // Own copies of the node tree AND the materials. `useGLTF` caches by URL and `clone()` shares
  // material references, so recolouring the loaded scene directly would repaint every other view
  // of this product — the AR preview, a second configurator, the next component to hit the cache.
  const scene = useMemo(() => cloneSceneWithOwnMaterials(gltf.scene), [gltf.scene]);
  const { scale, offset } = useMemo(() => normalizeModelTransform(scene), [scene]);

  useEffect(() => {
    if (!overrides) return;
    const hits = applyMaterialOverrides(scene, overrides);
    onUnmatchedTargets?.(unmatchedTargets(hits));
    // `overrides` is rebuilt each render by the parent; depend on its CONTENT, not its identity,
    // or every parent render re-traverses the scene graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, JSON.stringify(overrides)]);

  return (
    <group position={offset} scale={scale}>
      <primitive object={scene} />
    </group>
  );
};

interface ProductModelStageProps {
  url: string;
  overrides?: MaterialOverride[];
  onUnmatchedTargets?: (names: string[]) => void;
  /** Which of the shared lighting presets to light this with (#335). */
  lighting?: PresetKey;
}

export const ProductModelStage: React.FC<ProductModelStageProps> = ({
  url, overrides, onUnmatchedTargets, lighting = DEFAULT_PRESET,
}) => (
  <>
    <PresetLighting preset={lighting} castShadow />

    <ProductModel url={url} overrides={overrides} onUnmatchedTargets={onUnmatchedTargets} />

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
