/** Photo mode: when the camera rests, the room is path traced in the browser (real bounced light); moving drops back to the live view. */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, Matrix4, MeshBasicMaterial, NormalBlending, type Texture as TextureT, type WebGLRenderTarget, type Material, type Mesh, type Object3D, type Scene, type Texture } from 'three';
import { DenoiseMaterial, GradientEquirectTexture, PathTracingSceneGenerator, WebGLPathTracer } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { denoise as cleanPhoto, denoiserNet, forgetDenoiser, photoExposure, photoTexture, readFloatPixels, renderGuides, type PhotoGuides } from '@/components/features/scenestudio/photoDenoiser';
import { drawOutdoorsOver } from '@/components/features/scenestudio/outdoorsOverlay';
import { drawSplatsOver } from '@/components/features/scenestudio/splatOverlay';
import { excludedFromTrace, withTraceView } from '@/components/features/scenestudio/traceView';

const MAX_SAMPLES = 120;
/** A clean picture is made at each of these; the last one is the photo. */
const CLEAN_AT = [24, 60, MAX_SAMPLES];
const DENOISE_LIMIT_MS = 60_000;
const EXPOSE_AT = 6;

type Disposable = { dispose?(): void; isTexture?: boolean; renderTarget?: { dispose(): void } | null };

/** The library's own dispose() reads a field that does not exist in 0.0.23 and throws, and it never frees the scene data held in the material's uniforms, so each Photo Mode session kept ~0.7 GB of GPU memory. */
export function disposeTracer(t: WebGLPathTracer) {
  const inner = t as unknown as {
    _quad?: { dispose(): void; material: { dispose(): void } };
    _pathTracer?: { dispose(): void; material?: (Material & { uniforms?: Record<string, { value: unknown }> }) | null };
    _lowResPathTracer?: { dispose(): void };
    _colorBackground?: Disposable | null;
    _internalBackground?: Disposable | null;
  };
  const material = inner._pathTracer?.material;
  for (const [name, u] of Object.entries(material?.uniforms ?? {})) {
    const v = u.value as Disposable | null;
    if (!v || name === 'backgroundMap' || name === 'sobolTexture') continue;
    if (v.isTexture && v.renderTarget) v.renderTarget.dispose();
    else v.dispose?.();
  }
  material?.dispose();
  inner._colorBackground?.dispose?.();
  inner._internalBackground?.dispose?.();
  inner._quad?.dispose();
  inner._quad?.material.dispose();
  inner._pathTracer?.dispose();
  inner._lowResPathTracer?.dispose();
}

function sceneSignature(scene: Object3D): number {
  let hash = 0;
  const mix = (n: number) => { hash = (Math.imul(hash ^ Math.round(n), 2654435761) + 0x9e3779b9) | 0; };
  scene.traverseVisible((o) => {
    if (excludedFromTrace(o)) return;
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mix(mesh.geometry.id);
    const e = mesh.matrixWorld.elements;
    mix(e[12] * 1000); mix(e[13] * 1000); mix(e[14] * 1000); mix(e[0] * 1000); mix(e[2] * 1000);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const sm = m as Material & { color?: Color; map?: Texture | null; normalMap?: Texture | null };
      mix((m as unknown as { id: number }).id); mix(sm.color?.getHex() ?? 0); mix(sm.map?.id ?? 0); mix(sm.normalMap?.id ?? 0); mix(m.opacity * 100);
    }
  });
  return hash;
}

