import { BufferAttribute, BufferGeometry, Mesh as ThreeMesh, type Material, type Mesh, type Object3D } from 'three';

const invisibleMaterial = (m: Material | Material[]) => (Array.isArray(m) ? m.every((x) => !x.visible) : !m.visible);

export function excludedFromTrace(o: Object3D): boolean {
  if (o.userData?.ground) return false;
  if (o.userData?.helper || o.userData?.contactShadow) return true;
  const mesh = o as Mesh;
  return !!mesh.isMesh && invisibleMaterial(mesh.material);
}

const floats = new WeakMap<BufferGeometry, BufferGeometry>();

/** The tracer reads raw numbers, so a compressed model's packed ones are unpacked for it. */
function asFloat(g: BufferGeometry): BufferGeometry {
  const packed = Object.values(g.attributes).some((a) => a.normalized || !(a.array instanceof Float32Array));
  if (!packed) return g;
  const hit = floats.get(g);
  if (hit) return hit;
  const out = new BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') continue;
    const data = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) data[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new BufferAttribute(data, a.itemSize));
  }
  out.setIndex(g.index);
  floats.set(g, out);
  return out;
}

/** The tracer gives each mesh ONE material slot, so a multi-material wall shifts every later mesh's material; trace it as one mesh per face. */
export function withTraceView<T>(scene: Object3D, fn: () => T): T {
  const hidden: Object3D[] = [];
  const shown: Object3D[] = [];
  scene.traverse((o) => {
    if (o.visible && excludedFromTrace(o)) { o.visible = false; hidden.push(o); }
    if (!o.visible && 'windowRoom' in o.userData) { o.visible = true; shown.push(o); }
  });
  const split: Mesh[] = [];
  scene.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && Array.isArray(mesh.material) && mesh.geometry.index && mesh.parent) split.push(mesh);
  });
  const parts: Array<[ThreeMesh, Object3D]> = [];
  for (const mesh of split) {
    const index = mesh.geometry.index!;
    for (const g of mesh.geometry.groups) {
      const material = (mesh.material as Material[])[g.materialIndex ?? 0];
      if (!material) continue;
      const sub = new BufferGeometry();
      for (const [name, attr] of Object.entries(mesh.geometry.attributes)) sub.setAttribute(name, attr);
      sub.setIndex(new BufferAttribute(index.array.slice(g.start, g.start + g.count), 1));
      const part = new ThreeMesh(sub, material);
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      parts.push([part, mesh.parent!]);
    }
    mesh.visible = false;
    hidden.push(mesh);
  }
  const packed: Array<[Mesh, BufferGeometry]> = [];
  scene.traverseVisible((o) => {
    const mesh = o as Mesh;
    const own = mesh.isMesh ? asFloat(mesh.geometry) : null;
    if (own && own !== mesh.geometry) { packed.push([mesh, mesh.geometry]); mesh.geometry = own; }
  });
  for (const [part, parent] of parts) parent.add(part);
  try { return fn(); } finally {
    for (const [part, parent] of parts) parent.remove(part);
    for (const [mesh, g] of packed) mesh.geometry = g;
    for (const o of hidden) o.visible = true;
    for (const o of shown) o.visible = false;
  }
}
