import { Mesh, type Camera, type Material, type MeshBasicMaterial, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

export const isSplat = (o: Object3D) => o instanceof SplatMesh || o instanceof SparkRenderer;

export const invisibleMaterial = (m: Material | Material[]) => (Array.isArray(m) ? m.every((x) => !x.visible) : !m.visible);

/** True when what Spark shows is the scene as it stands; after a splat appears or moves it lags by up to seconds on a slow GPU. */
export function splatsSettled(scene: Scene): boolean {
  const spark = scene.children.find((o): o is SparkRenderer => o instanceof SparkRenderer);
  if (!spark) return true;
  let visible = 0;
  scene.traverseVisible((o) => { if (o instanceof SplatMesh && o.packedSplats) visible += o.packedSplats.numSplats; });
  if (!visible) return true;
  const view = spark.defaultView as unknown as { display: { accumulator: { mapping: Array<{ count: number }> } } | null; sorting: unknown };
  if (!view.display || view.sorting || (view.display.accumulator as unknown) !== spark.active) return false;
  return view.display.accumulator.mapping.reduce((n, m) => n + m.count, 0) === visible;
}

/** Draws the splats over the picture already on screen, hidden where the solid room stands in front of them. */
export function drawSplatsOver(renderer: WebGLRenderer, scene: Scene, camera: Camera, depthOnly: MeshBasicMaterial, veiled = false) {
  let any = false;
  scene.traverseVisible((o) => { if (o instanceof SplatMesh) any = true; });
  if (!any) return;
  const swapped: Array<[Mesh, Material | Material[]]> = [];
  const hidden: Object3D[] = [];
  scene.traverse((o) => {
    if (isSplat(o)) return;
    if (o.userData?.splat || o.userData?.helper) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
    const mesh = o as Mesh;
    if (mesh.isMesh && !invisibleMaterial(mesh.material)) { swapped.push([mesh, mesh.material]); mesh.material = depthOnly; }
  });
  const before = { auto: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate, background: scene.background };
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  scene.background = null;
  renderer.clearDepth();
  // Spark only prepares splats it is asked to draw, so a veiled frame still draws them, into one pixel.
  if (veiled) { renderer.setScissor(0, 0, 1, 1); renderer.setScissorTest(true); }
  renderer.render(scene, camera);
  if (veiled) renderer.setScissorTest(false);
  scene.background = before.background;
  renderer.shadowMap.autoUpdate = before.shadows;
  renderer.autoClear = before.auto;
  for (const [mesh, m] of swapped) mesh.material = m;
  for (const o of hidden) o.visible = true;
}
