/** What makes the 3D room read as a real interior: light, default surfaces, and real shapes for every object kind. */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BackSide, Box3, BoxGeometry, Color, CubeCamera, DoubleSide, HalfFloatType, NoToneMapping, PMREMGenerator, SRGBColorSpace, TextureLoader, Vector2, Vector3,
  WebGLCubeRenderTarget, type BufferGeometry, type Group, type Mesh, type Object3D, type Texture, type WebGLRenderTarget,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DARK, STEEL, STONE, WHITE, objectParts } from '@/lib/scene/objectParts';
import type { SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import type { Finish } from '@/lib/scene/sceneSurfaces';
import { useLook } from '@/components/features/scenestudio/surfaceMaps';
import { isSplat } from '@/components/features/scenestudio/splatOverlay';
import { pointInPolygon } from '@/lib/scene/sceneGeometry';
import { sunAt } from '@/lib/scene/sun';
import { KITCHEN_KINDS, type KitchenLayout } from '@/lib/scene/kitchenComposition';
import type { BoardSlot } from '@/lib/scene/cabinetPanels';
import { CabinetViewContext, buildKitchenGeometry, type FittingGroup } from '@/components/features/scenestudio/cabinetMesh';

const INTERIOR_ENV = '/env/interior.hdr';
const OUTDOOR = '/env/garden.webp';

/** The view through the windows, shown only from inside the home. */
const Outdoors: React.FC<{ span: number }> = ({ span }) => {
  const ref = useRef<Group>(null);
  const ground = useRef<Mesh>(null);
  const { scene } = useThree();
  const [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    let live = true;
    new TextureLoader().loadAsync(OUTDOOR).then((t) => { t.colorSpace = SRGBColorSpace; if (live) setMap(t); else t.dispose(); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => () => map?.dispose(), [map]);
  useFrame(({ camera }) => {
    const { x, y, z } = camera.position;
    const inside = y < 2.6 && Math.abs(x) < span / 2 && Math.abs(z) < span / 2;
    if (!ref.current || ref.current.visible === inside) return;
    ref.current.visible = inside;
    const home = new Box3();
    scene.traverse((o) => { if (o.userData?.surface === 'floor') home.expandByObject(o); });
    if (!ground.current || home.isEmpty()) return;
    home.getCenter(ground.current.position).setY(-0.02);
    const size = home.getSize(new Vector3());
    ground.current.scale.set(size.x, size.z, 1);
  });
  return map && (
    <group ref={ref} visible={false} userData={{ outdoors: true }}>
      <mesh userData={{ helper: true, outdoors: true }} raycast={() => null} position={[0, 1.5, 0]}>
        <sphereGeometry args={[60, 48, 24]} />
        <meshBasicMaterial map={map} side={BackSide} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={ground} userData={{ helper: true, ground: true }} raycast={() => null} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#8f8678" roughness={0.9} />
      </mesh>
    </group>
  );
};

export interface LitRoom { id: string; outline: Array<[number, number]>; centre: [number, number]; height: number }

const PROBE_AGES_S = [0.5, 3, 8];

/** Shows only the window light of one room (all of them for null); area lights cast no shadows and would shine through the walls. */
function showWindowsOf(scene: Object3D, room: string | null) {
  scene.traverse((o) => { if ('windowRoom' in o.userData) o.visible = room === null || o.userData.windowRoom === room; });
}

/** Lights the room the camera stands in with what that room itself looks like, so the floor warms the walls and the window side stays brighter. */
function useRoomLight(rooms: LitRoom[], version: unknown, solid: () => boolean) {
  const { gl, scene } = useThree();
  const base = useRef<Texture | null>(null);
  const own = useRef(new Set<Texture>());
  const probes = useRef(new Map<string, WebGLRenderTarget>());
  const state = useRef<{ room: string | null; since: number | null; shot: number; version: unknown }>({ room: null, since: null, shot: 0, version });
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  const cube = useMemo(() => new WebGLCubeRenderTarget(128, { type: HalfFloatType, generateMipmaps: false }), []);
  const eye = useMemo(() => new CubeCamera(0.05, 100, cube), [cube]);

  useEffect(() => {
    let live = true;
    const mine = own.current;
    const shots = probes.current;
    const use = (env: Texture) => {
      mine.add(env);
      const before = base.current;
      base.current = env;
      if (!scene.environment || scene.environment === before) { scene.environment = env; scene.environmentIntensity = BASE_LIGHT; }
      if (before) { mine.delete(before); before.dispose(); }
    };
    use(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    new RGBELoader().loadAsync(INTERIOR_ENV).then((hdr) => {
      if (live) use(pmrem.fromEquirectangular(hdr).texture);
      hdr.dispose();
    }).catch(() => undefined);
    return () => {
      live = false;
      if (scene.environment && mine.has(scene.environment)) scene.environment = null;
      mine.forEach((env) => env.dispose());
      shots.forEach((s) => s.dispose());
      mine.clear(); shots.clear();
      base.current = null;
      pmrem.dispose();
      cube.dispose();
    };
  }, [scene, pmrem, cube]);

  const capture = (room: LitRoom) => {
    const was: Array<[Object3D, boolean]> = [];
    const set = (o: Object3D, on: boolean) => { if (o.visible !== on) { was.push([o, o.visible]); o.visible = on; } };
    const before = { tone: gl.toneMapping, env: scene.environment, k: scene.environmentIntensity };
    try {
      scene.traverse((o) => {
        if (o.userData?.outdoors || o.userData?.surface === 'ceiling') set(o, true);
        else if (isSplat(o) || o.userData?.splat || o.userData?.helper) set(o, false);
        if ('windowRoom' in o.userData) set(o, o.userData.windowRoom === room.id);
      });
      gl.toneMapping = NoToneMapping;
      scene.environment = base.current;
      scene.environmentIntensity = BASE_LIGHT;
      eye.position.set(room.centre[0], Math.min(1.4, room.height / 2), room.centre[1]);
      eye.update(gl, scene);
      const target = pmrem.fromCubemap(cube.texture);
      const old = probes.current.get(room.id);
      if (old) { own.current.delete(old.texture); old.dispose(); }
      own.current.add(target.texture);
      probes.current.set(room.id, target);
    } finally {
      gl.toneMapping = before.tone;
      scene.environment = before.env;
      scene.environmentIntensity = before.k;
      for (const [o, on] of was) o.visible = on;
    }
  };

  useFrame(({ camera, clock }) => {
    if (scene.environment && !own.current.has(scene.environment)) return;
    const s = state.current;
    if (s.version !== version) { s.version = version; s.since = null; s.shot = 0; }
    const { x, y, z } = camera.position;
    const room = rooms.find((r) => y > 0 && y < r.height && pointInPolygon(x, z, r.outline)) ?? null;
    const id = room?.id ?? null;
    const entered = id !== s.room;
    if (entered) { s.room = id; showWindowsOf(scene, id); }
    if (room && solid()) {
      s.since ??= clock.elapsedTime;
      const due = s.shot < PROBE_AGES_S.length && clock.elapsedTime - s.since >= PROBE_AGES_S[s.shot];
      if (due) { s.shot += 1; rooms.forEach(capture); } else if (!probes.current.has(room.id)) capture(room);
    }
    const probe = room ? probes.current.get(room.id) : null;
    scene.environment = probe?.texture ?? base.current;
    scene.environmentIntensity = probe ? ROOM_LIGHT : BASE_LIGHT;
  });
}

const BASE_LIGHT = 0.75;
const ROOM_LIGHT = 0.95;

export const RoomLighting: React.FC<{ span: number; sunHour?: number | null; rooms: LitRoom[]; version: unknown; solid(): boolean }> = ({ span, sunHour, rooms, version, solid }) => {
  useRoomLight(rooms, version, solid);
  const s = Math.max(span, 4);
  const sun = sunHour == null ? null : sunAt(sunHour, span);
  return (
    <>
      <Outdoors span={span} />
      <hemisphereLight args={['#fff7ec', '#bfae97', (sun?.sky ?? 0.35) * 0.4]} />
      <directionalLight
        position={sun?.position ?? [s * 0.55, s * 1.1, s * 0.35]}
        intensity={(sun?.intensity ?? 1.7) * 1.4}
        color={sun?.colour ?? '#fff1dc'}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-s}
        shadow-camera-right={s}
        shadow-camera-top={s}
        shadow-camera-bottom={-s}
        shadow-camera-near={0.5}
        shadow-camera-far={s * 4}
      />
    </>
  );
};

/** The ceiling of a room, shown only while the camera is below it (standing or walking inside). */
export const Ceiling: React.FC<{
  height: number; children: React.ReactNode; onClick?(e: ThreeEvent<MouseEvent>): void; onHover?(on: boolean): void;
}> = ({ height, children, onClick, onHover }) => {
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.y < height - 0.05;
  });
  return (
    <mesh
      ref={ref}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, height, 0]}
      visible={false}
      castShadow
      userData={{ surface: 'ceiling' }}
      onClick={(e) => { if (ref.current?.visible) onClick?.(e); }}
      onPointerOver={() => { if (ref.current?.visible) onHover?.(true); }}
      onPointerOut={() => onHover?.(false)}
    >
      {children}
    </mesh>
  );
};

