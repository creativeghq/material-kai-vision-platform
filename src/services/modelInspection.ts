/**
 * Reading a glTF/GLB's own facts out of the file (#321 M0, deferred item).
 *
 * React-free and renderer-free: it parses, measures and reports. Used at upload so the platform
 * stops asking a human for numbers the file already contains.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. `width_m` / `depth_m` are what the room planner draws
 * footprints from and what AR uses for true-to-scale placement. Typed by hand they are a guess with
 * a decimal point in it, and a wrong one produces a plan that looks right and a delivery that does
 * not fit. The glTF has known its own bounding box the whole time.
 */
import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelInspection {
  /** Real-world size in metres, from the model's bounding box. glTF's unit is the metre. */
  widthM: number;
  heightM: number;
  depthM: number;
  /** Distinct glTF material names, sorted. */
  materialNames: string[];
  /** Renderable meshes. Zero is the failure case — see `isRenderable`. */
  meshCount: number;
  /**
   * False when the file parses but has nothing to draw (lights and empty nodes only — a real
   * exporter artifact). Its bounding box is empty, `min.y` is +Infinity, and placing it poisons
   * every matrix downstream. Caught here so the upload is refused rather than the viewer breaking
   * on somebody's product page later.
   */
  isRenderable: boolean;
}

/** Round to millimetres. A model measured to 14 decimal places is not more accurate, just noisier. */
function toMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Parse a glTF/GLB and report what is in it. Rejects only on a genuinely unparseable file. */
export async function inspectModelFile(file: File | ArrayBuffer): Promise<ModelInspection> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve as never, reject);
  });
  return inspectScene(gltf.scene);
}

/** The measuring half, separated so it can be tested against a parsed fixture directly. */
export function inspectScene(scene: Object3D): ModelInspection {
  const materialNames = new Set<string>();
  let meshCount = 0;

  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) if (m?.name) materialNames.add(m.name);
  });

  const box = new Box3().setFromObject(scene);
  // Same trap as the placement transform: an empty box reports min = +Infinity, and reading it
  // directly yields Infinity dimensions that are valid `number`s all the way into the database.
  const size = box.isEmpty() ? new Vector3(0, 0, 0) : box.getSize(new Vector3());

  return {
    widthM: toMm(size.x),
    heightM: toMm(size.y),
    depthM: toMm(size.z),
    materialNames: [...materialNames].sort(),
    meshCount,
    isRenderable: meshCount > 0 && !box.isEmpty(),
  };
}

/**
 * Is a measurement plausible as a physical product?
 *
 * A model authored in centimetres or millimetres arrives 100× or 1000× too large, and one authored
 * in a modelling package's arbitrary units can be anything. Neither is detectable from the file —
 * glTF simply declares metres — so the honest move is to flag the implausible ones for a human
 * rather than silently writing a 180-metre sofa into a room plan.
 */
export function isPlausibleProductSize(inspection: ModelInspection): boolean {
  const largest = Math.max(inspection.widthM, inspection.heightM, inspection.depthM);
  return largest > 0.01 && largest < 20;
}
