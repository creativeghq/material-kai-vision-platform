/**
 * Turntable placement math for an arbitrary product model (#321).
 *
 * Deliberately free of React, drei and R3F. It was originally exported from `ProductModelViewer.tsx`,
 * which is fine for the in-app viewer but not for the #258 embed bundle: that ships to a customer's
 * own website as a plain web component, and importing this from a `.tsx` would drag React and drei
 * into a bundle that has no use for either.
 *
 * Same split, and the same reason, as `src/utils/embedOrigins.ts`. The in-app viewer re-exports
 * these so its own call sites are unchanged, and
 * [tests/unit/productModelNormalization.test.ts](../../../../tests/unit/productModelNormalization.test.ts)
 * drives THIS module against a real `.glb` — the guard follows the code rather than a copy of it.
 */
import { Box3, Vector3, type Object3D } from 'three';

/** Scene units the model's largest dimension is normalized to. */
export const TARGET_SIZE = 2.5;

/**
 * Uniform scale so the model's largest dimension is TARGET_SIZE, plus an offset that centers it on
 * x/z and rests its bounding-box bottom on y=0.
 *
 * The turntable camera is tuned in scene units, so a 4 m wardrobe and a 20 cm vase should occupy
 * the same frame. True-to-scale rendering is AR's job (USDZ and Scene Viewer carry real units),
 * not the preview's.
 */
export function normalizeModelTransform(object: Object3D): { scale: number; offset: Vector3 } {
  const box = new Box3().setFromObject(object);
  // An empty box (a GLB that parses but holds no renderable mesh — lights and empty nodes only, a
  // real exporter artifact) has min = +Infinity. getSize() and getCenter() special-case that, but
  // reading box.min directly does not, and -Infinity in the offset poisons the whole scene graph's
  // matrices. Found by rendering a real export, not by typechecking: -Infinity is a valid number.
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
