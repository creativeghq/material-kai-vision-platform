/** Baked light (#604 phase 6): the path tracer lights every wall, floor and ceiling once; walking reads it back. */
import {
  BufferAttribute, Color, DataTexture, FloatType, Matrix3, MeshBasicMaterial, NearestFilter, PerspectiveCamera, RGBAFormat, SRGBColorSpace, ShaderMaterial,
  Texture, Vector3, WebGLRenderTarget, type Material, type Mesh, type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';

import { denoise, denoiserNet, readFloatPixels } from '@/components/features/scenestudio/photoDenoiser';
import { withTraceView } from '@/components/features/scenestudio/traceView';
import { disposeTracer } from '@/components/features/scenestudio/PhotoMode';
import { packCharts, type Atlas } from '@/lib/scene/lightmapAtlas';
import { pointInPolygon } from '@/lib/scene/sceneGeometry';

export const BAKED_SURFACES = new Set(['floor', 'ceiling', 'walls', 'zone']);
const BAKE_SAMPLES = 256;
/** Walking into a darker room, the eye adapts: each room is brightened toward the home's middle, within limits. */
const ROOM_GAIN_MIN = 0.75;
const ROOM_GAIN_MAX = 1.8;
/** The average wall reads like the live room did; brighter and darker parts keep their difference. */
const TARGET_IRRADIANCE = 0.9;

interface Chart { key: string; mesh: Mesh; verts: number[]; u: number[]; v: number[]; w: number; h: number }

const q = (n: number, k = 100) => Math.round(n * k) / k;

/** Every flat face of every baked surface, measured in metres in the world. */
export function surfaceCharts(scene: Object3D): Chart[] {
  scene.updateMatrixWorld(true);
  const out: Chart[] = [];
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3(); const n = new Vector3();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !BAKED_SURFACES.has(mesh.userData?.surface)) return;
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const index = g.index;
    const count = index ? index.count : pos.count;
    const at = (i: number) => (index ? index.getX(i) : i);
    const owner = new Map<number, string>();
    const charts = new Map<string, { verts: Set<number>; n: Vector3 }>();
    let broken = false;
    for (let t = 0; t < count; t += 3) {
      const ids = [at(t), at(t + 1), at(t + 2)];
      a.fromBufferAttribute(pos, ids[0]).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, ids[1]).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, ids[2]).applyMatrix4(mesh.matrixWorld);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      const id = `${q(n.x)},${q(n.y)},${q(n.z)}|${q(a.dot(n))}`;
      let chart = charts.get(id);
      if (!chart) { chart = { verts: new Set(), n: n.clone() }; charts.set(id, chart); }
      for (const v of ids) {
        const was = owner.get(v);
        if (was && was !== id) broken = true;
        owner.set(v, id);
        chart.verts.add(v);
      }
    }
    if (broken) return;
    const box = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
    const centre = box.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld);
    const whose = mesh.userData.roomId ?? mesh.userData.wallId ?? '';
    for (const [id, chart] of charts) {
      const t = Math.abs(chart.n.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0).cross(chart.n).normalize();
      const s = chart.n.clone().cross(t).normalize();
      const verts = [...chart.verts].sort((x, y) => x - y);
      const u: number[] = []; const v: number[] = [];
      for (const i of verts) {
        a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        u.push(a.dot(t)); v.push(a.dot(s));
      }
      const u0 = Math.min(...u); const v0 = Math.min(...v);
      out.push({
        key: `${mesh.userData.surface}|${whose}|${q(centre.x)},${q(centre.y)},${q(centre.z)}|${id}`,
        mesh, verts, u: u.map((x) => x - u0), v: v.map((x) => x - v0), w: Math.max(...u) - u0, h: Math.max(...v) - v0,
      });
    }
  });
  return out;
}

export function atlasOf(charts: Chart[]): Atlas | null {
  return packCharts(charts.map((c) => ({ key: c.key, w: c.w, h: c.h })));
}

/** Writes each surface's place in the atlas as its second UV set (three's `uv1`, read by a light map). */
export function applyAtlasUvs(charts: Chart[], atlas: Atlas): void {
  const byMesh = new Map<Mesh, Chart[]>();
  for (const c of charts) byMesh.set(c.mesh, [...(byMesh.get(c.mesh) ?? []), c]);
  for (const [mesh, list] of byMesh) {
    const pos = mesh.geometry.getAttribute('position');
    const uv1 = new Float32Array(pos.count * 2);
    for (const c of list) {
      const r = atlas.rects.get(c.key);
      if (!r) continue;
      c.verts.forEach((vi, k) => {
        uv1[vi * 2] = (r.x + atlas.pad + c.u[k] * atlas.density) / atlas.side;
        uv1[vi * 2 + 1] = (r.y + atlas.pad + c.v[k] * atlas.density) / atlas.side;
      });
    }
    mesh.geometry.setAttribute('uv1', new BufferAttribute(uv1, 2));
  }
}

