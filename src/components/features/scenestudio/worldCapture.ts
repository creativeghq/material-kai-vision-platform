import {
  BackSide, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, FloatType, type Material, Mesh, NearestFilter, PerspectiveCamera,
  Points, RGBAFormat, type Scene, ShaderMaterial, type Object3D, Vector3, type WebGLRenderer, WebGLRenderTarget,
} from 'three';

import { WORLD_VIEW_H, WORLD_VIEW_W, type WorldPose } from '@/lib/scene/worldViews';

const OUTSIDE_M = 8;

const VERT = 'varying float z; void main(){ vec4 m = modelViewMatrix * vec4(position,1.0); z = -m.z; gl_Position = projectionMatrix * m; }';
const FRAG = 'varying float z; void main(){ gl_FragColor = vec4(z,0.0,0.0,1.0); }';
const DOT_VERT = 'varying float z; void main(){ vec4 m = modelViewMatrix * vec4(position,1.0); z = -m.z; gl_Position = projectionMatrix * m; gl_PointSize = clamp(0.028 * 600.0 / max(z,0.05), 1.0, 60.0); }';
const DOT_FRAG = 'varying float z; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(z,0.0,0.0,1.0); }';

interface Splats { numSplats: number; forEachSplat(cb: (i: number, centre: Vector3, scales: Vector3, q: unknown, opacity: number) => void): void }

export interface DepthView { depth: Float32Array; quaternion: [number, number, number, number] }

/** Planar depth in metres of the room as it stands, from each pose. Furniture models are drawn as dots so their true shape counts, and a far box behind the windows gives the outside one distance. */
export function renderDepthViews(gl: WebGLRenderer, scene: Scene, poses: WorldPose[], halfSpan: number): DepthView[] {
  const solid = new ShaderMaterial({ side: DoubleSide, vertexShader: VERT, fragmentShader: FRAG });
  const far = new ShaderMaterial({ side: BackSide, vertexShader: VERT, fragmentShader: FRAG });
  const dots = new ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG });
  const rt = new WebGLRenderTarget(WORLD_VIEW_W, WORLD_VIEW_H, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter });
  const extra: Object3D[] = [];
  const hidden: Object3D[] = [];
  const swapped: Array<[Mesh, Material | Material[]]> = [];
  const before = { target: gl.getRenderTarget(), colour: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), background: scene.background, fog: scene.fog, shadows: gl.shadowMap.autoUpdate };

  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const splats = (o as unknown as { packedSplats?: Splats }).packedSplats;
    if (splats) {
      let shown: Object3D | null = o;
      while (shown && shown.visible) shown = shown.parent;
      if (!shown && splats.numSplats) {
        const at: number[] = [];
        splats.forEachSplat((_i, c, _s, _q, opacity) => { if (opacity > 0.35) at.push(c.x, c.y, c.z); });
        const cloud = new Points(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(at, 3)), dots);
        cloud.matrixAutoUpdate = false;
        cloud.matrix.copy(o.matrixWorld);
        cloud.frustumCulled = false;
        extra.push(cloud);
      }
    }
  });
  scene.traverse((o) => {
    if (!o.visible) return;
    const mesh = o as Mesh;
    const m = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) : null;
    const splat = (o as unknown as { packedSplats?: unknown }).packedSplats || o.constructor.name.includes('Spark');
    if (splat || o.userData?.helper || o.userData?.splat || (o as Points).isPoints || (o as { isLine?: boolean }).isLine || (o as { isSprite?: boolean }).isSprite
      || (m && (m.visible === false || m.colorWrite === false || m.opacity < 0.7))) {
      hidden.push(o);
      o.visible = false;
      return;
    }
    if (mesh.isMesh) { swapped.push([mesh, mesh.material]); mesh.material = solid; }
  });
  const outside = new Mesh(new BoxGeometry(2 * (halfSpan + OUTSIDE_M), 60, 2 * (halfSpan + OUTSIDE_M)), far);
  extra.push(outside);
  extra.forEach((o) => scene.add(o));
  scene.background = null;
  scene.fog = null;
  gl.shadowMap.autoUpdate = false;

  try {
    return poses.map((pose) => {
      const cam = new PerspectiveCamera(pose.fov, WORLD_VIEW_W / WORLD_VIEW_H, 0.05, 200);
      cam.position.set(...pose.position);
      cam.lookAt(...pose.target);
      cam.updateMatrixWorld();
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(scene, cam);
      const buf = new Float32Array(WORLD_VIEW_W * WORLD_VIEW_H * 4);
      gl.readRenderTargetPixels(rt, 0, 0, WORLD_VIEW_W, WORLD_VIEW_H, buf);
      const depth = new Float32Array(WORLD_VIEW_W * WORLD_VIEW_H);
      for (let y = 0; y < WORLD_VIEW_H; y++) {
        for (let x = 0; x < WORLD_VIEW_W; x++) depth[(WORLD_VIEW_H - 1 - y) * WORLD_VIEW_W + x] = buf[(y * WORLD_VIEW_W + x) * 4];
      }
      return { depth, quaternion: cam.quaternion.toArray() as [number, number, number, number] };
    });
  } finally {
    gl.setRenderTarget(before.target);
    gl.setClearColor(before.colour, before.alpha);
    gl.shadowMap.autoUpdate = before.shadows;
    extra.forEach((o) => { scene.remove(o); (o as Mesh).geometry?.dispose(); });
    swapped.forEach(([mesh, mat]) => { mesh.material = mat; });
    hidden.forEach((o) => { o.visible = true; });
    scene.background = before.background;
    scene.fog = before.fog;
    rt.dispose();
    solid.dispose();
    far.dispose();
    dots.dispose();
  }
}
