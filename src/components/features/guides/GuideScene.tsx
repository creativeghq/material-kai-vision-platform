import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Html, OrbitControls, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { blueprintInk } from './blueprintInk';

import {
  activeItemAt,
  partCountAt,
  partUsedTotal,
  poseAt,
  type BuildItem,
  type CameraShot,
  type GuideBuild,
} from '@/lib/installation/guideBuild';
import type { GuideAppearance, GuideRoom, InstallationGuideData } from '@/lib/installation/guideSchema';
import {
  EDGE_BANDING, HOLE_COLOR, WOOD_TINT, hardwareGeometry, hardwareLook, hardwareShape, lookForPart, panelHoles, partNumber, useFinishLooks, usePhotoCrops, useStudioLight, woodTexture,
  type FinishLook, type Hole,
} from './partModels';
import { ElevationRoom, type PhotoElevation } from './photoElevation';

export type GuideView = 'room' | 'drawing' | 'photo';

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

interface Props {
  guide: InstallationGuideData;
  build: GuideBuild;
  xRef: React.MutableRefObject<number>;
  explodeRef: React.MutableRefObject<number>;
  view: GuideView;
  shot: CameraShot;
  shotVersion: number;
  stepIndex: number;
  pageUrl: string | null;
  hovered: string | null;
  onHover: (key: string | null, clientX: number, clientY: number) => void;
  onPick: (key: string) => void;
  onBoard?: (board: 'step' | 'hardware') => void;
  labels: boolean;
  atStart: boolean;
  follow: boolean;
  appearance?: GuideAppearance | null;
  photoUrl?: string | null;
  elevation?: PhotoElevation | null;
}

type Looks = { appearance: GuideAppearance | null; looks: Map<string, FinishLook>; hideKit: boolean };

const PANEL_EDGE_ROOM = '#c8a46a';
const GHOST = '#7fe3ff';
const HOVER = '#ffb454';
const tmp = {
  m: new THREE.Matrix4(),
  q: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),

  p: new THREE.Vector3(),
  s: new THREE.Vector3(),
  axisY: new THREE.Vector3(0, 1, 0),
  axisZ: new THREE.Vector3(0, 0, 1),
};

function numberBadge(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number, fill: string, ink: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function PanelHoles({ holes }: { holes: Hole[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    holes.forEach((h, i) => {
      tmp.q.setFromUnitVectors(tmp.axisZ, h.normal);
      tmp.s.set(h.radius, h.radius, 1);
      mesh.setMatrixAt(i, tmp.m.compose(h.pos, tmp.q, tmp.s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [holes]);
  if (holes.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, holes.length]} frustumCulled={false}>
      <circleGeometry args={[1, 20]} />
      <meshStandardMaterial color={HOLE_COLOR} roughness={1} polygonOffset polygonOffsetFactor={-2} />
    </instancedMesh>
  );
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function useDisposable<T extends { dispose: () => void } | null>(factory: () => T, key: unknown): T {
  const ref = useRef<{ key: unknown; value: T } | null>(null);
  if (!ref.current || ref.current.key !== key) {
    ref.current?.value?.dispose();
    ref.current = { key, value: factory() };
  }
  useEffect(() => () => {
    ref.current?.value?.dispose();
    ref.current = null;
  }, []);
  return ref.current.value;
}

function aimAt(goal: THREE.Vector3, target: THREE.Vector3, t: { x: number; y: number; z: number }, dist: number, yaw: number, pitch: number) {
  target.set(t.x, t.y, t.z);
  goal.set(
    t.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    t.y + Math.sin(pitch) * dist,
    t.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
}

function CameraRig({ shot, version, build, xRef, follow }: {
  shot: CameraShot;
  version: number;
  build: GuideBuild;
  xRef: React.MutableRefObject<number>;
  follow: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const dom = useThree((s) => s.gl.domElement);
  const portrait = useThree((s) => Math.min(1.9, Math.max(1, (0.8 * s.size.height) / Math.max(s.size.width, 1))));
  const following = useRef(true);
  const zoom = useRef(1);
  const goal = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const focus = useRef(new THREE.Vector3());
  const focusDist = useRef(shot.dist);

  useEffect(() => {
    following.current = true;
    aimAt(goal.current, target.current, shot.target, shot.dist * portrait * zoom.current, shot.yaw, shot.pitch);
    focus.current.set(shot.target.x, shot.target.y, shot.target.z);
    focusDist.current = shot.dist;
  }, [shot, version, portrait]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => { following.current = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number }>();
    let spread = 0;
    const zoomBy = (factor: number) => {
      const next = Math.min(400, Math.max(0.01, zoom.current * factor));
      const applied = next / zoom.current;
      zoom.current = next;
      if (!following.current && controls) {
        camera.position.sub(controls.target).multiplyScalar(applied).add(controls.target);
      }
    };
    const gap = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.0012));
    };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) spread = gap();
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && spread > 0) {
        const now = gap();
        if (now > 0) zoomBy(spread / now);
        spread = now;
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      spread = 0;
    };
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dom, camera, controls]);

  useFrame((_, delta) => {
    if (!following.current || !controls) return;
    const active = follow ? activeItemAt(build, xRef.current) : null;
    if (active && active.placed) {
      const hardware = active.kind === 'hardware';
      const reach = Math.hypot(active.size.x, active.size.y, active.size.z);
      const wantDist = Math.max(hardware ? 1.9 : 2.2, Math.min(shot.dist, reach * 2.4 + 1));
      const f = 1 - Math.exp(-delta * 1.6);
      const pose = poseAt(build, active, xRef.current, 0);
      const piece = new THREE.Vector3(pose.destination.x, pose.destination.y, pose.destination.z);
      const context = new THREE.Vector3(shot.target.x, shot.target.y, shot.target.z);
      const near = piece.distanceTo(context) < Math.max(1.2, shot.dist * 0.45);
      focus.current.lerp(near ? piece.lerp(context, hardware ? 0.35 : 0.25) : piece, f);
      focusDist.current += (wantDist - focusDist.current) * f;
      const out = pose.outward;
      const flat = Math.hypot(out.x, out.z);
      const side = hardware && flat > 1e-4 && flat > Math.abs(out.y) * 0.5;
      const turn = side ? Math.atan2(Math.sin(Math.atan2(out.x, out.z) - shot.yaw), Math.cos(Math.atan2(out.x, out.z) - shot.yaw)) : 0;
      const yaw = shot.yaw + Math.max(-0.7, Math.min(0.7, turn * 0.5));
      const pitch = hardware && !side && out.y > 1e-4 ? 0.85 : Math.max(shot.pitch, 0.5);
      aimAt(goal.current, target.current, focus.current, focusDist.current * portrait * zoom.current, yaw, pitch);
    } else if (!follow || !build.items.some((it) => it.t0 > xRef.current && it.t0 < Math.floor(xRef.current) + 1)) {
      aimAt(goal.current, target.current, shot.target, shot.dist * portrait * zoom.current, shot.yaw, shot.pitch);
    }
    const k = 1 - Math.exp(-delta * 2.2);
    camera.position.lerp(goal.current, k);
    controls.target.lerp(target.current, k);
    controls.update();
  });
  return null;
}

function KeyboardFly() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', clear);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', clear);
    };
  }, []);
  useFrame((_, delta) => {
    const k = keys.current;
    if (!controls || k.size === 0) return;
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, tmp.axisY).normalize();
    const speed = delta * 1.6 * (k.has('shift') ? 2.4 : 1);
    const move = new THREE.Vector3();
    if (k.has('w')) move.add(fwd);
    if (k.has('s')) move.sub(fwd);
    if (k.has('d')) move.add(right);
    if (k.has('a')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }
    const turn = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (turn) {
      const off = new THREE.Vector3().subVectors(camera.position, controls.target);
      off.applyAxisAngle(tmp.axisY, turn * delta * 1.1);
      camera.position.copy(controls.target).add(off);
    }
    if (move.lengthSq() > 0 || turn) controls.update();
  });
  return null;
}

