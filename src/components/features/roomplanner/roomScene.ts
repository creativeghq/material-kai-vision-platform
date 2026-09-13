/** True-scale placement for the 3D room view (#321 M3, #259 Phase 2). */
import { Box3, Vector3, type Object3D } from 'three';
import type { SurfaceKey } from '@/services/roomPlannerService';

/** Which edge each wall stands on: the direction from the room's centre to that wall. Plan north is -z. */
export const WALL_NORMALS: Array<{ key: SurfaceKey; normal: [number, number] }> = [
  { key: 'wall_north', normal: [0, -1] },
  { key: 'wall_south', normal: [0, 1] },
  { key: 'wall_east', normal: [1, 0] },
  { key: 'wall_west', normal: [-1, 0] },
];

/** Where an inward-facing wall stands, how wide it is, and its rotation about y. */
export function wallTransform(
  normal: [number, number],
  widthM: number,
  depthM: number,
  heightM: number,
): { position: [number, number, number]; span: number; rotationY: number } {
  const [nx, nz] = normal;
  return {
    position: [(nx * widthM) / 2, heightM / 2, (nz * depthM) / 2],
    span: nx !== 0 ? depthM : widthM,
    // A plane faces +z; turning it by this angle points it back at the centre.
    rotationY: Math.atan2(-nx, -nz),
  };
}

export interface TrueScalePlacement {
  /** Uniform scale factor to apply to the model. */
  scale: number;
  /** Offset applied AFTER scaling: centres on x/z and rests the model on y = 0. */
  offset: Vector3;
}

/** Scale a model so it occupies its planned footprint, and sit it on the floor. */
export function trueScaleTransform(
  object: Object3D,
  targetWidthM: number,
  targetDepthM: number,
): TrueScalePlacement {
  const box = new Box3().setFromObject(object);
  // An empty box (a GLB that parses but holds no renderable mesh) reports min = +Infinity, and
  // reading it directly poisons every matrix downstream. Same trap the turntable transform hit.
  if (box.isEmpty()) return { scale: 1, offset: new Vector3(0, 0, 0) };

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  const wRatio = size.x > 1e-6 && targetWidthM > 0 ? targetWidthM / size.x : 1;
  const dRatio = size.z > 1e-6 && targetDepthM > 0 ? targetDepthM / size.z : 1;
  const scale = Math.min(wRatio, dRatio);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  return {
    scale: safeScale,
    offset: new Vector3(-center.x * safeScale, -box.min.y * safeScale, -center.z * safeScale),
  };
}

/**
 * Room metres → scene position for an item.
 *
 * The plan's origin is the room's TOP-LEFT corner with y running "down" the page; the scene's
 * origin is the room's CENTRE with z running toward the camera. Getting this conversion wrong
 * mirrors the room — every item lands on the opposite side, which looks like a plausible room and
 * is the wrong one.
 */
export function planToScene(
  xM: number,
  yM: number,
  room: { widthM: number; depthM: number },
): [number, number, number] {
  return [xM - room.widthM / 2, 0, yM - room.depthM / 2];
}

/** Plan rotation (degrees, clockwise on the page) → scene Y rotation in radians. */
export function planRotationToScene(rotationDeg: number): number {
  // Negated: a clockwise turn on a top-down plan is a negative rotation about scene +Y, which
  // points up out of the floor.
  const radians = (-rotationDeg * Math.PI) / 180;
  // `+ 0` normalises -0 to 0, and the finite check catches a NaN rotation before it reaches a
  // matrix. Both are the same class of bug as the -Infinity offset the turntable transform hit:
  // a non-finite value propagates through every matrix multiply in the scene graph, and nothing
  // raises — the room simply stops rendering.
  return Number.isFinite(radians) ? radians + 0 : 0;
}

/** A camera position that frames the whole room from a comfortable angle. */
export function roomCameraPosition(room: { widthM: number; depthM: number }): [number, number, number] {
  const span = Math.max(room.widthM, room.depthM, 1);
  return [span * 0.75, span * 0.85, span * 1.1];
}
