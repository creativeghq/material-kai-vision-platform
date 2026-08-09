/**
 * Guard for reading a model's own facts at upload (#321 M0, deferred item).
 *
 * These numbers are load-bearing in a way that is easy to miss: `width_m` / `depth_m` are what the
 * room planner draws footprints from and what AR uses for true-to-scale placement. Typed by hand
 * they are a guess with a decimal point; measured wrong they produce a plan that looks correct and
 * a delivery that does not fit. Nothing downstream can tell a wrong measurement from a right one.
 *
 * The empty-scene case is the M0 bug moved earlier: a GLB that parses but has nothing to draw has
 * an empty bounding box, `min.y` is +Infinity, and the placement it produces poisons every matrix
 * in the scene. Catching it at upload means the file is refused instead of a product page breaking.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Group, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inspectScene, isPlausibleProductSize } from '@/services/modelInspection';

const FIXTURE = path.resolve(__dirname, '../fixtures/armchair.glb');

let scene: Group;

beforeAll(async () => {
  const buf = readFileSync(FIXTURE);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<any>((resolve, reject) =>
    new GLTFLoader().parse(ab, '', resolve, reject),
  );
  scene = gltf.scene;
});

describe('inspectScene', () => {
  it('measures the armchair at real-world scale, in metres', () => {
    const i = inspectScene(scene);
    // The fixture is authored as a real armchair, roughly 0.7–0.9 m in each direction.
    expect(i.widthM).toBeGreaterThan(0.5);
    expect(i.widthM).toBeLessThan(1.5);
    expect(i.heightM).toBeGreaterThan(0.5);
    expect(i.depthM).toBeGreaterThan(0.5);
  });

  it('rounds to millimetres — extra decimals are noise, not accuracy', () => {
    const i = inspectScene(scene);
    for (const v of [i.widthM, i.heightM, i.depthM]) {
      expect(Math.round(v * 1000)).toBe(v * 1000);
    }
  });

  it('lists the material names the configurator targets, deduped and sorted', () => {
    expect(inspectScene(scene).materialNames).toEqual(['Fabric_Navy', 'Oak_Frame', 'Walnut']);
  });

  it('counts the renderable meshes', () => {
    // 11 parts (4 legs, frame, seat base + cushion, back panel + cushion, 2 armrests) over 3
    // materials. That ratio is the reason a configurator group targets a MATERIAL and not a mesh:
    // one "fabric" choice has to repaint six of these parts.
    expect(inspectScene(scene).meshCount).toBe(11);
  });

  it('marks a real model as renderable', () => {
    expect(inspectScene(scene).isRenderable).toBe(true);
  });

  // The M0 bug, caught at upload instead of at render.
  it('marks an empty scene as NOT renderable, with finite dimensions', () => {
    const empty = inspectScene(new Object3D());
    expect(empty.isRenderable).toBe(false);
    expect(empty.meshCount).toBe(0);
    // The whole point: no Infinity reaches the database as a "valid" number.
    expect(Number.isFinite(empty.widthM)).toBe(true);
    expect(Number.isFinite(empty.heightM)).toBe(true);
    expect(empty.widthM).toBe(0);
  });
});

describe('isPlausibleProductSize', () => {
  it('accepts the armchair', () => {
    expect(isPlausibleProductSize(inspectScene(scene))).toBe(true);
  });

  // glTF declares metres, so a file authored in centimetres is silently 100× too big. Nothing in
  // the format reveals it — the only signal is that the result is absurd.
  it('rejects a model authored in the wrong units', () => {
    const base = inspectScene(scene);
    // Wrong units scale EVERY axis — an export in centimetres is uniformly 100× too big. Scaling
    // one axis is a differently-shaped product, not a unit error, and must not be flagged.
    const scaled = (f: number) => ({
      ...base, widthM: base.widthM * f, heightM: base.heightM * f, depthM: base.depthM * f,
    });
    expect(isPlausibleProductSize(scaled(100)), 'centimetre export').toBe(false);
    expect(isPlausibleProductSize(scaled(1000)), 'millimetre export').toBe(false);
    expect(isPlausibleProductSize(scaled(1 / 1000)), 'kilometre-ish export').toBe(false);
    expect(isPlausibleProductSize(scaled(1)), 'the model as authored').toBe(true);
  });

  it('accepts a genuinely large product — a wardrobe is not a unit error', () => {
    const base = inspectScene(scene);
    expect(isPlausibleProductSize({ ...base, heightM: 2.4, widthM: 3.0 })).toBe(true);
  });

  it('rejects a zero-size measurement', () => {
    expect(isPlausibleProductSize({
      widthM: 0, heightM: 0, depthM: 0, materialNames: [], meshCount: 0, isRenderable: false,
    })).toBe(false);
  });
});
