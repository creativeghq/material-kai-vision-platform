/**
 * True-scale room placement guard (#321 M3, #259 Phase 2).
 *
 * The 3D room and the 2D plan must agree about how big things are, and every way they can disagree
 * produces a room that renders beautifully and is wrong:
 *
 *  • Reusing the TURNTABLE transform would scale every model to a fixed on-screen size, so a
 *    wardrobe and a vase would come out the same — a plan you cannot order from.
 *  • Getting the plan→scene origin conversion wrong mirrors the room. Everything lands on the
 *    opposite side, which is a perfectly plausible room and the wrong one.
 *
 * Driven against the real fixture, whose true size is known.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Box3, Vector3, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  trueScaleTransform, planToScene, planRotationToScene, roomCameraPosition,
} from '@/components/features/roomplanner/roomScene';
import { normalizeModelTransform } from '@/components/features/ar/modelTransform';

const FIXTURE = path.resolve(__dirname, '../fixtures/armchair.glb');

let scene: Group;
let trueSize: Vector3;

beforeAll(async () => {
  const buf = readFileSync(FIXTURE);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<any>((resolve, reject) =>
    new GLTFLoader().parse(ab, '', resolve, reject),
  );
  scene = gltf.scene;
  trueSize = new Box3().setFromObject(scene).getSize(new Vector3());
});

/** Size of the model after a placement is applied, in metres. */
function placedSize(t: { scale: number }): Vector3 {
  return trueSize.clone().multiplyScalar(t.scale);
}

describe('the fixture is authored at real-world scale', () => {
  it('is roughly an armchair, not a unit cube', () => {
    expect(trueSize.x).toBeGreaterThan(0.5);
    expect(trueSize.x).toBeLessThan(1.5);
    expect(trueSize.z).toBeGreaterThan(0.5);
    expect(trueSize.z).toBeLessThan(1.5);
  });
});

describe('trueScaleTransform', () => {
  it('leaves a correctly-measured model essentially untouched', () => {
    // The normal case: the footprint came from this model's own measurements, so scale ≈ 1.
    const t = trueScaleTransform(scene, trueSize.x, trueSize.z);
    expect(t.scale).toBeCloseTo(1, 5);
  });

  it('fits the model inside its planned footprint, never outside it', () => {
    const t = trueScaleTransform(scene, 0.5, 0.5);
    const size = placedSize(t);
    expect(size.x).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(size.z).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('scales UNIFORMLY — a stretched product is a worse lie than a slightly small one', () => {
    const t = trueScaleTransform(scene, trueSize.x * 2, trueSize.z);
    const size = placedSize(t);
    // Width was allowed to double but depth was not, so the smaller ratio (1) wins on both axes
    // and the proportions are preserved.
    expect(size.x / size.z).toBeCloseTo(trueSize.x / trueSize.z, 5);
  });

  it('rests the model on the floor rather than burying or floating it', () => {
    const t = trueScaleTransform(scene, trueSize.x, trueSize.z);
    const box = new Box3().setFromObject(scene);
    expect(box.min.y * t.scale + t.offset.y).toBeCloseTo(0, 6);
  });

  it('centres the model on x and z', () => {
    const t = trueScaleTransform(scene, trueSize.x, trueSize.z);
    const c = new Box3().setFromObject(scene).getCenter(new Vector3());
    expect(c.x * t.scale + t.offset.x).toBeCloseTo(0, 6);
    expect(c.z * t.scale + t.offset.z).toBeCloseTo(0, 6);
  });

  it('returns an identity for a model with no renderable mesh, not -Infinity', () => {
    const empty = new (scene.constructor as any)();
    const t = trueScaleTransform(empty, 2, 2);
    expect(t.scale).toBe(1);
    expect(Number.isFinite(t.offset.x)).toBe(true);
    expect(Number.isFinite(t.offset.y)).toBe(true);
    expect(Number.isFinite(t.offset.z)).toBe(true);
  });

  it('survives a zero or negative target instead of scaling to nothing', () => {
    expect(trueScaleTransform(scene, 0, 0).scale).toBe(1);
    expect(trueScaleTransform(scene, -3, 2).scale).toBeGreaterThan(0);
  });

  // The distinction the whole file exists for.
  it('is NOT the turntable transform — that one normalises size away', () => {
    const room = trueScaleTransform(scene, trueSize.x, trueSize.z);
    const turntable = normalizeModelTransform(scene);
    expect(room.scale).not.toBeCloseTo(turntable.scale, 3);
    expect(room.scale).toBeCloseTo(1, 5);
  });
});

describe('planToScene', () => {
  const room = { widthM: 5, depthM: 4 };

  it('maps the room centre to the scene origin', () => {
    expect(planToScene(2.5, 2, room)).toEqual([0, 0, 0]);
  });

  it('maps the plan top-left corner to negative x and z', () => {
    expect(planToScene(0, 0, room)).toEqual([-2.5, 0, -2]);
  });

  it('does not mirror the room — left stays left, top stays back', () => {
    const [leftX] = planToScene(1, 2, room);
    const [rightX] = planToScene(4, 2, room);
    expect(leftX).toBeLessThan(rightX);
    const [, , topZ] = planToScene(2.5, 0.5, room);
    const [, , bottomZ] = planToScene(2.5, 3.5, room);
    expect(topZ).toBeLessThan(bottomZ);
  });
});

describe('planRotationToScene', () => {
  it('is zero at zero', () => {
    expect(planRotationToScene(0)).toBe(0);
  });

  it('turns a clockwise plan rotation into a negative scene rotation about +Y', () => {
    expect(planRotationToScene(90)).toBeCloseTo(-Math.PI / 2, 6);
    expect(planRotationToScene(180)).toBeCloseTo(-Math.PI, 6);
  });

  // Same class as the -Infinity offset: a non-finite value propagates silently through every
  // matrix multiply and the room just stops rendering, with nothing raised.
  it('refuses to emit a non-finite rotation into the scene graph', () => {
    expect(planRotationToScene(Number.NaN)).toBe(0);
    expect(planRotationToScene(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('roomCameraPosition', () => {
  it('backs off further for a bigger room', () => {
    const small = roomCameraPosition({ widthM: 3, depthM: 3 });
    const big = roomCameraPosition({ widthM: 12, depthM: 9 });
    expect(big[2]).toBeGreaterThan(small[2]);
    expect(big[1]).toBeGreaterThan(small[1]);
  });

  it('stays above the floor even for a degenerate room', () => {
    expect(roomCameraPosition({ widthM: 0, depthM: 0 })[1]).toBeGreaterThan(0);
  });
});