function tileTexture(): THREE.CanvasTexture | null {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 253, 253);
  });
}

function RealRoom({ build, room, photoUrl }: { build: GuideBuild; room: GuideRoom | null; photoUrl: string | null }) {
  const span = Math.max(build.kitBounds.size.x, build.kitBounds.size.z, build.product.size.x, 3) + 2.4;
  const floorZ = (build.kitBounds.center.z + build.kitBounds.size.z / 2 + build.product.center.z - build.product.size.z / 2) / 2;
  const wallZ = build.product.center.z - build.product.size.z / 2 - 0.35;
  const wallH = Math.max(2.8, build.product.size.y + 1);
  const size = span * 2.2;
  const splashW = build.product.size.x + 0.6;
  const splashH = 0.65;
  const splashY = build.product.center.y + build.product.size.y / 2 + splashH / 2;
  const crops = useMemo(() => [
    ...(room?.wall_swatch ? [{ id: 'wall', box: room.wall_swatch, repeat: [size / 0.25, wallH / 0.25] as [number, number] }] : []),
    ...(room?.floor_swatch ? [{ id: 'floor', box: room.floor_swatch, repeat: size / 1.2 }] : []),
    ...(room?.backsplash?.swatch ? [{ id: 'splash', box: room.backsplash.swatch, repeat: [splashW / 0.3, splashH / 0.3] as [number, number] }] : []),
  ], [room, size, wallH, splashW, splashH]);
  const photo = usePhotoCrops(photoUrl, crops);
  const pattern = useDisposable(() => {
    if (!room || room.floor_swatch) return null;
    const t = room.floor_kind === 'wood' ? woodTexture()?.clone() ?? null : room.floor_kind === 'tile' || room.floor_kind === 'stone' ? tileTexture() : null;
    if (!t) return null;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(room.floor_kind === 'wood' ? 5 : size / 0.6, room.floor_kind === 'wood' ? size / 0.9 : size / 0.6);
    t.needsUpdate = true;
    return t;
  }, room ? `${room.floor_kind}:${!!room.floor_swatch}:${size}` : 'none');
  const wall = room?.wall ?? '#ece9e4';
  const floor = room?.floor ?? '#d9d3c9';
  const floorMap = photo.get('floor') ?? pattern;
  const side = useMemo(() => new THREE.Color(wall).multiplyScalar(0.86), [wall]);
  const ground = useMemo(() => new THREE.Color(floor).multiplyScalar(0.9), [floor]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, floorZ]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial key={floorMap?.uuid ?? 'plain'} color={floorMap && photo.get('floor') ? '#ffffff' : ground} map={floorMap ?? undefined} roughness={room?.floor_kind === 'tile' || room?.floor_kind === 'stone' ? 0.45 : 0.8} />
      </mesh>
      <mesh position={[0, wallH / 2, wallZ]} receiveShadow>
        <planeGeometry args={[size, wallH]} />
        <meshStandardMaterial key={photo.get('wall')?.uuid ?? 'plain'} color={photo.get('wall') ? '#ffffff' : wall} map={photo.get('wall') ?? undefined} roughness={0.92} />
      </mesh>
      <mesh position={[-span * 0.75, wallH / 2, floorZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[size, wallH]} />
        <meshStandardMaterial color={side} roughness={0.92} />
      </mesh>
      {room?.backsplash && (
        <mesh position={[build.product.center.x, splashY, wallZ + 0.004]} receiveShadow>
          <planeGeometry args={[splashW, splashH]} />
          <meshStandardMaterial key={photo.get('splash')?.uuid ?? 'plain'} color={photo.get('splash') ? '#ffffff' : room.backsplash.color} map={photo.get('splash') ?? undefined} roughness={0.35} />
        </mesh>
      )}
      <mesh position={[0, 0.045, wallZ + 0.008]} receiveShadow castShadow>
        <boxGeometry args={[size, 0.09, 0.016]} />
        <meshStandardMaterial color="#f7f6f3" roughness={0.6} />
      </mesh>
      <mesh position={[-span * 0.75 + 0.008, 0.045, floorZ]} receiveShadow>
        <boxGeometry args={[0.016, 0.09, size]} />
        <meshStandardMaterial color="#f7f6f3" roughness={0.6} />
      </mesh>
      <pointLight position={[0, wallH - 0.2, wallZ + 0.6]} intensity={3} distance={span * 2} color="#ffffff" />
      <directionalLight position={[1.5, 3.5, 9]} intensity={0.9} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#cfcac2', 0.25]} />
    </group>
  );
}