type Common = { castShadow: boolean; receiveShadow: boolean; userData: Record<string, unknown> };
/** One material slot drawn in its finish at real size: the product's own look, or the library material it calls for. */
export const FinishMaterial: React.FC<{
  attach?: string; finish: Finish | null; fallback: string; w: number; h: number; offX?: number; offY?: number;
  wireframe: boolean; highlight?: boolean; side?: typeof DoubleSide; role?: string | null; rough?: number; metal?: number;
}> = ({ attach, finish, fallback, w, h, offX = 0, offY = 0, wireframe, highlight, side, role = 'surface:wall', rough, metal = 0 }) => {
  const look = useLook(finish, { role, fallback, rough }, w, h, offX, offY);
  const colour = useMemo(() => (look ? new Color().setRGB(...look.colour) : new Color(finish?.hex ?? fallback)), [look, finish?.hex, fallback]);
  const relief = useMemo(() => new Vector2(look?.normalScale ?? 1, look?.normalScale ?? 1), [look?.normalScale]);
  return (
    <meshStandardMaterial
      key={look ? `m${look.map ? 1 : 0}${look.normalMap ? 1 : 0}` : 'n'}
      attach={attach}
      color={colour}
      map={look?.map ?? null}
      normalMap={look?.normalMap ?? null}
      normalScale={relief}
      roughnessMap={look?.roughnessMap ?? null}
      roughness={look?.roughness ?? rough ?? 0.8}
      metalness={metal}
      emissive={highlight ? '#3d7bff' : '#000000'}
      emissiveIntensity={highlight ? 0.22 : 0}
      side={side}
      wireframe={wireframe}
    />
  );
};