const atlasVertex = /* glsl */`
  attribute vec2 uv1;
  varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;
  uniform mat3 uvTransform;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNor = normalize(mat3(modelMatrix) * normal);
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = vec4(uv1 * 2.0 - 1.0, 0.0, 1.0);
  }`;

function atlasMaterial(kind: 'position' | 'normal' | 'albedo', from?: Material): ShaderMaterial {
  const m = from as (Material & { map?: Texture | null; color?: Color }) | undefined;
  const map = kind === 'albedo' ? m?.map ?? null : null;
  map?.updateMatrix();
  return new ShaderMaterial({
    vertexShader: atlasVertex,
    fragmentShader: /* glsl */`
      varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;
      uniform sampler2D map; uniform vec3 color; uniform bool hasMap;
      void main() {
        ${kind === 'position' ? 'gl_FragColor = vec4(vPos, 1.0);'
    : kind === 'normal' ? 'gl_FragColor = vec4(normalize(vNor), 1.0);'
      : 'vec3 c = color; if (hasMap) c *= texture2D(map, vUv).rgb; gl_FragColor = vec4(c, 1.0);'}
      }`,
    uniforms: {
      map: { value: map }, hasMap: { value: !!map }, color: { value: (m?.color ?? new Color(1, 1, 1)).clone() },
      uvTransform: { value: map ? map.matrix.clone() : new Matrix3() },
    },
    side: 2,
  });
}

/** Renders the surfaces flat into the atlas: where each texel is, which way it faces, what colour it is. */
function renderAtlas(gl: WebGLRenderer, scene: Scene, charts: Chart[], atlas: Atlas, kind: 'position' | 'normal' | 'albedo'): Float32Array {
  const meshes = [...new Set(charts.map((c) => c.mesh))];
  const target = new WebGLRenderTarget(atlas.side, atlas.side, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter });
  const hidden: Object3D[] = [];
  const swapped: Array<[Mesh, Material | Material[], boolean]> = [];
  const made: Material[] = [];
  const before = { target: gl.getRenderTarget(), colour: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), background: scene.background };
  try {
    scene.traverse((o) => { if (o.visible && (o as Mesh).isMesh && !meshes.includes(o as Mesh)) { o.visible = false; hidden.push(o); } });
    for (const mesh of meshes) {
      const one = (m: Material) => { const x = atlasMaterial(kind, m); made.push(x); return x; };
      swapped.push([mesh, mesh.material, mesh.frustumCulled]);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(one) : one(mesh.material);
      mesh.frustumCulled = false;
    }
    const lifted: Object3D[] = [];
    for (const mesh of meshes) for (let p: Object3D | null = mesh; p; p = p.parent) if (!p.visible) { p.visible = true; lifted.push(p); }
    scene.background = null;
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, new PerspectiveCamera());
    lifted.forEach((p) => { p.visible = false; });
    const out = new Float32Array(atlas.side * atlas.side * 4);
    gl.readRenderTargetPixels(target, 0, 0, atlas.side, atlas.side, out);
    return out;
  } finally {
    for (const [mesh, m, culled] of swapped) { mesh.material = m; mesh.frustumCulled = culled; }
    hidden.forEach((o) => { o.visible = true; });
    made.forEach((m) => m.dispose());
    scene.background = before.background;
    gl.setRenderTarget(before.target);
    gl.setClearColor(before.colour, before.alpha);
    target.dispose();
  }
}

/** Spreads each chart's edge texels into its padding, so filtering at a seam never reads black. */
function dilate(rgb: Float32Array, mask: Float32Array, side: number, rounds: number) {
  const filled = new Uint8Array(side * side);
  for (let i = 0; i < side * side; i++) filled[i] = mask[i * 4 + 3] > 0.5 ? 1 : 0;
  for (let r = 0; r < rounds; r++) {
    const next = filled.slice();
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (filled[i]) continue;
      let n = 0; let s0 = 0; let s1 = 0; let s2 = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx; const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= side || yy >= side) continue;
        const j = yy * side + xx;
        if (!filled[j]) continue;
        n++; s0 += rgb[j * 4]; s1 += rgb[j * 4 + 1]; s2 += rgb[j * 4 + 2];
      }
      if (!n) continue;
      rgb[i * 4] = s0 / n; rgb[i * 4 + 1] = s1 / n; rgb[i * 4 + 2] = s2 / n; rgb[i * 4 + 3] = 1;
      next[i] = 1;
    }
    filled.set(next);
  }
}