function Room({ build }: { build: GuideBuild }) {
  const span = Math.max(build.kitBounds.size.x, build.kitBounds.size.z, build.product.size.x, 3) + 2.4;
  const rugW = Math.max(build.kitBounds.size.x, build.product.size.x) + 1.2;
  const rugD = build.kitBounds.center.z + build.kitBounds.size.z / 2 - (build.product.center.z - build.product.size.z / 2) + 1;
  const rugZ = (build.kitBounds.center.z + build.kitBounds.size.z / 2 + build.product.center.z - build.product.size.z / 2) / 2;
  const rug = useDisposable(() => canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#e7dcc8';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#8a9a78';
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, 468, 468);
    ctx.strokeStyle = '#c75b39';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, 432, 432);
  }), 'rug');
  const wallZ = build.product.center.z - build.product.size.z / 2 - 0.35;
  const wallH = Math.max(2.8, build.product.size.y + 1);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, rugZ]} receiveShadow>
        <planeGeometry args={[span * 2.2, span * 2.2]} />
        <meshStandardMaterial color="#cdb593" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0005, rugZ]} receiveShadow>
        <planeGeometry args={[rugW, rugD]} />
        <meshStandardMaterial map={rug ?? undefined} roughness={0.95} />
      </mesh>
      <mesh position={[0, wallH / 2, wallZ]} receiveShadow>
        <planeGeometry args={[span * 2.2, wallH]} />
        <meshStandardMaterial color="#5a4636" roughness={0.9} />
      </mesh>
      <mesh position={[-span * 0.75, wallH / 2, rugZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[span * 2.2, wallH]} />
        <meshStandardMaterial color="#4e3d30" roughness={0.9} />
      </mesh>
      <mesh position={[0, wallH - 0.05, wallZ + 0.01]}>
        <boxGeometry args={[span * 2.2, 0.025, 0.02]} />
        <meshBasicMaterial color="#ffd9a0" />
      </mesh>
      <pointLight position={[0, wallH - 0.2, wallZ + 0.4]} intensity={6} distance={span * 2} color="#ffcf8a" />
    </group>
  );
}

