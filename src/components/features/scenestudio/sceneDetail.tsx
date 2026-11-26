/** What makes the 3D room read as a real interior: light, default surfaces, and real shapes for every object kind. */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BackSide, Box3, Color, CubeCamera, DoubleSide, HalfFloatType, NoToneMapping, PMREMGenerator, SRGBColorSpace, TextureLoader, Vector2, Vector3,
  WebGLCubeRenderTarget, WebGLRenderTarget, type Group, type Mesh, type Object3D, type Texture,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DARK, STEEL, STONE, WHITE, objectParts } from '@/lib/scene/objectParts';
import type { SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import type { Finish } from '@/lib/scene/sceneSurfaces';
import { useLook } from '@/components/features/scenestudio/surfaceMaps';
import { litRoomAt, type LitRoom } from '@/lib/scene/roomLight';
import { sunAt } from '@/lib/scene/sun';
import { KITCHEN_KINDS, type KitchenLayout } from '@/lib/scene/kitchenComposition';
import type { BoardSlot } from '@/lib/scene/cabinetPanels';
import { CabinetViewContext, buildKitchenGeometry, type FittingGroup } from '@/components/features/scenestudio/cabinetMesh';
import { Curtain, Hob, HoodVisor, Lamp, OvenFace, Pendant, Picture, SinkBowl, worktopGeometry, type Common } from '@/components/features/scenestudio/fixtures';
import { bowlFor, slabAround } from '@/lib/scene/fixturePlan';
import { partGeometry } from '@/lib/scene/partGeometry';

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

const PROBE_AGES_S = [0.5, 3, 8];

/** Shows only the window light of one room (all of them for null); area lights cast no shadows and would shine through the walls. */
function showWindowsOf(scene: Object3D, room: string | null) {
  scene.traverse((o) => { if ('windowRoom' in o.userData) o.visible = room === null || o.userData.windowRoom === room; });
}

/** Lights the room the camera stands in with what that room itself looks like, so the floor warms the walls and the window side stays brighter. */
function useRoomLight(rooms: LitRoom[], version: unknown, solid: () => boolean, lit?: React.MutableRefObject<boolean>, loaded = false) {
  const { gl, scene, camera } = useThree();
  const base = useRef<Texture | null>(null);
  const own = useRef(new Set<Texture>());
  const probes = useRef(new Map<string, WebGLRenderTarget>());
  const state = useRef<{ room: string | null; since: number | null; shot: number; version: unknown }>({ room: null, since: null, shot: 0, version });
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  // The same size as the interior map's: any other makes every material rebuild on entering a room.
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
        else if (o.userData?.contactShadow || o.userData?.helper) set(o, false);
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

  useEffect(() => {
    if (!loaded || !base.current) return;
    let live = true;
    const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType });
    const was: Array<[Object3D, boolean]> = [];
    const show = (o: Object3D, on: boolean) => { if (o.visible !== on) { was.push([o, o.visible]); o.visible = on; } };
    const before = gl.getRenderTarget();
    const counts = new Set<number>();
    const textures = new Set<Texture>();
    try {
      gl.setRenderTarget(target);
      for (const room of [null, ...rooms]) {
        let lights = 0;
        scene.traverse((o) => { if ('windowRoom' in o.userData && (room === null || o.userData.windowRoom === room.id)) lights += 1; });
        if (counts.has(lights)) continue;
        counts.add(lights);
        scene.traverse((o) => {
          if (o.userData?.outdoors || o.userData?.surface === 'ceiling') show(o, true);
          if ('windowRoom' in o.userData) show(o, room === null || o.userData.windowRoom === room.id);
        });
        gl.compile(scene, camera);
      }
    } finally {
      gl.setRenderTarget(before);
      for (const [o, on] of was.reverse()) o.visible = on;
    }
    scene.traverse((o) => {
      const mats = (o as Mesh).isMesh ? (o as Mesh).material : null;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(m)) if (v && (v as Texture).isTexture && (v as Texture).image) textures.add(v as Texture);
      }
    });
    const queue = [...textures];
    const next = () => {
      const t = queue.shift();
      if (!live || !t) { target.dispose(); return; }
      gl.initTexture(t);
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
    return () => { live = false; };
  }, [loaded, gl, scene, camera, rooms]);

  useFrame(({ camera, clock }) => {
    if (lit) lit.current = true;
    if (scene.environment && !own.current.has(scene.environment)) return;
    const s = state.current;
    const changed = s.version !== version;
    if (changed) { s.version = version; s.since = null; s.shot = 0; }
    const { x, y, z } = camera.position;
    const room = litRoomAt(rooms, s.room, x, y, z);
    const id = room?.id ?? null;
    if (id !== s.room || changed) { s.room = id; showWindowsOf(scene, id); }
    if (room && solid()) {
      s.since ??= clock.elapsedTime;
      const due = s.shot < PROBE_AGES_S.length && clock.elapsedTime - s.since >= PROBE_AGES_S[s.shot];
      if (due) { s.shot += 1; rooms.forEach(capture); } else if (!probes.current.has(room.id)) capture(room);
      if (lit) lit.current = s.shot >= PROBE_AGES_S.length;
    }
    const probe = room ? probes.current.get(room.id) : null;
    scene.environment = probe?.texture ?? base.current;
    scene.environmentIntensity = probe ? ROOM_LIGHT : BASE_LIGHT;
  });
}

const BASE_LIGHT = 0.75;
const ROOM_LIGHT = 0.95;