export type SlotFinishes = Partial<Record<SceneObjectSlot, Finish | null>>;

const ROUND_STEPS = 4;

/** A box with rounded edges whose faces stay truly flat (three's own tilts the normals of the flat part). */
function roundedBox(size: [number, number, number], r: number): BufferGeometry {
  const n = ROUND_STEPS * 2 + 1;
  const g = new BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.getAttribute('position'); const nor = g.getAttribute('normal');
  const d = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const at = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((c) => Math.round((c + 0.5) * n));
    const low = at.map((k) => k <= ROUND_STEPS);
    d.fromArray(at.map((k, axis) => Math.tan((Math.PI / 4) * (low[axis] ? k / ROUND_STEPS - 1 : (k - ROUND_STEPS - 1) / ROUND_STEPS)))).normalize();
    nor.setXYZ(i, d.x, d.y, d.z);
    const p = size.map((s, axis) => (low[axis] ? -1 : 1) * (s / 2 - r) + d.getComponent(axis) * r);
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  return g;
}

/** A box or rounded box whose UVs are metres on every face, grain along the face's longer side. */
export function partGeometry(size: [number, number, number], round?: number): BufferGeometry {
  const r = round ? Math.min(round, Math.min(...size) / 2 - 0.0005) : 0;
  const g = r > 0 ? roundedBox(size, r) : new BoxGeometry(...size);
  g.clearGroups();
  const pos = g.getAttribute('position'); const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const axis = Math.floor(i / (pos.count / 6)) >> 1;
    const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const at = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [u, v] = size[a] > size[b] ? [b, a] : [a, b];
    uv.setXY(i, at[u] + size[u] / 2, at[v] + size[v] / 2);
  }
  return g;
}