function KitCards({ build, guide, view }: { build: GuideBuild; guide: InstallationGuideData; view: GuideView }) {
  const textures = useMemo(() => build.cards.map((c) => {
    const part = guide.parts.find((p) => p.id === c.partId);
    const w = 512;
    const h = Math.max(128, Math.round((c.depth / c.width) * 512));
    return canvasTexture(w, h, (ctx) => {
      ctx.fillStyle = view === 'drawing' ? '#ffffff' : '#f6f3ec';
      ctx.fillRect(0, 0, w, h);
      if (part) numberBadge(ctx, partNumber(guide.parts.indexOf(part)), w - 40, 40, 26, '#16171a', '#ffffff');
      ctx.fillStyle = '#16171a';
      ctx.font = '600 56px sans-serif';
      ctx.fillText(c.label, 20, h - 24);
      ctx.font = '400 26px monospace';
      if (c.code) ctx.fillText(c.code, w - 20 - ctx.measureText(c.code).width, h - 28);
      ctx.font = '500 24px sans-serif';
      ctx.fillStyle = '#555';
      ctx.fillText((part?.name ?? '').slice(0, 24), 20, 34);
      ctx.fillStyle = '#c75b39';
      ctx.fillRect(0, h - 8, w, 8);
    });
  }), [build.cards, guide.parts, view]);
  useEffect(() => () => textures.forEach((t) => t?.dispose()), [textures]);
  return (
    <group>
      {build.cards.map((c, i) => (
        <mesh key={c.partId} rotation={[-Math.PI / 2, 0, 0]} position={[c.pos.x, 0.0012, c.pos.z]} receiveShadow>
          <planeGeometry args={[c.width, c.depth]} />
          <meshStandardMaterial map={textures[i] ?? undefined} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Ghost({ build, xRef }: { build: GuideBuild; xRef: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useDisposable(() => {
    const parts = build.ghost.map((g) => {
      const box = new THREE.BoxGeometry(g.size.x, g.size.y, g.size.z);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      edges.translate(g.center.x, g.center.y, g.center.z);
      return edges;
    });
    if (parts.length === 0) return null;
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const p of parts) {
      positions.push(...(p.getAttribute('position').array as Float32Array));
      p.dispose();
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return merged;
  }, build.ghost);
  const material = useDisposable(() => new THREE.LineBasicMaterial({ color: GHOST, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }), 'ghost');
  useFrame(() => {
    if (!group.current || !material) return;
    const fade = Math.min(1, Math.max(0, (build.steps - 0.4 - xRef.current) / 0.6));
    material.opacity = 0.75 * fade;
    group.current.visible = fade > 0.01;
  });
  if (!geometry || !material) return null;
  return (
    <group ref={group}>
      <lineSegments geometry={geometry} material={material} renderOrder={10} />
    </group>
  );
}

function Panels({ build, guide, xRef, explodeRef, view, hovered, onHover, onPick, finish }: Pick<Props, 'build' | 'guide' | 'xRef' | 'explodeRef' | 'view' | 'hovered' | 'onHover' | 'onPick'> & { finish: Looks }) {
  const panels = useMemo(() => build.items.filter((it) => it.kind === 'panel'), [build.items]);
  const holes = useMemo(() => panels.map((it) => panelHoles(build, build.items.indexOf(it), (h) => guide.parts[h.partIndex]?.name ?? '')), [panels, build, guide.parts]);
  const wood = useMemo(() => woodTexture(), []);
  const worktop = useMemo(() => {
    const used = new Set(Object.values(finish.appearance?.parts ?? {}));
    const f = finish.appearance?.finishes.find((x) => /worktop|countertop|benchtop|work top/i.test(x.name) && !used.has(x.id));
    const top = panels.filter((it) => it.placed && it.size.y <= Math.min(it.size.x, it.size.z)).sort((a, b) => b.target.pos.y - a.target.pos.y)[0];
    return f && top ? { key: top.key, look: finish.looks.get(f.id) ?? null } : null;
  }, [finish, panels]);
  const geometries = useMemo(() => panels.map((it) => {
    const front = /door|front/i.test(guide.parts[it.partIndex]?.name ?? '');
    const gap = front ? 0.004 : 0;
    const thin = Math.min(it.size.x, it.size.y, it.size.z);
    return new RoundedBoxGeometry(
      Math.max(it.size.x - gap, 0.002), Math.max(it.size.y - gap, 0.002), it.size.z, 2, Math.min(0.0025, thin * 0.2),
    );
  }), [panels, guide.parts]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(() => {
    panels.forEach((it, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const pose = poseAt(build, it, xRef.current, explodeRef.current);
      mesh.visible = !(finish.hideKit && !(xRef.current > it.t0));
      mesh.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
      mesh.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      for (const mat of mats) mat?.emissive?.set(pose.moving ? '#5a2e06' : '#000000');
    });
  });
  return (
    <group>
      {panels.map((it, i) => {
        const part = guide.parts[it.partIndex];
        const isHover = hovered === it.key;
        const look = worktop?.key === it.key && worktop.look ? worktop.look : lookForPart(finish.appearance, finish.looks, it.partId);
        return (
          <mesh
            key={it.key}
            ref={(m) => { refs.current[i] = m; }}
            castShadow
            receiveShadow
            onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(it.key, e.clientX, e.clientY); }}
            onPointerOut={() => onHover(null, 0, 0)}
            onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(it.key); }}
          >
            <primitive object={geometries[i]} attach="geometry" />
            {[0, 1, 2, 3, 4, 5].map((face) => {
              const thin = it.size.x <= it.size.y && it.size.x <= it.size.z ? 0 : it.size.y <= it.size.z ? 1 : 2;
              const isFace = Math.floor(face / 2) === thin;
              const room = view !== 'drawing';
              const color = isHover ? HOVER : !room ? '#ffffff' : look ? (isFace ? look.color : look.base) : part?.kind === 'fitting' ? '#d9d9d9' : isFace ? WOOD_TINT : EDGE_BANDING;
              const map = !room || !isFace ? null : look ? look.map : part?.kind !== 'fitting' ? wood : null;
              return (
                <meshStandardMaterial
                  key={`${face}:${map?.uuid ?? 'plain'}`}
                  attach={`material-${face}`}
                  color={color}
                  map={map ?? undefined}
                  roughness={look && room ? look.roughness : isFace ? 0.62 : 0.8}
                  metalness={look && room ? look.metalness : 0}
                  transparent={!!look && room && look.opacity < 1}
                  opacity={look && room ? look.opacity : 1}
                />
              );
            })}
            <Edges threshold={20} color={view === 'drawing' ? '#111111' : PANEL_EDGE_ROOM} />
            <PanelHoles holes={holes[i]} />
          </mesh>
        );
      })}
    </group>
  );
}

function HardwarePart({ build, items, name, look: finishLook, hideKit, xRef, explodeRef, view, onHover, onPick }: {
  hideKit: boolean;
  look: FinishLook | null;
  build: GuideBuild;
  items: BuildItem[];
  name: string;
  xRef: React.MutableRefObject<number>;
  explodeRef: React.MutableRefObject<number>;
  view: GuideView;
  onHover: Props['onHover'];
  onPick: Props['onPick'];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dims = items[0].size;
  const shape = hardwareShape(name);
  const look = finishLook ? { color: finishLook.base, metalness: finishLook.metalness, roughness: finishLook.roughness } : hardwareLook(shape);
  const geometry = useDisposable(() => hardwareGeometry(shape, dims.x, dims.y), `${shape}:${dims.x}:${dims.y}`);
  const base = useMemo(() => new THREE.Color(view === 'drawing' ? '#222222' : look.color), [view, look.color]);
  const hot = useMemo(() => new THREE.Color('#ffb454'), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      const pose = poseAt(build, it, xRef.current, explodeRef.current);
      mesh.setColorAt(i, pose.moving ? hot : base);
      tmp.q.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
      if (pose.spinAngle) tmp.q.multiply(tmp.q2.setFromAxisAngle(tmp.axisY, pose.spinAngle));
      tmp.p.set(pose.pos.x, pose.pos.y, pose.pos.z);
      const shown = !(hideKit && !(xRef.current > it.t0));
      tmp.s.setScalar(shown ? 1 : 0);
      mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      castShadow
      frustumCulled={false}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId != null && items[e.instanceId]) onHover(items[e.instanceId].key, e.clientX, e.clientY);
      }}
      onPointerOut={() => onHover(null, 0, 0)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId != null && items[e.instanceId]) onPick(items[e.instanceId].key);
      }}
    >
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color="#ffffff" metalness={view === 'drawing' ? 0 : look.metalness} roughness={look.roughness} />
    </instancedMesh>
  );
}