export const RoomLighting: React.FC<{ span: number; sunHour?: number | null; rooms: LitRoom[]; version: unknown; solid(): boolean; lit?: React.MutableRefObject<boolean>; loaded?: boolean }> = ({ span, sunHour, rooms, version, solid, lit, loaded }) => {
  useRoomLight(rooms, version, solid, lit, loaded);
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

/** One material slot drawn in its finish at real size: the product's own look, or the library material it calls for. */
export const FinishMaterial: React.FC<{
  attach?: string; finish: Finish | null; fallback: string; w: number; h: number; offX?: number; offY?: number;
  wireframe: boolean; highlight?: boolean; side?: typeof DoubleSide; role?: string | null; rough?: number; metal?: number;
}> = ({ attach, finish, fallback, w, h, offX = 0, offY = 0, wireframe, highlight, side, role = 'surface:wall', rough, metal = 0 }) => {
  const look = useLook(finish, { role, fallback, rough }, w, h, offX, offY);
  const colour = useMemo(() => (look ? new Color().setRGB(...look.colour) : new Color(finish?.hex ?? fallback)), [look, finish?.hex, fallback]);
  const relief = useMemo(() => new Vector2(look?.normalScale ?? 1, look?.normalScale ?? 1), [look?.normalScale]);
  return (
    <meshPhysicalMaterial
      specularIntensity={role === 'surface:floor' ? FLOOR_SHEEN : 1}
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

/** A room's light map has no depth, so a floor seen at a low angle mirrors a wall that is not there. */
const FLOOR_SHEEN = 0.3;

export type SlotFinishes = Partial<Record<SceneObjectSlot, Finish | null>>;

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
  const top = useMemo(() => {
    const slab = objectParts(kind, w, d, h, colour).find((q) => q.slot === 'worktop');
    if (!slab) return null;
    const spot = geo?.spots.find((q) => q.type === 'sink_base') ?? (kind === 'sink' ? { x: 0, w } : null);
    const bowl = spot ? { x: spot.x, z: 0.03, ...bowlFor(spot.w, d) } : null;
    const pieces = slabAround([slab.pos[0], slab.pos[1], slab.pos[2] - seating / 2], [slab.size[0], slab.size[1], slab.size[2] + seating], bowl);
    return { bowl, color: slab.color, rough: slab.rough ?? 0.3, pieces, geometry: worktopGeometry(pieces) };
  }, [kind, w, d, h, colour, seating, geo]);
  useEffect(() => () => top?.geometry.forEach((g) => g.dispose()), [top]);
  const spotsOf = (type: string, on: boolean) => (on && !wireframe ? geo?.spots.filter((q) => q.type === type) ?? [] : []);
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
      {top?.pieces.map((q, i) => (
        <mesh key={`t${i}`} {...common} geometry={top.geometry[i]} position={q.pos}>
          <FinishMaterial finish={finishes.worktop ?? null} fallback={top.color} w={1} h={1} wireframe={wireframe} role="slot:worktop" rough={top.rough} />
        </mesh>
      ))}
      {!wireframe && top?.bowl && <SinkBowl x={top.bowl.x} z={top.bowl.z} top={h} w={top.bowl.w} d={top.bowl.d} common={common} />}
      {!wireframe && geo?.openings.filter((q) => q.type.startsWith('oven')).map((q, i) => <OvenFace key={`o${i}`} pos={q.pos} size={q.size} common={common} />)}
      {spotsOf('oven_base', kind !== 'kitchen_wall').map((q, i) => <Hob key={`h${i}`} x={q.x} z={0.01} top={h} w={Math.min(0.58, q.w - 0.02)} d={Math.min(0.5, d - 0.1)} common={common} />)}
      {spotsOf('extractor', kind === 'kitchen_wall').map((q, i) => <HoodVisor key={`v${i}`} x={q.x} w={q.w} d={d - 0.02} common={common} />)}
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
  if (kind === 'pendant') return <Pendant w={w} h={h} hex={finishes.shade?.hex ?? colour} wireframe={wireframe} common={common} />;
  if (kind === 'lamp') return <Lamp w={w} h={h} baseHex={finishes.base?.hex} shadeHex={finishes.shade?.hex} wireframe={wireframe} common={common} />;
  if (kind === 'curtain') {
    const fabric = <FinishMaterial finish={finishes.fabric ?? null} fallback={colour} w={1} h={1} wireframe={wireframe} role="kind:curtain" rough={0.95} side={DoubleSide} />;
    return <Curtain w={w} d={d} h={h} wireframe={wireframe} common={common} fabric={fabric} />;
  }
  if (kind === 'artwork' || kind === 'mirror') return <Picture w={w} h={h} colour={colour} mirror={kind === 'mirror'} wireframe={wireframe} common={common} />;
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
        {[-1, 1].flatMap((sz) => [[0.24, 0.62], [-0.27, 0.36]].flatMap(([cy, k]) => {
          const pw = width - 0.28; const ph = (height - 0.2) * k - 0.12;
          const at = cy * (height - 0.1);
          return [[0, ph / 2, pw, 0.016], [0, -ph / 2, pw, 0.016], [-pw / 2, 0, 0.016, ph], [pw / 2, 0, 0.016, ph]].map(([dx, dy, bw, bh], i) => (
            <mesh key={`p${sz}${cy}${i}`} receiveShadow position={[dx, at + dy - 0.005, sz * 0.022]}><boxGeometry args={[bw, bh, 0.008]} />{m('#ece6dc', 0.45)}</mesh>
          ));
        }))}
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
