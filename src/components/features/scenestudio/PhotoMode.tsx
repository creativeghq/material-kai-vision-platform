/** Photo mode: when the camera rests, the room is path traced in the browser (real bounced light); moving drops back to the live view. */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, BufferAttribute, BufferGeometry, Color, Matrix4, Mesh as ThreeMesh, MeshBasicMaterial, NormalBlending, type Texture as TextureT, type Material, type Mesh, type Object3D, type Scene, type Texture } from 'three';
import { DenoiseMaterial, GradientEquirectTexture, PathTracingSceneGenerator, WebGLPathTracer } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { drawSplatsOver, invisibleMaterial, isSplat } from '@/components/features/scenestudio/splatOverlay';

const MAX_SAMPLES = 600;

/** The library's own dispose() reads a field that does not exist in 0.0.23 and throws, taking the canvas with it. */
function disposeTracer(t: WebGLPathTracer) {
  const inner = t as unknown as {
    _quad?: { dispose(): void; material: { dispose(): void } };
    _pathTracer?: { dispose(): void };
    _lowResPathTracer?: { dispose(): void };
  };
  inner._quad?.dispose();
  inner._quad?.material.dispose();
  inner._pathTracer?.dispose();
  inner._lowResPathTracer?.dispose();
}

function excludedFromTrace(o: Object3D): boolean {
  if (o.userData?.helper || o.userData?.splat || isSplat(o)) return true;
  const mesh = o as Mesh;
  return !!mesh.isMesh && invisibleMaterial(mesh.material);
}

/** The tracer gives each mesh ONE material slot, so a multi-material wall shifts every later mesh's material; trace it as one mesh per face. */
function withTraceView<T>(scene: Object3D, fn: () => T): T {
  const hidden: Object3D[] = [];
  scene.traverse((o) => { if (o.visible && excludedFromTrace(o)) { o.visible = false; hidden.push(o); } });
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
  for (const [part, parent] of parts) parent.add(part);
  try { return fn(); } finally {
    for (const [part, parent] of parts) parent.remove(part);
    for (const o of hidden) o.visible = true;
  }
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
      dm.map = q.map;
      dm.opacity = q.opacity;
      dm.sigma = Math.max(1.2, 5 - t.samples / 40);
      dm.kSigma = 1;
      dm.threshold = 0.04;
      denoise.render(renderer);
      drawSplatsOver(renderer, scene as Scene, camera, depthOnly);
      renderer.autoClear = auto;
    };
    return t;
  }, [gl, scene, camera, depthOnly, denoise]);

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
      disposeTracer(tracer);
      denoise.dispose();
      denoise.material.dispose();
      sky.dispose();
      depthOnly.dispose();
    };
  }, [scene, gl, sky, tracer, depthOnly, denoise]);

  useFrame(({ clock }) => {
    const tracing = !(tracer as unknown as { isCompiling: boolean }).isCompiling && tracer.samples >= 1;
    gl.toneMappingExposure = !tracing ? 1 : camera.position.y < ceilingHeight ? 2.3 : 0.85;
    const sig = sceneSignature(scene);
    const now = clock.elapsedTime;
    if (sig !== built.current) {
      if (!pending.current || pending.current.sig !== sig) pending.current = { sig, at: now };
      if (built.current === null || now - pending.current.at > 0.3) {
        (tracer as unknown as { _generator: PathTracingSceneGenerator })._generator = new PathTracingSceneGenerator();
        withTraceView(scene, () => tracer.setScene(scene, camera));
        built.current = sig;
        pending.current = null;
      }
    }
    const fov = (camera as { fov?: number }).fov ?? 0;
    if (!lastCam.current.equals(camera.matrixWorld) || fov !== lastFov.current) {
      lastCam.current.copy(camera.matrixWorld);
      lastFov.current = fov;
      tracer.updateCamera();
    }
    tracer.pausePathTracing = tracer.samples >= MAX_SAMPLES;
    tracer.renderSample();
    const samples = (tracer as unknown as { isCompiling: boolean }).isCompiling ? -1 : Math.floor(tracer.samples);
    if (samples !== reported.current && (samples % 4 === 0 || samples < 4 || samples >= MAX_SAMPLES)) {
      reported.current = samples;
      onProgress(Math.max(0, samples), samples >= MAX_SAMPLES, samples < 0);
    }
  }, 1);

  return null;
};