function Hardware(props: Pick<Props, 'build' | 'guide' | 'xRef' | 'explodeRef' | 'view' | 'onHover' | 'onPick'> & { finish: Looks }) {
  const groups = useMemo(() => {
    const byPart = new Map<string, BuildItem[]>();
    for (const it of props.build.items) {
      if (it.kind !== 'hardware') continue;
      byPart.set(it.partId, [...(byPart.get(it.partId) ?? []), it]);
    }
    return [...byPart.entries()];
  }, [props.build.items]);
  return (
    <group>
      {groups.map(([partId, items]) => (
        <HardwarePart
          key={`${partId}-${items.length}`}
          build={props.build}
          items={items}
          name={props.guide.parts[items[0].partIndex]?.name ?? ''}
          look={lookForPart(props.finish.appearance, props.finish.looks, partId)}
          hideKit={props.finish.hideKit}
          xRef={props.xRef}
          explodeRef={props.explodeRef}
          view={props.view}
          onHover={props.onHover}
          onPick={props.onPick}
        />
      ))}
    </group>
  );
}

function Trails({ build, xRef }: { build: GuideBuild; xRef: React.MutableRefObject<number> }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const geometry = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 40 * 3), 3));
    return g;
  }, 'trails');
  const material = useDisposable(() => new THREE.LineDashedMaterial({ color: GHOST, dashSize: 0.025, gapSize: 0.02, transparent: true, opacity: 0.85 }), 'trail-material');
  useFrame(() => {
    if (!geometry || !lineRef.current) return;
    const arr = geometry.getAttribute('position').array as Float32Array;
    let n = 0;
    for (const it of build.items) {
      if (n >= 40) break;
      const x = xRef.current;
      if (!(x > it.t0 && x < it.ta)) continue;
      const pose = poseAt(build, it, x, 0);
      const to = pose.destination;
      arr.set([pose.pos.x, pose.pos.y, pose.pos.z, to.x, to.y, to.z], n * 6);
      n++;
    }
    geometry.setDrawRange(0, n * 2);
    geometry.getAttribute('position').needsUpdate = true;
    lineRef.current.computeLineDistances();
  });
  if (!geometry || !material) return null;
  return <lineSegments ref={lineRef} geometry={geometry} material={material} frustumCulled={false} />;
}