export const PhotoMode: React.FC<{ ceilingHeight: number; onProgress(samples: number, settled: boolean, preparing: boolean): void }> = ({ ceilingHeight, onProgress }) => {
  const { gl, scene, camera } = useThree();
  const depthOnly = useMemo(() => new MeshBasicMaterial({ colorWrite: false }), []);
  const denoise = useMemo(() => {
    const m = new DenoiseMaterial({ transparent: true, blending: NormalBlending });
    return new FullScreenQuad(m);
  }, []);
  const clean = useMemo(() => new FullScreenQuad(new MeshBasicMaterial({ depthTest: false, depthWrite: false })), []);
  const photo = useRef<{ texture: Texture | null; step: number; run: number; exposure: number | null; busy: boolean; abort: (() => void) | null; guides: PhotoGuides | null }>(
    { texture: null, step: 0, run: 0, exposure: null, busy: false, abort: null, guides: null });
  const tracer = useMemo(() => {
    const t = new WebGLPathTracer(gl);
    t.tiles.set(2, 2);
    t.renderDelay = 250;
    t.minSamples = 2;
    t.fadeDuration = 350;
    t.bounces = 6;
    t.filterGlossyFactor = 0.5;
    t.renderToCanvasCallback = (_target, renderer, quad) => {
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      const dm = denoise.material as DenoiseMaterial & { map: TextureT | null; opacity: number; sigma: number; kSigma: number; threshold: number };
      const q = quad.material as { map: TextureT | null; opacity: number };
      const done = photo.current.texture;
      if (done) {
        (clean.material as MeshBasicMaterial).map = done;
        clean.render(renderer);
      } else {
        dm.map = q.map;
        dm.opacity = q.opacity;
        dm.sigma = Math.max(1.2, 5 - t.samples / 40);
        dm.kSigma = 1;
        dm.threshold = 0.04;
        denoise.render(renderer);
      }
      drawOutdoorsOver(renderer, scene as Scene, camera, depthOnly);
      drawSplatsOver(renderer, scene as Scene, camera, depthOnly);
      renderer.autoClear = auto;
    };
    return t;
  }, [gl, scene, camera, depthOnly, denoise, clean]);

  const restart = () => {
    const p = photo.current;
    p.run += 1;
    p.step = 0;
    p.abort?.();
    p.abort = null;
    p.busy = false;
    p.guides = null;
    p.texture?.dispose();
    p.texture = null;
  };

  const develop = async () => {
    const p = photo.current;
    const run = p.run;
    p.busy = true;
    try {
      const target = tracer.target as WebGLRenderTarget;
      const pixels = await readFloatPixels(gl, target);
      if (run !== p.run) return;
      p.exposure = photoExposure(pixels);
      const unet = p.step > 0 ? await denoiserNet() : null;
      if (!unet || run !== p.run) return;
      const guides = p.guides ??= renderGuides(gl, scene as Scene, camera, target.width, target.height, excludedFromTrace);
      const job = cleanPhoto(unet, pixels, guides);
      p.abort = job.abort;
      let late = 0;
      const limit = new Promise<null>((resolve) => { late = window.setTimeout(() => resolve(null), DENOISE_LIMIT_MS); });
      const out = await Promise.race([job.result, limit]);
      clearTimeout(late);
      if (!out) { job.abort(); forgetDenoiser(); throw new Error('The denoiser did not finish.'); }
      if (run !== p.run) return;
      p.texture?.dispose();
      p.texture = photoTexture(out, target.width, target.height);
    } catch {
      if (run === p.run) p.texture = null;
    } finally {
      if (run === p.run) p.busy = false;
    }
  };

  const sky = useMemo(() => {
    const g = new GradientEquirectTexture(256);
    g.topColor.set('#cfe3ff');
    g.bottomColor.set('#b9ab98');
    g.exponent = 1.6;
    g.update();
    return g;
  }, []);

  const built = useRef<number | null>(null);
  const pending = useRef<{ sig: number; at: number } | null>(null);
  const lastCam = useRef(new Matrix4());
  const lastFov = useRef(0);
  const reported = useRef(-1);
  const ended = useRef(false);

  useEffect(() => {
    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    const prevTone = gl.toneMapping;
    const prevExposure = gl.toneMappingExposure;
    scene.environment = sky;
    scene.environmentIntensity = 1.3;
    gl.toneMapping = ACESFilmicToneMapping;
    built.current = null;
    return () => {
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      gl.toneMapping = prevTone;
      gl.toneMappingExposure = prevExposure;
      restart();
      disposeTracer(tracer);
      clean.dispose();
      clean.material.dispose();
      denoise.dispose();
      denoise.material.dispose();
      sky.dispose();
      depthOnly.dispose();
    };
  }, [scene, gl, sky, tracer, depthOnly, denoise, clean]);

  useFrame(({ clock }) => {
    const tracing = !(tracer as unknown as { isCompiling: boolean }).isCompiling && tracer.samples >= 1;
    gl.toneMappingExposure = !tracing ? 1 : camera.position.y < ceilingHeight ? photo.current.exposure ?? 2.3 : 0.85;
    const sig = sceneSignature(scene);
    const now = clock.elapsedTime;
    if (sig !== built.current) {
      if (!pending.current || pending.current.sig !== sig) pending.current = { sig, at: now };
      if (built.current === null || now - pending.current.at > 0.3) {
        (tracer as unknown as { _generator: PathTracingSceneGenerator })._generator = new PathTracingSceneGenerator();
        scene.environment = sky;
        withTraceView(scene, () => tracer.setScene(scene, camera));
        built.current = sig;
        pending.current = null;
        photo.current.exposure = null;
        restart();
      }
    }
    const fov = (camera as { fov?: number }).fov ?? 0;
    if (!lastCam.current.equals(camera.matrixWorld) || fov !== lastFov.current) {
      lastCam.current.copy(camera.matrixWorld);
      lastFov.current = fov;
      tracer.updateCamera();
      restart();
    }
    tracer.pausePathTracing = tracer.samples >= MAX_SAMPLES;
    tracer.renderSample();
    const samples = (tracer as unknown as { isCompiling: boolean }).isCompiling ? -1 : Math.floor(tracer.samples);
    const next = photo.current.step === 0 ? EXPOSE_AT : CLEAN_AT[photo.current.step - 1];
    if (next !== undefined && samples >= next && !photo.current.busy) {
      void develop();
      photo.current.step += 1;
    }
    const finished = samples >= MAX_SAMPLES && photo.current.step >= CLEAN_AT.length + 1 && !photo.current.busy;
    if ((samples !== reported.current && (samples % 4 === 0 || samples < 4)) || finished !== ended.current) {
      reported.current = samples;
      ended.current = finished;
      onProgress(Math.max(0, samples), finished, samples < 0);
    }
  }, 1);

  return null;
};