export interface Bake { blob: Blob; intensity: number; atlasSig: string; side: number; samples: number; roomGain: Record<string, number> }

export interface BakeRoom { id: string; outline: Array<[number, number]> }

/** Lights the whole home with the path tracer and keeps what each surface receives, divided by its colour. */
export async function bakeLight(gl: WebGLRenderer, scene: Scene, rooms: BakeRoom[], onProgress: (done: number) => void, stop: () => boolean): Promise<Bake> {
  const charts = surfaceCharts(scene);
  const atlas = atlasOf(charts);
  if (!atlas) throw new Error('This home is too large to bake in one go.');
  applyAtlasUvs(charts, atlas);
  const side = atlas.side;
  const position = renderAtlas(gl, scene, charts, atlas, 'position');
  const normal = renderAtlas(gl, scene, charts, atlas, 'normal');
  const albedo = renderAtlas(gl, scene, charts, atlas, 'albedo');

  const sky = new GradientEquirectTexture(256);
  sky.topColor.set('#cfe3ff'); sky.bottomColor.set('#b9ab98'); sky.exponent = 1.6; sky.update();
  const prev = { env: scene.environment, k: scene.environmentIntensity };
  const ceilings: Object3D[] = [];
  scene.traverse((o) => { if (o.userData?.surface === 'ceiling' && !o.visible) { o.visible = true; ceilings.push(o); } });
  scene.environment = sky;
  scene.environmentIntensity = 1.3;
  const tracer = new WebGLPathTracer(gl);
  const inner = (tracer as unknown as { _pathTracer: { material: ShaderMaterial & { setDefine(k: string, v: number): void }; setSize(w: number, h: number): void; update(): void; samples: number; target: WebGLRenderTarget; tiles: { set(x: number, y: number): void }; isCompiling: boolean } })._pathTracer;
  try {
    tracer.bounces = 5;
    tracer.filterGlossyFactor = 0.5;
    withTraceView(scene, () => tracer.setScene(scene, new PerspectiveCamera()));
    const m = inner.material;
    m.setDefine('RANDOM_TYPE', 0);
    m.fragmentShader = m.fragmentShader
      .replace('void main() {\n\n\t\t\t\t\t// init', 'uniform sampler2D bakeSurface;\n\t\t\t\tvoid main() {\n\n\t\t\t\t\t// init')
      .replace('Ray ray = getCameraRay();', 'vec4 bakeP = texture2D( bakeSurface, vec2( vUv.x * 0.5, vUv.y ) ); vec3 bakeN = texture2D( bakeSurface, vec2( 0.5 + vUv.x * 0.5, vUv.y ) ).xyz; if ( bakeP.w < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; } Ray ray; ray.origin = bakeP.xyz + bakeN * 0.004; ray.direction = - bakeN;');
    if (!m.fragmentShader.includes('bakeSurface, vec2')) throw new Error('The path tracer changed; baking needs updating.');
    const both = new Float32Array(side * 2 * side * 4);
    for (let y = 0; y < side; y++) {
      both.set(position.subarray(y * side * 4, (y + 1) * side * 4), y * side * 8);
      both.set(normal.subarray(y * side * 4, (y + 1) * side * 4), y * side * 8 + side * 4);
    }
    const surfaceTex = new DataTexture(both, side * 2, side, RGBAFormat, FloatType);
    surfaceTex.minFilter = NearestFilter; surfaceTex.magFilter = NearestFilter; surfaceTex.needsUpdate = true;
    m.uniforms.bakeSurface = { value: surfaceTex };
    m.needsUpdate = true;
    inner.tiles.set(1, 1);
    inner.setSize(side, side);
    for (let guard = 0; inner.samples < BAKE_SAMPLES; guard++) {
      if (stop()) throw new Error('Stopped.');
      inner.update();
      if (inner.isCompiling || guard % 2 === 0) await new Promise((r) => requestAnimationFrame(r));
      onProgress(Math.min(0.95, inner.samples / BAKE_SAMPLES * 0.95));
    }
    let radiance = await readFloatPixels(gl, inner.target);
    const unet = await denoiserNet();
    if (unet) {
      const guide = { albedo: new Float32Array(albedo), normal: Float32Array.from(normal, (v, i) => (i % 4 === 3 ? 1 : v * 0.5 + 0.5)), width: side, height: side };
      const job = denoise(unet, radiance, guide);
      radiance = await Promise.race([job.result, new Promise<Float32Array>((r) => setTimeout(() => { job.abort(); r(radiance); }, 90_000))]);
    }
    surfaceTex.dispose();
    const irr = new Float32Array(side * side * 4);
    const walls: number[] = [];
    const perRoom = new Map<string, number[]>();
    for (let i = 0; i < side * side; i++) {
      if (position[i * 4 + 3] < 0.5) continue;
      for (let k = 0; k < 3; k++) irr[i * 4 + k] = radiance[i * 4 + k] / Math.max(0.04, albedo[i * 4 + k]);
      irr[i * 4 + 3] = 1;
      if (Math.abs(normal[i * 4 + 1]) >= 0.5) continue;
      const lum = 0.2126 * irr[i * 4] + 0.7152 * irr[i * 4 + 1] + 0.0722 * irr[i * 4 + 2];
      walls.push(lum);
      const x = position[i * 4] + normal[i * 4] * 0.15; const z = position[i * 4 + 2] + normal[i * 4 + 2] * 0.15;
      const room = rooms.find((r) => pointInPolygon(x, z, r.outline));
      if (room) perRoom.set(room.id, [...(perRoom.get(room.id) ?? []), lum]);
    }
    dilate(irr, position, side, atlas.pad * 2 + 2);
    walls.sort((x, y) => x - y);
    const mid = walls.length ? walls[Math.floor(walls.length / 2)] : 1;
    const roomGain = Object.fromEntries([...perRoom].map(([id, list]) => {
      list.sort((x, y) => x - y);
      return [id, Math.round(Math.min(ROOM_GAIN_MAX, Math.max(ROOM_GAIN_MIN, mid / Math.max(1e-4, list[Math.floor(list.length / 2)]))) * 100) / 100];
    }));
    const peak = (() => { const all: number[] = []; for (let i = 0; i < side * side; i += 7) if (irr[i * 4 + 3] > 0) all.push(Math.max(irr[i * 4], irr[i * 4 + 1], irr[i * 4 + 2])); all.sort((x, y) => x - y); return all[Math.floor(all.length * 0.995)] || 1; })();
    const canvas = document.createElement('canvas');
    canvas.width = side; canvas.height = side;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(side, side);
    const enc = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)));
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const i = y * side + x; const o = ((side - 1 - y) * side + x) * 4;
      img.data[o] = enc(irr[i * 4] / peak); img.data[o + 1] = enc(irr[i * 4 + 1] / peak); img.data[o + 2] = enc(irr[i * 4 + 2] / peak); img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    onProgress(1);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The light map could not be encoded.'))), 'image/png'));
    return { blob, intensity: Math.PI * peak * (TARGET_IRRADIANCE / Math.max(1e-4, mid)), atlasSig: atlas.sig, side, samples: BAKE_SAMPLES, roomGain };
  } finally {
    scene.environment = prev.env;
    scene.environmentIntensity = prev.k;
    ceilings.forEach((o) => { o.visible = false; });
    disposeTracer(tracer);
    sky.dispose();
  }
}

