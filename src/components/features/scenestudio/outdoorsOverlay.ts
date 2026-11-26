import type { Camera, Material, Mesh, MeshBasicMaterial, Object3D, Scene, WebGLRenderer } from 'three';


/** Puts the sharp view outside where a photo's window is; the traced picture only holds its light. */
export function drawOutdoorsOver(renderer: WebGLRenderer, scene: Scene, camera: Camera, depthOnly: MeshBasicMaterial) {
  const outdoors: Object3D[] = [];
  scene.traverse((o) => { if (o.userData?.outdoors && o.userData.helper && o.parent?.visible) outdoors.push(o); });
  if (!outdoors.length) return;
  const swapped: Array<[Mesh, Material | Material[]]> = [];
  const hidden: Object3D[] = [];
  const glass = (m: Material | Material[]) => (Array.isArray(m) ? m : [m]).every((x) => !x.visible || x.opacity < 0.7);
  scene.traverse((o) => {
    if (!o.visible || outdoors.includes(o)) return;
    const mesh = o as Mesh;
    if (o.userData?.contactShadow || (o.userData?.helper && !o.userData.ground) || (mesh.isMesh && glass(mesh.material))) { o.visible = false; hidden.push(o); return; }
    if (mesh.isMesh) { swapped.push([mesh, mesh.material]); mesh.material = depthOnly; }
  });
  const before = { auto: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate, background: scene.background, exposure: renderer.toneMappingExposure };
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMappingExposure = 1.6;
  scene.background = null;
  renderer.clearDepth();
  renderer.render(scene, camera);
  scene.background = before.background;
  renderer.toneMappingExposure = before.exposure;
  renderer.shadowMap.autoUpdate = before.shadows;
  renderer.autoClear = before.auto;
  for (const [mesh, m] of swapped) mesh.material = m;
  for (const o of hidden) o.visible = true;
}