function ActiveLabel({ build, guide, xRef, labels }: { build: GuideBuild; guide: InstallationGuideData; xRef: React.MutableRefObject<number>; labels: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const noRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const x = xRef.current;
    let active: BuildItem | null = null;
    for (const it of build.items) {
      if (x > it.t0 && x < it.ta + 0.004 && (!active || it.t0 > active.t0)) active = it;
    }
    if (!groupRef.current || !textRef.current) return;
    const show = labels && !!active;
    groupRef.current.visible = show;
    textRef.current.style.display = show ? '' : 'none';
    if (!active) return;
    const pose = poseAt(build, active, x, 0);
    groupRef.current.position.set(pose.pos.x, pose.pos.y + Math.max(active.size.y, 0.05) / 2 + 0.06, pose.pos.z);
    const part = guide.parts[active.partIndex];
    const code = part?.code ? ` · ${part.code}` : '';
    const count = active.kind === 'hardware' ? ` · ${partCountAt(build, active.partId, x)}/${partUsedTotal(build, active.partId)}` : '';
    const text = `${part?.name ?? ''}${code}${count}`;
    const no = String(partNumber(active.partIndex));
    if (nameRef.current && nameRef.current.textContent !== text) nameRef.current.textContent = text;
    if (noRef.current && noRef.current.textContent !== no) noRef.current.textContent = no;
  });
  return (
    <group ref={groupRef} visible={false}>
      <Html zIndexRange={[10, 0]} center style={{ pointerEvents: 'none' }}>
        <div ref={textRef} className="flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-hairline bg-card/95 py-1 pl-1 pr-2.5 text-xs font-medium text-foreground shadow-overlay">
          <b ref={noRef} className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[11px] text-background" />
          <span ref={nameRef} />
        </div>
      </Html>
    </group>
  );
}