const Part: React.FC<{
  part: ReturnType<typeof objectParts>[number]; finish: Finish | null | undefined; kind: string; wireframe: boolean; common: Common;
}> = ({ part, finish, kind, wireframe, common }) => {
  const [x, y, z] = part.size;
  const geometry = useMemo(() => partGeometry([x, y, z], part.round), [x, y, z, part.round]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const role = part.metal ? null : part.slot === 'fabric' ? `kind:${kind}` : part.slot ? `slot:${part.slot}` : null;
  return (
    <mesh {...common} geometry={geometry} position={part.pos}>
      <FinishMaterial finish={finish ?? null} fallback={part.color} w={1} h={1} wireframe={wireframe} role={role} rough={part.rough ?? 0.7} metal={part.metal} />
    </mesh>
  );
};

const BOARD_DEFAULT: Record<BoardSlot, { colour: string; rough: number }> = {
  carcass: { colour: '#ece9e3', rough: 0.55 },
  back: { colour: '#e2ddd3', rough: 0.8 },
  plinth: { colour: DARK, rough: 0.8 },
  fronts: { colour: WHITE, rough: 0.35 },
};

const FITTING_LOOK: Record<FittingGroup, { colour: string; rough: number; metal: number }> = {
  metal: { colour: STEEL, rough: 0.25, metal: 0.85 },
  gola: { colour: '#8d9096', rough: 0.35, metal: 0.7 },
  appliance: { colour: '#1d1f22', rough: 0.15, metal: 0.4 },
};

/** A kitchen object drawn as the boards its cabinets are cut from; the worktop and sink still come from objectParts. */
const KitchenRun: React.FC<{
  kind: string; w: number; d: number; h: number; colour: string; wireframe: boolean; common: Common; finishes: SlotFinishes; layout?: KitchenLayout | null;
}> = ({ kind, w, d, h, colour, wireframe, common, finishes, layout }) => {
  const view = useContext(CabinetViewContext);
  const geo = useMemo(() => buildKitchenGeometry(kind, w, d, h, view, layout), [kind, w, d, h, view, layout]);
  useEffect(() => () => geo?.dispose(), [geo]);
  const seating = (layout?.seating_mm ?? 0) / 1000;
  const extras = useMemo(() => objectParts(kind, w, d, h, colour)
    .filter((p) => p.slot === 'worktop' || p.slot === null)
    .map((p) => (p.slot === 'worktop' && seating > 0
      ? { ...p, size: [p.size[0], p.size[1], p.size[2] + seating] as [number, number, number], pos: [p.pos[0], p.pos[1], p.pos[2] - seating / 2] as [number, number, number] }
      : p.slot === null && geo?.sinkX != null ? { ...p, pos: [p.pos[0] + geo.sinkX, p.pos[1], p.pos[2]] as [number, number, number] } : p)), [kind, w, d, h, colour, seating, geo]);
  const slotFinish = (slot: BoardSlot): Finish | null | undefined => (slot === 'back' ? null : finishes[slot]);
  return (
    <group>
      {geo?.slots.map(({ slot, geometry }) => {
        const finish = slotFinish(slot);
        const fallback = slot === 'fronts' ? colour : BOARD_DEFAULT[slot].colour;
        return (
          <mesh key={slot} {...common} geometry={geometry}>
            <FinishMaterial finish={finish ?? null} fallback={fallback} w={1} h={1} wireframe={wireframe} role={finish ? `slot:${slot}` : null} rough={BOARD_DEFAULT[slot].rough} />
          </mesh>
        );
      })}
      {geo?.fittings.map(({ group, geometry }) => (
        <mesh key={group} {...common} geometry={geometry}>
          <meshStandardMaterial
            color={group === 'metal' ? finishes.handles?.hex ?? FITTING_LOOK.metal.colour : FITTING_LOOK[group].colour}
            roughness={FITTING_LOOK[group].rough}
            metalness={FITTING_LOOK[group].metal}
            wireframe={wireframe}
          />
        </mesh>
      ))}
      {extras.map((q, i) => <Part key={`x${i}`} part={q} finish={q.slot ? finishes[q.slot] : null} kind={kind} wireframe={wireframe} common={common} />)}
    </group>
  );
};

/** The detailed body of one object; every part carries the object's id so picking and the ID pass still work. */
export const ObjectShape: React.FC<{
  kind: string; w: number; d: number; h: number; colour: string; wireframe: boolean; common: Common; finishes?: SlotFinishes; layout?: KitchenLayout | null;
}> = ({ kind, w, d, h, colour, wireframe, common, finishes = {}, layout }) => {
  const list = useMemo(() => objectParts(kind, w, d, h, colour), [kind, w, d, h, colour]);
  if (KITCHEN_KINDS.has(kind)) return <KitchenRun kind={kind} w={w} d={d} h={h} colour={colour} wireframe={wireframe} common={common} finishes={finishes} layout={layout} />;
  if (kind === 'plant') {
    return (
      <group>
        <mesh {...common} position={[0, h * 0.12, 0]}><cylinderGeometry args={[w * 0.28, w * 0.22, h * 0.24, 20]} /><meshStandardMaterial color={finishes.body?.hex ?? '#d9d3c9'} roughness={0.8} wireframe={wireframe} /></mesh>
        {[[0, 0.55, 0, 0.32], [0.12, 0.7, 0.05, 0.26], [-0.1, 0.78, -0.04, 0.24], [0.02, 0.9, 0.02, 0.2]].map(([x, y, z, r], i) => (
          <mesh key={i} {...common} position={[x * w, y * h, z * w]}><icosahedronGeometry args={[r * Math.max(w, d), 1]} /><meshStandardMaterial color={i % 2 ? '#4f7d3a' : '#3f6b30'} roughness={0.9} flatShading wireframe={wireframe} /></mesh>
        ))}
      </group>
    );
  }
  if (kind === 'pendant') {
    return (
      <group>
        <mesh {...common} position={[0, h * 0.75, 0]}><cylinderGeometry args={[0.005, 0.005, h * 0.5, 6]} /><meshStandardMaterial color={DARK} /></mesh>
        <mesh {...common} position={[0, h * 0.35, 0]}><coneGeometry args={[w * 0.5, h * 0.3, 24, 1, true]} /><meshStandardMaterial color={finishes.shade?.hex ?? colour} roughness={0.5} side={DoubleSide} emissive="#ffe9c4" emissiveIntensity={0.15} wireframe={wireframe} /></mesh>
      </group>
    );
  }
  return (
    <group>
      {list.map((q, i) => <Part key={i} part={q} finish={q.slot ? finishes[q.slot] : null} kind={kind} wireframe={wireframe} common={common} />)}
    </group>
  );
};

export const DoorOrWindow: React.FC<{ kind: 'door' | 'window'; width: number; height: number; depth: number; wireframe: boolean }> = ({ kind, width, height, depth, wireframe }) => {
  const frame = 0.06;
  const m = (color: string, rough = 0.5, metal = 0, extra: Record<string, unknown> = {}) => (
    <meshStandardMaterial color={color} roughness={rough} metalness={metal} wireframe={wireframe} {...extra} />
  );
  if (kind === 'door') {
    return (
      <group>
        {[-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * (width / 2 + frame / 2 - 0.01), 0, 0]}><boxGeometry args={[frame, height + frame, depth + 0.03]} />{m(WHITE, 0.4)}</mesh>
        ))}
        <mesh castShadow position={[0, height / 2 + frame / 2 - 0.01, 0]}><boxGeometry args={[width + frame * 2, frame, depth + 0.03]} />{m(WHITE, 0.4)}</mesh>
        <mesh castShadow receiveShadow position={[0, -0.005, 0]}><boxGeometry args={[width - 0.01, height - 0.01, 0.04]} />{m('#ece6dc', 0.45)}</mesh>
        {[-1, 1].map((sz) => (
          <mesh key={`h${sz}`} position={[width / 2 - 0.08, -0.05, sz * 0.035]}><boxGeometry args={[0.12, 0.018, 0.018]} />{m(STEEL, 0.25, 0.9)}</mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (width / 2 - frame / 2), 0, 0]}><boxGeometry args={[frame, height, depth * 0.5]} />{m(WHITE, 0.35)}</mesh>
      ))}
      {[-1, 1].map((sy) => (
        <mesh key={`r${sy}`} position={[0, sy * (height / 2 - frame / 2), 0]}><boxGeometry args={[width, frame, depth * 0.5]} />{m(WHITE, 0.35)}</mesh>
      ))}
      <mesh position={[0, 0, 0]}><boxGeometry args={[0.04, height - frame, depth * 0.45]} />{m(WHITE, 0.35)}</mesh>
      <mesh><boxGeometry args={[width - frame, height - frame, 0.008]} />{m('#d6ebf5', 0.03, 0.1, { transparent: true, opacity: 0.22 })}</mesh>
      <mesh receiveShadow position={[0, -height / 2 - 0.015, 0.03]}><boxGeometry args={[width + 0.08, 0.03, depth + 0.08]} />{m(STONE, 0.35)}</mesh>
    </group>
  );
};
