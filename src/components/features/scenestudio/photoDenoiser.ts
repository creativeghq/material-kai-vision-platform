/** Intel Open Image Denoise in the browser: a few dozen noisy samples plus what each pixel IS (its colour and its direction) make a clean photo. */
import { Color, DataTexture, DoubleSide, FloatType, LinearFilter, MeshBasicMaterial, MeshNormalMaterial, RGBAFormat, UnsignedByteType, Vector2, WebGLRenderTarget, type Camera, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { UNet } from 'oidn-webgpu';

const WEIGHTS = '/oidn/rt_hdr_alb_nrm.tza';

let net: Promise<UNet | null> | null = null;

/** Null where the browser has no WebGPU; the photo then keeps its simpler smoothing. */
export function denoiserNet(): Promise<UNet | null> {
  net ??= (async () => {
    if (!('gpu' in navigator)) return null;
    const { initUNetFromURL } = await import('oidn-webgpu');
    return initUNetFromURL(WEIGHTS, undefined, { aux: true, hdr: true });
  })().catch(() => null);
  return net;
}

/** A denoiser that hung is made again for the next picture. */
export function forgetDenoiser(): void { net = null; }

export interface PhotoGuides { albedo: Float32Array; normal: Float32Array; width: number; height: number }

const black = new Color('#000000');

/** What the camera sees first, as flat colour and as direction; `skip` leaves out what the photo does not contain. */
export function renderGuides(gl: WebGLRenderer, scene: Scene, camera: Camera, width: number, height: number, skip: (o: Object3D) => boolean): PhotoGuides {
  const rt = new WebGLRenderTarget(width, height, { type: UnsignedByteType, format: RGBAFormat });
  const before = { target: gl.getRenderTarget(), clear: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), tone: gl.toneMapping, background: scene.background, shadows: gl.shadowMap.autoUpdate };
  const swapped: Array<[Mesh, Material | Material[]]> = [];
  const hidden: Object3D[] = [];
  const made: Material[] = [];
  const flat = (normal: boolean) => (m: Material): Material => {
    const s = m as MeshStandardMaterial;
    const out = normal
      ? new MeshNormalMaterial({ normalMap: s.normalMap ?? null, normalScale: s.normalScale ?? new Vector2(1, 1), side: DoubleSide })
      : new MeshBasicMaterial({ map: s.map ?? null, color: s.color ?? new Color('#ffffff'), side: DoubleSide, toneMapped: false });
    made.push(out);
    return out;
  };
  const read = () => {
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, camera);
    const bytes = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(rt, 0, 0, width, height, bytes);
    const out = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] / 255;
    return out;
  };
  try {
    scene.traverse((o) => {
      const m = (o as Mesh).isMesh ? (o as Mesh).material : null;
      const clear = m && (Array.isArray(m) ? m : [m]).every((x) => !x.visible || x.opacity < 0.7);
      if (o.visible && (clear || skip(o))) { o.visible = false; hidden.push(o); }
    });
    scene.traverseVisible((o) => { if ((o as Mesh).isMesh) swapped.push([o as Mesh, (o as Mesh).material]); });
    scene.background = null;
    gl.setClearColor(black, 0);
    gl.toneMapping = 0;
    gl.shadowMap.autoUpdate = false;
    const paint = (normal: boolean) => { for (const [mesh, m] of swapped) mesh.material = Array.isArray(m) ? m.map(flat(normal)) : flat(normal)(m); };
    paint(false);
    const albedo = read();
    paint(true);
    return { albedo, normal: read(), width, height };
  } finally {
    for (const [mesh, m] of swapped) mesh.material = m;
    for (const o of hidden) o.visible = true;
    made.forEach((m) => m.dispose());
    scene.background = before.background;
    gl.toneMapping = before.tone;
    gl.shadowMap.autoUpdate = before.shadows;
    gl.setRenderTarget(before.target);
    gl.setClearColor(before.clear, before.alpha);
    rt.dispose();
  }
}

/** The exposure that puts the middle of the picture at a comfortable brightness; the brightest tenth (windows, sun) does not count. */
export function photoExposure(pixels: Float32Array): number {
  const lum: number[] = [];
  for (let i = 0; i < pixels.length; i += 4 * 97) lum.push(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
  lum.sort((a, b) => a - b);
  const kept = lum.slice(0, Math.ceil(lum.length * 0.9));
  const mean = kept.reduce((s, v) => s + v, 0) / Math.max(1, kept.length);
  return Math.min(12, Math.max(0.5, 0.36 / Math.max(1e-4, mean)));
}

export async function readFloatPixels(gl: WebGLRenderer, target: WebGLRenderTarget): Promise<Float32Array> {
  const out = new Float32Array(target.width * target.height * 4);
  await gl.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, out);
  return out;
}

export function denoise(unet: UNet, colour: Float32Array, guides: PhotoGuides): { result: Promise<Float32Array>; abort(): void } {
  const { width, height } = guides;
  let abort = () => undefined as void;
  const result = new Promise<Float32Array>((resolve, reject) => {
    abort = unet.tileExecute({
      color: { data: colour, width, height },
      albedo: { data: guides.albedo, width, height },
      normal: { data: guides.normal, width, height },
      done: (out) => resolve(out.data),
      error: reject,
    });
  });
  return { result, abort };
}

export function photoTexture(data: Float32Array, width: number, height: number): Texture {
  const t = new DataTexture(data, width, height, RGBAFormat, FloatType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