function SceneBoards({ build, guide, stepIndex, pageUrl, xRef, onBoard }: { build: GuideBuild; guide: InstallationGuideData; stepIndex: number; pageUrl: string | null; xRef: React.MutableRefObject<number>; onBoard?: Props['onBoard'] }) {
  const pointer = (on: boolean) => { document.body.style.cursor = on && onBoard ? 'pointer' : ''; };
  const step = guide.steps[stepIndex];
  const stepTexRef = useRef<THREE.CanvasTexture | null>(null);
  const hwTexRef = useRef<THREE.CanvasTexture | null>(null);
  const stepCanvas = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: 620, height: 480 })), []);
  const hwCanvas = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: 620, height: 480 })), []);
  const stepTex = useDisposable(() => (stepCanvas ? new THREE.CanvasTexture(stepCanvas) : null), stepCanvas);
  const hwTex = useDisposable(() => (hwCanvas ? new THREE.CanvasTexture(hwCanvas) : null), hwCanvas);
  stepTexRef.current = stepTex;
  hwTexRef.current = hwTex;

  useEffect(() => {
    const ctx = stepCanvas?.getContext('2d');
    if (!ctx || !stepCanvas || !step) return;
    const frame = () => {
      ctx.fillStyle = 'rgba(14,30,48,0.92)';
      ctx.fillRect(0, 0, 620, 480);
      ctx.strokeStyle = '#8fe4ff';
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, 614, 474);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 44px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(stepIndex ? `STEP ${stepIndex}` : 'THE KIT', 28, 24);
      ctx.font = '400 26px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`page ${step.page}`, 470, 34);
      const used = step.parts_used.slice(0, 6);
      used.forEach((u, i) => {
        const idx = guide.parts.findIndex((p) => p.id === u.part_id);
        if (idx < 0) return;
        const x = 44 + i * 96;
        numberBadge(ctx, partNumber(idx), x, 438, 18, '#ffd08a', '#0e1e30');
        ctx.fillStyle = '#ffffff';
        ctx.font = '500 22px monospace';
        ctx.fillText(`×${u.quantity}`, x + 24, 427);
      });
    };
    frame();
    if (stepTexRef.current) stepTexRef.current.needsUpdate = true;
    if (!pageUrl) return;
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!live) return;
      frame();
      const { x0, y0, x1, y1 } = step.box;
      const sw = (x1 - x0) * img.naturalWidth;
      const sh = (y1 - y0) * img.naturalHeight;
      const k = Math.min(560 / sw, 300 / sh);
      const w = Math.round(sw * k);
      const h = Math.round(sh * k);
      const lines = blueprintInk(img, x0 * img.naturalWidth, y0 * img.naturalHeight, sw, sh, w, h, 1);
      ctx.drawImage(lines, (620 - w) / 2, 96 + (300 - h) / 2);
      if (stepTexRef.current) stepTexRef.current.needsUpdate = true;
    };
    img.src = pageUrl;
    return () => { live = false; };
  }, [step, stepIndex, pageUrl, stepCanvas, guide.parts]);

  const lastDrawn = useRef(-1);
  useFrame(() => {
    const ctx = hwCanvas?.getContext('2d');
    if (!ctx) return;
    const x = Math.round(xRef.current * 20) / 20;
    if (x === lastDrawn.current) return;
    lastDrawn.current = x;
    const hw = guide.parts.filter((p) => p.kind === 'hardware').slice(0, 7);
    const numberOf = (p: (typeof guide.parts)[number]) => partNumber(guide.parts.indexOf(p));
    ctx.fillStyle = 'rgba(14,30,48,0.92)';
    ctx.fillRect(0, 0, 620, 480);
    ctx.strokeStyle = '#8fe4ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 614, 474);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 34px sans-serif';
    ctx.fillText('HARDWARE', 28, 22);
    const total = build.hardwareTotal;
    const inCount = build.items.filter((it) => it.kind === 'hardware' && xRef.current >= it.ta - 1e-6).length;
    ctx.font = '400 24px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`${inCount} / ${total} in`, 590, 30);
    ctx.textAlign = 'left';
    hw.forEach((p, i) => {
      const y = 82 + i * 54;
      const got = partCountAt(build, p.id, xRef.current);
      const shown = Math.min(p.quantity, 24);
      numberBadge(ctx, numberOf(p), 44, y + 20, 17, '#cfe9ff', '#0e1e30');
      ctx.fillStyle = '#ffffff';
      ctx.font = '500 22px sans-serif';
      ctx.fillText(p.name.slice(0, 15), 72, y);
      ctx.fillStyle = '#e6f3ff';
      ctx.font = '400 18px monospace';
      ctx.fillText(p.code || '—', 72, y + 24);
      const bw = Math.min(14, 300 / shown);
      for (let k = 0; k < shown; k++) {
        ctx.fillStyle = k < (got / p.quantity) * shown ? '#ffd08a' : 'rgba(143,228,255,.28)';
        ctx.fillRect(250 + k * bw, y + 6, bw - 3, 26);
      }
      ctx.fillStyle = got >= p.quantity ? '#ffd08a' : '#cfe9ff';
      ctx.font = '500 20px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${got}/${p.quantity}`, 592, y + 8);
      ctx.textAlign = 'left';
    });
    if (hwTexRef.current) hwTexRef.current.needsUpdate = true;
  });

  const wallZ = build.product.center.z - build.product.size.z / 2 - 0.33;
  const y = Math.max(1.3, build.product.size.y * 0.55 + 0.4);
  const half = Math.max(build.product.size.x / 2 + 1.05, 1.2);
  return (
    <group>
      <mesh
        position={[-half, y, wallZ]}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onBoard?.('step'); }}
        onPointerOver={() => pointer(true)}
        onPointerOut={() => pointer(false)}
      >
        <planeGeometry args={[0.93, 0.72]} />
        <meshBasicMaterial map={stepTex ?? undefined} transparent toneMapped={false} />
      </mesh>
      <mesh
        position={[half, y, wallZ]}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onBoard?.('hardware'); }}
        onPointerOver={() => pointer(true)}
        onPointerOut={() => pointer(false)}
      >
        <planeGeometry args={[0.93, 0.72]} />
        <meshBasicMaterial map={hwTex ?? undefined} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export const GuideScene: React.FC<Props> = (props) => {
  const { build, guide, view, shot, shotVersion, xRef, explodeRef } = props;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useStudioLight(scene, gl, view === 'drawing' ? 0 : 0.28);
  const looks = useFinishLooks(props.appearance ?? null, props.photoUrl ?? null);
  const finish = useMemo(() => ({ appearance: props.appearance ?? null, looks, hideKit: false }), [props.appearance, looks]);
  const real = props.appearance ? { floor: props.appearance.room?.floor ?? '#d9d3c9' } : null;

  useLayoutEffect(() => {
    scene.background = new THREE.Color(view === 'drawing' ? '#ffffff' : '#1a1410');
    scene.fog = view !== 'drawing' ? new THREE.FogExp2('#1a1410', 0.035) : null;
    gl.toneMappingExposure = view === 'drawing' ? 1.1 : 1;
  }, [scene, gl, view]);

  const span = Math.max(build.kitBounds.size.x, build.kitBounds.size.z, build.product.size.y, 2);

  return (
    <>
      <OrbitControls makeDefault enableDamping enableZoom={false} maxPolarAngle={Math.PI / 2.02} minDistance={0} maxDistance={Infinity} />
      <CameraRig shot={shot} version={shotVersion} build={build} xRef={xRef} follow={props.follow} />
      <KeyboardFly />
      {view !== 'drawing' ? (
        <>
          <SoftShadows size={22} samples={12} focus={0.5} />
          <ContactShadows position={[build.product.center.x, 0.002, build.product.center.z]} scale={Math.max(build.product.size.x, build.product.size.z) * 2.2 + 1} blur={2.6} opacity={0.55} far={1.2} resolution={512} frames={Infinity} />
          <hemisphereLight args={real ? ['#ffffff', real.floor, 1.6] : ['#fff2dd', '#3a2a1c', 0.9]} />
          <directionalLight
            position={real ? [-2.5, 5.5, 7] : [-3, 6, 4]}
            intensity={real ? 3.4 : 2.2}
            color={real ? '#fffaf2' : '#ffe2b8'}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-span}
            shadow-camera-right={span}
            shadow-camera-top={span}
            shadow-camera-bottom={-span}
            shadow-bias={-0.0005}
            shadow-normalBias={0.03}
          />
          <directionalLight position={[4, 3, -2]} intensity={0.6} color="#9fc4ff" />
          {view === 'photo' && props.elevation ? <ElevationRoom elevation={props.elevation} build={build} /> : props.appearance ? <RealRoom build={build} room={props.appearance.room} photoUrl={props.photoUrl ?? null} /> : <Room build={build} />}
          {build.hasAssembly && !(view === 'photo' && props.elevation) && <SceneBoards build={build} guide={guide} stepIndex={props.stepIndex} pageUrl={props.pageUrl} xRef={xRef} onBoard={props.onBoard} />}
        </>
      ) : (
        <>
          <hemisphereLight args={['#ffffff', '#ffffff', 2.2]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
            <planeGeometry args={[span * 6, span * 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </>
      )}
      <KitCards build={build} guide={guide} view={view} />
      {build.hasAssembly && <Ghost build={build} xRef={xRef} />}
      <Panels build={build} guide={guide} xRef={xRef} explodeRef={explodeRef} view={view} hovered={props.hovered} onHover={props.onHover} onPick={props.onPick} finish={finish} />
      <Hardware build={build} guide={guide} xRef={xRef} explodeRef={explodeRef} view={view} onHover={props.onHover} onPick={props.onPick} finish={finish} />
      <Trails build={build} xRef={xRef} />
      <ActiveLabel build={build} guide={guide} xRef={xRef} labels={props.labels} />
      {props.labels && props.atStart && build.items.length > 0 && <StartTags build={build} guide={guide} />}
      {props.labels && !props.atStart && <StepTags build={build} guide={guide} xRef={xRef} explodeRef={explodeRef} stepIndex={props.stepIndex} />}
    </>
  );
};

function StepTags({ build, guide, xRef, explodeRef, stepIndex }: {
  build: GuideBuild;
  guide: InstallationGuideData;
  xRef: React.MutableRefObject<number>;
  explodeRef: React.MutableRefObject<number>;
  stepIndex: number;
}) {
  const tags = useMemo(() => {
    const byPart = new Map<string, BuildItem>();
    for (const it of build.items) if (it.step === stepIndex && Number.isFinite(it.t0)) byPart.set(it.partId, it);
    return [...byPart.values()].slice(0, 10).map((it) => {
      const part = guide.parts[it.partIndex];
      return { it, no: partNumber(it.partIndex), text: [part?.name, part?.code].filter(Boolean).join(' · ') };
    });
  }, [build.items, guide.parts, stepIndex]);
  const refs = useRef<Array<THREE.Group | null>>([]);
  const texts = useRef<Array<HTMLDivElement | null>>([]);
  useFrame(() => {
    const busy = activeItemAt(build, xRef.current)?.partId;
    tags.forEach(({ it }, i) => {
      const g = refs.current[i];
      const el = texts.current[i];
      if (el) el.style.visibility = it.partId === busy ? 'hidden' : '';
      if (!g) return;
      const p = poseAt(build, it, xRef.current, explodeRef.current).pos;
      g.position.set(p.x, p.y + Math.max(it.size.y, it.size.x, 0.04) / 2 + 0.04, p.z);
    });
  });
  return (
    <group>
      {tags.map((t, i) => (
        <group key={t.it.key} ref={(g) => { refs.current[i] = g; }}>
          <Html zIndexRange={[10, 0]} center style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { texts.current[i] = el; }} className="flex items-center gap-1 whitespace-nowrap rounded-sm border border-hairline bg-card/90 py-0.5 pl-0.5 pr-1.5 text-[11px] text-foreground">
              <b className="grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-0.5 text-[10px] text-background">{t.no}</b>{t.text}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function StartTags({ build, guide }: { build: GuideBuild; guide: InstallationGuideData }) {
  const tags = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; no: number; text: string; pos: [number, number, number] }> = [];
    for (const it of build.items) {
      if (it.kind !== 'panel' || seen.has(it.partId)) continue;
      seen.add(it.partId);
      const part = guide.parts[it.partIndex];
      out.push({ key: it.partId, no: partNumber(it.partIndex), text: `${part?.quantity > 1 ? `${part.quantity} × ` : ''}${part?.name ?? ''}`, pos: [it.kit.pos.x, it.kit.pos.y + 0.05, it.kit.pos.z] });
    }
    return out.slice(0, 12);
  }, [build.items, guide.parts]);
  return (
    <group>
      {tags.map((t) => (
        <Html zIndexRange={[10, 0]} key={t.key} position={t.pos} center style={{ pointerEvents: 'none' }}>
          <div className="flex items-center gap-1 whitespace-nowrap rounded-sm border border-hairline bg-card/90 py-0.5 pl-0.5 pr-1.5 text-[11px] text-foreground">
            <b className="grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-0.5 text-[10px] text-background">{t.no}</b>{t.text}
          </div>
        </Html>
      ))}
    </group>
  );
}