const baked = new WeakMap<Material, MeshBasicMaterial>();

/** Swaps every baked surface to a material that reads the light map; anything that no longer matches the bake is left alone. */
export function showBakedLight(scene: Object3D, map: Texture, intensity: number, atlasSig: string): Map<Mesh, Material | Material[]> | null {
  const charts = surfaceCharts(scene);
  const atlas = atlasOf(charts);
  if (!atlas || atlas.sig !== atlasSig) return null;
  applyAtlasUvs(charts, atlas);
  const originals = new Map<Mesh, Material | Material[]>();
  const swap = (m: Material): Material => {
    const src = m as Material & { map?: Texture | null; color?: Color; side?: number };
    let out = baked.get(m);
    if (!out) {
      out = new MeshBasicMaterial({ map: src.map ?? null, color: src.color?.clone() ?? new Color(1, 1, 1), side: src.side, lightMap: map, lightMapIntensity: intensity });
      out.userData.bakedFrom = m;
      baked.set(m, out);
    }
    return out;
  };
  for (const mesh of new Set(charts.map((c) => c.mesh))) {
    originals.set(mesh, mesh.material);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  }
  return originals;
}

export const isBaked = (m: Material | Material[]) => (Array.isArray(m) ? m.some((x) => x.userData?.bakedFrom) : !!m.userData?.bakedFrom);

export function loadLightMap(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const t = new Texture(img);
      t.colorSpace = SRGBColorSpace;
      t.channel = 1;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error('The light map could not be loaded.'));
    img.src = url;
  });
}
