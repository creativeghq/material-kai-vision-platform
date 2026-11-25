/** The editable Scene Studio room (#564): walls cut around openings, floors, and every object as a true-size stand-in. */
import React, { forwardRef, useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, OrbitControls } from '@react-three/drei';
import {
  ACESFilmicToneMapping, Box3, CanvasTexture, Color, DoubleSide, Material, Matrix4, Mesh, MeshBasicMaterial, Plane, Quaternion, Shape, Vector3,
  type Object3D, type PerspectiveCamera, type RectAreaLight, type Group,
} from 'three';
import { PackedSplats, SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Ceiling, DoorOrWindow, FinishMaterial, ObjectShape, RoomLighting, type LitRoom, type SlotFinishes } from '@/components/features/scenestudio/sceneDetail';
import { finishTone } from '@/components/features/scenestudio/surfaceMaps';
import { groupSplats, tintSplats, type SplatGroup } from '@/lib/scene/splatTint';
import { MODEL_FRONT_TURN_DEG, MAX_MODEL_SPLATS, crowded, fitModel, isMeshModel, thinSplats } from '@/lib/scene/splatFit';
import { slotsForKind } from '@/lib/scene/sceneReadSchema';
import { PhotoMode } from '@/components/features/scenestudio/PhotoMode';
import { AssetContext } from '@/components/features/scenestudio/assetContext';
import { MeshModel } from '@/components/features/scenestudio/meshModel';
import { drawSplatsOver, isSplat, splatShown, splatsSettled } from '@/components/features/scenestudio/splatOverlay';
import { CabinetViewContext } from '@/components/features/scenestudio/cabinetMesh';
import type { Pose } from '@/lib/scene/walkthroughTimeline';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {
  indexSurfaces, objectSlotFinishes, resolveFinish, splashFinish, surfaceKey, wallFaceFinish, zonesOn, type Finish, type SurfaceTarget,
} from '@/lib/scene/sceneSurfaces';
import {
  effectiveSize, idColour, openingPlacement, planBounds, planFrame, pointInPolygon, polygonCentroid, rgbToHex,
  rotationToPlan, rotationToScene, toPlan, toScene, walkStep, wallPieces,
  type PlanFrame, type PlanOpening, type PlanRoom, type PlanWall,
} from '@/lib/scene/sceneGeometry';
import { renderDepthViews, type DepthView } from '@/components/features/scenestudio/worldCapture';
import type { WorldPose } from '@/lib/scene/worldViews';
import type { SceneCamera, SceneObject, SceneObjectFinish, SceneProduct, SceneSurface } from '@/services/sceneStudioService';

export type SceneTool = 'view' | 'move' | 'turn' | 'remove' | 'paint';

export type PaintScope = 'wall' | 'walls' | 'splash' | 'area';

export interface CameraPose { position: [number, number, number]; target: [number, number, number]; fov: number }

export interface SceneCapture {
  colour: Blob;
  idPass: Blob;
  idMap: Record<string, string>;
  camera: CameraPose;
  width: number;
  height: number;
}

export interface SceneCanvasHandle {
  capture(): Promise<SceneCapture>;
  /** ID pass only, from the given pose, with the current layout. For object edits on an existing render. */
  captureIdPassAt(pose: CameraPose): Promise<{ idPass: Blob; idMap: Record<string, string> }>;
  /** Depth of the scene as it stands from each pose, for a photoreal version of a room. */
  captureDepth(poses: WorldPose[]): DepthView[];
  /** False while splats are still catching up with the camera or the layout. */
  settled(): boolean;
  /** False while the room the camera stands in is still taking its own light. */
  lit(): boolean;
  setPose(pose: CameraPose): void;
  topView(): void;
  resetView(): void;
  focusRoom(roomId: string, eyeLevel: boolean): void;
}

interface Props {
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  surfaces: SceneSurface[];
  finishes?: SceneObjectFinish[];
  objects: SceneObject[];
  products: Record<string, SceneProduct>;
  defaultWallHeightMm: number;
  viewCamera: SceneCamera | null;
  tool: SceneTool;
  wireframe: boolean;
  selectedId: string | null;
  onSelect(id: string | null): void;
  /** `commit` is false while dragging and true on release, so a drag is ONE undo step. */
  onMoveObject(id: string, patch: Partial<Pick<SceneObject, 'x_mm' | 'y_mm' | 'rotation_deg' | 'room_id'>>, commit: boolean): void;
  onRemoveObject(id: string): void;
  onPaint(target: SurfaceTarget): void;
  paintScope?: PaintScope;
  splashBand?: { fromMm: number; toMm: number };
  photo?: boolean;
  onPhotoProgress?(samples: number, settled: boolean, preparing: boolean): void;
  onFocusRoom?(roomId: string): void;
  walkRoomId?: string | null;
  onWalkEnd?(): void;
  /** A generated model per object: a .glb is drawn as a mesh, anything else as splats. */
  modelUrls?: Record<string, string>;
  staleModels?: Set<string>;
  /** Kitchen fronts: 0 closed … 1 open. */
  frontsOpen?: number;
  cabinetHardware?: string | null;
  /** Time of day for the sun, 6–20; null keeps the studio light. */
  sunHour?: number | null;
  /** Read-only playback (the client walkthrough): camera, wall height and unit rise are read from this ref every frame. */
  script?: React.MutableRefObject<ScriptFrame | null>;
  /** Photoreal versions of rooms, in scene coordinates: shown while the camera stands in that room. */
  worlds?: RoomWorld[];
  /** How many furniture models and photoreal rooms are still loading; a failed one counts as done. */
  onAssets?(pending: number): void;
}

export interface RoomWorld { roomId: string; url: string }

export interface ScriptFrame { pose: Pose; walls: number; objects: number }

const ScriptDriver: React.FC<{ script: React.MutableRefObject<ScriptFrame | null>; walls: React.RefObject<Group>; objects: React.RefObject<Group> }> = ({ script, walls, objects }) => {
  useFrame(({ camera }) => {
    const f = script.current;
    if (!f) return;
    camera.position.set(...f.pose.position);
    camera.lookAt(...f.pose.target);
    const cam = camera as PerspectiveCamera;
    if (Math.abs(cam.fov - f.pose.fov) > 0.01) { cam.fov = f.pose.fov; cam.updateProjectionMatrix(); }
    if (walls.current) walls.current.scale.y = Math.max(0.001, f.walls);
    if (objects.current) { objects.current.scale.y = Math.max(0.001, f.objects); objects.current.visible = f.objects > 0.01; }
  });
  return null;
};

/** Swaps the drawn room for its photoreal version while the camera is inside it, and back outside. */
const PhotorealRooms: React.FC<{
  worlds: RoomWorld[]; rooms: PlanRoom[]; frame: PlanFrame; heightM: number; drawn: React.RefObject<Group>;
}> = ({ worlds, rooms, frame, heightM, drawn }) => {
  const [loaded, setLoaded] = useState<Record<string, SplatMesh>>({});
  const key = worlds.map((w) => w.url).join('|');
  const track = useContext(AssetContext);
  useEffect(() => {
    let gone = false;
    worlds.forEach((w) => track(w.url, true));
    const made: SplatMesh[] = [];
    void (async () => {
      for (const w of worlds) {
        const mesh = new SplatMesh({ url: w.url });
        mesh.userData.splat = true;
        mesh.visible = false;
        made.push(mesh);
        const ok = await mesh.initialized.then(() => true, () => false);
        if (gone) return;
        track(w.url, false);
        if (!ok) continue;
        setLoaded((m) => ({ ...m, [w.roomId]: mesh }));
      }
    })();
    return () => { gone = true; worlds.forEach((w) => track(w.url, false)); setLoaded({}); made.forEach((m) => m.dispose()); if (drawn.current) drawn.current.visible = true; };
  }, [key]);
  useFrame(({ camera, scene }) => {
    const [x, y] = toPlan(camera.position.x, camera.position.z, frame);
    const room = camera.position.y < heightM ? rooms.find((r) => loaded[r.id] && pointInPolygon(x, y, r.outline)) : undefined;
    for (const [id, mesh] of Object.entries(loaded)) mesh.visible = id === room?.id;
    if (drawn.current) drawn.current.visible = !room || !splatShown(scene, loaded[room.id]);
  });
  return <group>{Object.entries(loaded).map(([id, mesh]) => <primitive key={id} object={mesh} />)}</group>;
};

const SPLAT_TURN = new Quaternion(1, 0, 0, 0);

const splatBandsOf = (kind: string) => {
  const slots = slotsForKind(kind);
  return { low: slots.includes('legs') || slots.includes('plinth'), top: slots.includes('worktop') };
};

const splatTintOf = (kind: string, f: SlotFinishes): Partial<Record<SplatGroup, Finish | null>> => {
  const slots = slotsForKind(kind);
  return { main: f[slots[0]] ?? null, low: f.legs ?? f.plinth ?? null, top: f.worktop ?? null };
};

/** A generated 3D model standing in for an object, fitted inside its true-size box with its front to +Z. */
const SplatModel: React.FC<{
  url: string; w: number; d: number; h: number;
  tint?: Partial<Record<SplatGroup, Finish | null>>; bands?: { low: boolean; top: boolean };
}> = ({ url, w, d, h, tint, bands }) => {
  const [fit, setFit] = useState<{ mesh: SplatMesh; scale: number; offset: [number, number, number] } | null>(null);
  const source = useRef<{ y: Float32Array; rgb: Float32Array; opacity: Float32Array; groups?: Uint8Array; tinted: boolean } | null>(null);
  const track = useContext(AssetContext);
  const trackKey = useId();
  useEffect(() => {
    let live = true;
    track(trackKey, true);
    const full = new SplatMesh({ url });
    let mesh: SplatMesh | null = null;
    full.initialized.then(() => {
      if (!live) return;
      const xs: number[] = []; const ys: number[] = []; const zs: number[] = [];
      const opacities = new Float32Array(full.packedSplats.numSplats);
      const centres = new Float32Array(full.packedSplats.numSplats * 3);
      const v = new Vector3();
      full.packedSplats.forEachSplat((i, center, _s, _q, opacity) => {
        opacities[i] = opacity;
        centres[i * 3] = center.x; centres[i * 3 + 1] = center.y; centres[i * 3 + 2] = center.z;
        if (opacity < 0.2) return;
        v.copy(center).applyQuaternion(SPLAT_TURN);
        xs.push(v.x); ys.push(v.y); zs.push(v.z);
      });
      if (xs.length < 100) return;
      const q = (arr: number[], p: number) => { const sorted = Float32Array.from(arr).sort(); return sorted[Math.floor(p * (sorted.length - 1))]; };
      const box = new Box3(new Vector3(q(xs, 0.02), q(ys, 0.01), q(zs, 0.02)), new Vector3(q(xs, 0.98), q(ys, 0.99), q(zs, 0.98)));
      const size = box.getSize(new Vector3());
      const k = fitModel(size, w, d, h);
      const front = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (MODEL_FRONT_TURN_DEG * Math.PI) / 180);
      const place = front.clone().multiply(SPLAT_TURN);
      const c = box.getCenter(new Vector3()).applyQuaternion(front);
      const shift = new Vector3(-c.x * k[0], -box.min.y * k[1], -c.z * k[2]);
      const stretch = new Vector3(k[0], k[1], k[2]);
      const rot = new Quaternion(); const basis = new Matrix4(); const sc = new Vector3();
      const ax = [new Vector3(), new Vector3(), new Vector3()];
      const { keep, grow } = thinSplats(opacities, MAX_MODEL_SPLATS, crowded(centres, opacities));
      const kept = new Uint8Array(opacities.length);
      for (const i of keep) kept[i] = 1;
      const packed = new PackedSplats({ maxSplats: keep.length });
      const all = { y: new Float32Array(keep.length), rgb: new Float32Array(keep.length * 3), opacity: new Float32Array(keep.length), tinted: false };
      let n = 0;
      full.packedSplats.forEachSplat((i, center, scales, quat, opacity, color) => {
        if (!kept[i]) return;
        center.applyQuaternion(place).multiply(stretch).add(shift);
        rot.copy(place).multiply(quat);
        basis.makeRotationFromQuaternion(rot).extractBasis(ax[0], ax[1], ax[2]);
        ax[0].multiply(stretch).multiplyScalar(scales.x); ax[1].multiply(stretch).multiplyScalar(scales.y); ax[2].multiply(stretch).multiplyScalar(scales.z);
        sc.set(ax[0].length(), ax[1].length(), ax[2].length()).multiplyScalar(grow);
        ax[0].normalize(); ax[1].addScaledVector(ax[0], -ax[1].dot(ax[0])).normalize(); ax[2].crossVectors(ax[0], ax[1]);
        rot.setFromRotationMatrix(basis.makeBasis(ax[0], ax[1], ax[2]));
        packed.pushSplat(center, sc, rot, opacity, color);
        all.y[n] = center.y; all.opacity[n] = opacity;
        all.rgb[n * 3] = color.r; all.rgb[n * 3 + 1] = color.g; all.rgb[n * 3 + 2] = color.b;
        n += 1;
      });
      packed.needsUpdate = true;
      mesh = new SplatMesh({ packedSplats: packed });
      mesh.userData.splat = true;
      source.current = all;
      setFit({ mesh, scale: 1, offset: [0, 0, 0] });
      full.dispose();
    }).catch(() => undefined).finally(() => { if (live) track(trackKey, false); });
    return () => { live = false; track(trackKey, false); full.dispose(); mesh?.dispose(); };
  }, [url, w, d, h]);
  const tintKey = JSON.stringify([tint, bands]);
  const wish = useRef({ tint, bands });
  wish.current = { tint, bands };
  useEffect(() => {
    const { tint, bands } = wish.current;
    const src = source.current;
    if (!fit || !src) return;
    let live = true;
    const wanted = Object.entries(tint ?? {}).filter(([, f]) => !!f) as Array<[SplatGroup, Finish]>;
    if (!wanted.length && !src.tinted) return;
    const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    void Promise.all(wanted.map(async ([g, f]) => [g, (await finishTone(f)).map(linear) as [number, number, number]] as const)).then((pairs) => {
      if (!live) return;
      src.groups ??= groupSplats(src.y, src.rgb, src.opacity, bands ?? { low: false, top: false });
      const colours = pairs.length ? tintSplats(src.rgb, src.groups, Object.fromEntries(pairs)) : src.rgb;
      const tmp = new Color();
      fit.mesh.packedSplats.forEachSplat((i, center, scales, quat, opacity) => {
        tmp.setRGB(colours[i * 3], colours[i * 3 + 1], colours[i * 3 + 2]);
        fit.mesh.packedSplats.setSplat(i, center, scales, quat, opacity, tmp);
      });
      fit.mesh.packedSplats.needsUpdate = true;
      fit.mesh.needsUpdate = true;
      src.tinted = pairs.length > 0;
    }).catch(() => undefined);
    return () => { live = false; };
  }, [fit, tintKey]);
  if (!fit) return null;
  return <group position={fit.offset} scale={fit.scale}><primitive object={fit.mesh} /></group>;
};

const SparkLayer: React.FC = () => {
  const { gl, scene } = useThree();
  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl });
    spark.userData.splat = true;
    scene.add(spark);
    return () => { scene.remove(spark); };
  }, [gl, scene]);
  return null;
};

/** Splats in the post-processing buffer come out washed to white, so it runs without them and they are laid over its picture. */
const SplatsAfterComposer: React.FC<{ script?: React.MutableRefObject<ScriptFrame | null> }> = ({ script }) => {
  const { gl, scene, camera } = useThree();
  const held = useRef<Object3D[]>([]);
  const depthOnly = useMemo(() => new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }), []);
  const release = () => { held.current.forEach((o) => { o.visible = true; }); held.current = []; };
  useEffect(() => () => { release(); depthOnly.dispose(); }, [depthOnly]);
  useFrame(() => {
    scene.traverse((o) => { if (isSplat(o) && o.visible) { o.visible = false; held.current.push(o); } });
  }, 0.5);
  useFrame(() => {
    release();
    drawSplatsOver(gl, scene, camera, depthOnly, (script?.current?.objects ?? 1) < 0.6);
  }, 2);
  return null;
};

const LEGGED_KINDS = new Set(['chair', 'armchair', 'stool', 'dining_table', 'coffee_table', 'desk', 'side_table', 'plant']);

let groundShadow: CanvasTexture | null = null;
const groundShadowTexture = () => {
  if (groundShadow) return groundShadow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = '#000';
  ctx.fillRect(20, 20, 88, 88);
  groundShadow = new CanvasTexture(c);
  return groundShadow;
};

/** A splat casts no shadow, so an unseen shape casts the sun's and a soft patch on the floor grounds the piece. */
const SplatShadow: React.FC<{ kind: string; w: number; d: number; h: number; onFloor: boolean }> = ({ kind, w, d, h, onFloor }) => {
  const legged = LEGGED_KINDS.has(kind);
  const top = legged ? h * 0.18 : h;
  return (
    <group userData={{ splat: true }}>
      <mesh castShadow userData={{ splat: true }} raycast={() => null} position={[0, h - top / 2, 0]}>
        <boxGeometry args={[w * 0.96, top, d * 0.96]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      {onFloor && (
        <mesh userData={{ splat: true }} raycast={() => null} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
          <planeGeometry args={[w * 1.75, d * 1.75]} />
          <meshBasicMaterial map={groundShadowTexture()} transparent opacity={legged ? 0.5 : 0.8} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
};

const MAX_CAPTURE_SIDE = 1536;
const WALL_DEFAULT = '#efebe4';
const FLOOR_DEFAULT = '#a98f6f';
const SELECT_COLOUR = '#ff7a3d';

const KIND_COLOURS: Record<string, string> = {
  sofa: '#8d6e63', armchair: '#a1887f', chair: '#6d4c41', stool: '#6d4c41', dining_table: '#795548', coffee_table: '#795548',
  side_table: '#795548', desk: '#8d6e63', bed: '#d7ccc8', nightstand: '#8d6e63', wardrobe: '#bcaaa4', cabinet: '#bcaaa4',
  shelving: '#a1887f', tv_unit: '#5d4037', tv: '#212121', rug: '#c5a46e', lamp: '#f5f5f5', pendant: '#f5f5f5', plant: '#4c7a3d',
  artwork: '#b0a8a0', mirror: '#cfd8dc', curtain: '#e8e0d4', kitchen_base: '#eceff1', kitchen_wall: '#eceff1',
  kitchen_tall: '#eceff1', island: '#eceff1', appliance: '#9e9e9e', sink: '#e0e0e0', toilet: '#fafafa', bathtub: '#fafafa',
  shower: '#cfd8dc', vanity: '#d7ccc8', stairs: '#a1887f', fireplace: '#8d8d8d', radiator: '#f5f5f5', other: '#9e9aa6',
};

const FloorMesh: React.FC<{
  room: PlanRoom; frame: PlanFrame; surface?: SceneSurface; product?: SceneProduct; wireframe: boolean; ceilingHeight: number;
  ceiling: Finish | null; highlightFloor: boolean; highlightCeiling: boolean;
  onPick(e: ThreeEvent<MouseEvent>): void;
  onPickCeiling(e: ThreeEvent<MouseEvent>): void;
  onHover(surface: 'floor' | 'ceiling' | null): void;
  onDouble?(e: ThreeEvent<MouseEvent>): void;
  onAreaDown?(e: ThreeEvent<PointerEvent>): void;
  onAreaMove?(e: ThreeEvent<PointerEvent>): void;
}> = ({ room, frame, surface, product, wireframe, ceilingHeight, ceiling, highlightFloor, highlightCeiling, onPick, onPickCeiling, onHover, onDouble, onAreaDown, onAreaMove }) => {
  const shape = useMemo(() => {
    const s = new Shape();
    room.outline.forEach(([x, y], i) => {
      const [sx, sz] = toScene(x, y, frame);
      if (i === 0) s.moveTo(sx, -sz); else s.lineTo(sx, -sz);
    });
    s.closePath();
    return s;
  }, [room.outline, frame]);
  const ceilingShape = useMemo(() => {
    const s = new Shape();
    room.outline.forEach(([x, y], i) => {
      const [sx, sz] = toScene(x, y, frame);
      if (i === 0) s.moveTo(sx, sz); else s.lineTo(sx, sz);
    });
    s.closePath();
    return s;
  }, [room.outline, frame]);
  const finish = useMemo(() => resolveFinish(surface ?? null, product), [surface, product]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        receiveShadow
        userData={{ surface: 'floor', roomId: room.id }}
        onClick={onPick}
        onDoubleClick={onDouble}
        onPointerDown={onAreaDown}
        onPointerMove={onAreaMove}
        onPointerOver={() => onHover('floor')}
        onPointerOut={() => onHover(null)}
      >
        <shapeGeometry args={[shape]} />
        <FinishMaterial role="surface:floor" finish={finish} fallback={FLOOR_DEFAULT} w={1} h={1} wireframe={wireframe} highlight={highlightFloor} rough={0.5} />
      </mesh>
      <Ceiling height={ceilingHeight} onClick={onPickCeiling} onHover={(on) => onHover(on ? 'ceiling' : null)}>
        <shapeGeometry args={[ceilingShape]} />
        <FinishMaterial role="surface:ceiling" finish={ceiling} fallback="#f4f2ee" w={1} h={1} wireframe={wireframe} highlight={highlightCeiling} side={DoubleSide} />
      </Ceiling>
    </group>
  );
};

interface WallSides { plus: string | null; minus: string | null; exterior: 'plus' | 'minus' | null }

interface WallOverlay {
  key: string; finish: Finish | null; fromM: number; toM: number; aFrom: number; aTo: number; lift: number;
  highlight?: boolean; preview?: boolean; onClick?(e: ThreeEvent<MouseEvent>): void;
}

const WallMesh: React.FC<{
  wall: PlanWall; openings: PlanOpening[]; frame: PlanFrame; heightMm: number; sides: WallSides;
  finishOf(roomId: string | null): Finish | null; overlaysOf(roomId: string | null): WallOverlay[];
  highlightOf(roomId: string | null): boolean;
  wireframe: boolean; cutaway: boolean; centre: Vector3;
  onPick(e: ThreeEvent<MouseEvent>, roomId: string | null): void;
  onHover(roomId: string | null): void;
  onAreaDown?(e: ThreeEvent<PointerEvent>, roomId: string | null): void;
  onAreaMove?(e: ThreeEvent<PointerEvent>, roomId: string | null): void;
}> = ({ wall, openings, frame, heightMm, sides, finishOf, overlaysOf, highlightOf, wireframe, cutaway, centre, onPick, onHover, onAreaDown, onAreaMove }) => {
  const pieces = useMemo(() => wallPieces(wall, openings, frame, heightMm), [wall, openings, frame, heightMm]);
  const [low, setLow] = useState(false);
  const outward = useMemo(() => {
    const len = Math.hypot(wall.x2_mm - wall.x1_mm, wall.y2_mm - wall.y1_mm) || 1;
    const nx = -(wall.y2_mm - wall.y1_mm) / len;
    const ny = (wall.x2_mm - wall.x1_mm) / len;
    const sign = sides.exterior === 'plus' ? 1 : sides.exterior === 'minus' ? -1 : 0;
    return new Vector3(nx * sign, 0, ny * sign);
  }, [wall, sides.exterior]);
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!cutaway || sides.exterior === null) { if (low) setLow(false); return; }
    tmp.copy(camera.position).sub(centre).setY(0).normalize();
    const shouldBeLow = tmp.dot(outward) > 0.35 && camera.position.y > 1.9;
    if (shouldBeLow !== low) setLow(shouldBeLow);
  });
  const plusFinish = finishOf(sides.plus);
  const minusFinish = finishOf(sides.minus);
  const plusOverlays = overlaysOf(sides.plus);
  const minusOverlays = overlaysOf(sides.minus);
  const plusLit = highlightOf(sides.plus);
  const minusLit = highlightOf(sides.minus);
  const sideOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const idx = e.face?.materialIndex;
    return idx === 4 ? sides.plus : idx === 5 ? sides.minus : (sides.plus ?? sides.minus);
  };
  const cap = 0.12;
  return (
    <group>
      {pieces.map((p, i) => {
        const h = low ? Math.min(p.height, Math.max(0, cap - (p.center[1] - p.height / 2))) : p.height;
        if (h <= 0.001) return null;
        const y = low ? (p.center[1] - p.height / 2) + h / 2 : p.center[1];
        const onFloor = !low && p.center[1] - p.height / 2 < 0.01;
        return (
          <React.Fragment key={i}>
          {onFloor && (
            <mesh position={[p.center[0], 0.045, p.center[2]]} rotation={[0, p.rotationY, 0]} castShadow receiveShadow>
              <boxGeometry args={[p.length, 0.09, p.thickness + 0.024]} />
              <meshStandardMaterial color="#f7f5f1" roughness={0.4} wireframe={wireframe} />
            </mesh>
          )}
          <mesh
            position={[p.center[0], y, p.center[2]]}
            rotation={[0, p.rotationY, 0]}
            castShadow
            receiveShadow
            userData={{ surface: 'walls', wallId: wall.id }}
            onClick={(e) => onPick(e, sideOf(e))}
            onPointerDown={(e) => onAreaDown?.(e, sideOf(e))}
            onPointerMove={(e) => { onHover(sideOf(e)); onAreaMove?.(e, sideOf(e)); }}
            onPointerOut={() => onHover(null)}
          >
            <boxGeometry args={[p.length, h, p.thickness]} />
            <meshStandardMaterial attach="material-0" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-1" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-2" color={low ? '#ffffff' : WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-3" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <FinishMaterial attach="material-4" finish={plusFinish} fallback={WALL_DEFAULT} w={p.length} h={h} offX={p.start} offY={p.bottom} wireframe={wireframe} highlight={plusLit} />
            <FinishMaterial attach="material-5" finish={minusFinish} fallback={WALL_DEFAULT} w={p.length} h={h} offX={p.wallLength - p.start - p.length} offY={p.bottom} wireframe={wireframe} highlight={minusLit} />
          </mesh>
          {!low && ([[plusOverlays, 1, sides.plus], [minusOverlays, -1, sides.minus]] as const).flatMap(([list, dir, roomId]) => list.map((o) => {
            const lo = Math.max(o.fromM, p.bottom);
            const hi = Math.min(o.toM, p.bottom + p.height);
            const a0 = Math.max(o.aFrom, p.start);
            const a1 = Math.min(o.aTo, p.start + p.length);
            if (hi - lo < 0.01 || a1 - a0 < 0.01) return null;
            const lx = (a0 + a1) / 2 - (p.start + p.length / 2);
            const along = dir === 1 ? a0 : p.wallLength - a1;
            return (
              <group key={`${dir}-${o.key}`} position={[p.center[0], 0, p.center[2]]} rotation={[0, p.rotationY, 0]}>
                <mesh
                  position={[lx, (lo + hi) / 2, dir * (p.thickness / 2 + o.lift)]}
                  rotation={[0, dir === 1 ? 0 : Math.PI, 0]}
                  castShadow={!o.preview}
                  receiveShadow
                  userData={o.preview ? { helper: true } : { surface: 'zone', wallId: wall.id }}
                  onClick={(e) => { if (o.onClick) o.onClick(e); else onPick(e, roomId); }}
                  onPointerDown={(e) => onAreaDown?.(e, roomId)}
                  onPointerMove={(e) => { e.stopPropagation(); onHover(roomId); onAreaMove?.(e, roomId); }}
                  onPointerOut={() => onHover(null)}
                >
                  <boxGeometry args={[a1 - a0, hi - lo, 0.006]} />
                  {o.preview
                    ? <meshBasicMaterial attach="material" color="#3d7bff" transparent opacity={0.35} depthWrite={false} />
                    : <FinishMaterial attach="material" finish={o.finish} fallback={WALL_DEFAULT} w={a1 - a0} h={hi - lo} offX={along} offY={lo} wireframe={wireframe} highlight={o.highlight ?? highlightOf(roomId)} />}
                </mesh>
              </group>
            );
          }))}
          </React.Fragment>
        );
      })}
    </group>
  );
};

const OpeningMesh: React.FC<{ wall: PlanWall; opening: PlanOpening; frame: PlanFrame; wireframe: boolean }> = ({ wall, opening, frame, wireframe }) => {
  const p = useMemo(() => openingPlacement(wall, opening, frame), [wall, opening, frame]);
  const thickness = Math.max(wall.thickness_mm, 20) / 1000;
  if (opening.kind === 'opening') return null;
  return (
    <group position={p.center} rotation={[0, p.rotationY, 0]}>
      <DoorOrWindow kind={opening.kind === 'window' ? 'window' : 'door'} width={p.width} height={p.height} depth={thickness} wireframe={wireframe} />
    </group>
  );
};

const ObjectMesh: React.FC<{
  obj: SceneObject; idHex: string; frame: PlanFrame; product?: SceneProduct; selected: boolean; wireframe: boolean;
  tool: SceneTool; floorPlane: Plane; controls: React.MutableRefObject<OrbitControlsImpl | null>;
  onSelect(): void; onMove: Props['onMoveObject']; onRemove(): void; modelUrl?: string; finishes?: SlotFinishes;
}> = ({ obj, idHex, frame, product, selected, wireframe, tool, floorPlane, controls, onSelect, onMove, onRemove, modelUrl, finishes }) => {
  const size = effectiveSize(obj, product);
  const w = size.width_mm / 1000;
  const d = size.depth_mm / 1000;
  const h = size.height_mm / 1000;
  const elev = (obj.elevation_mm ?? 0) / 1000;
  const [x, z] = toScene(obj.x_mm, obj.y_mm, frame);
  const colour = obj.colour_hex ?? KIND_COLOURS[obj.kind] ?? KIND_COLOURS.other;
  const drag = useRef<{ dx: number; dz: number; startAngle: number; startRot: number; last: Partial<SceneObject> } | null>(null);
  const hit = useMemo(() => new Vector3(), []);

  const begin = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'move' && tool !== 'turn') return;
    e.stopPropagation();
    onSelect();
    if (!e.ray.intersectPlane(floorPlane, hit)) return;
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    if (controls.current) controls.current.enabled = false;
    drag.current = {
      dx: hit.x - x, dz: hit.z - z,
      startAngle: Math.atan2(hit.z - z, hit.x - x),
      startRot: rotationToScene(obj.rotation_deg),
      last: {},
    };
  };
  const moveDrag = (e: ThreeEvent<PointerEvent>) => {
    const s = drag.current;
    if (!s || !e.ray.intersectPlane(floorPlane, hit)) return;
    e.stopPropagation();
    if (tool === 'move') {
      const [px, py] = toPlan(hit.x - s.dx, hit.z - s.dz, frame);
      s.last = { x_mm: Math.round(px / 10) * 10, y_mm: Math.round(py / 10) * 10 };
    } else {
      const angle = Math.atan2(hit.z - z, hit.x - x);
      let deg = rotationToPlan(s.startRot - (angle - s.startAngle));
      if (!e.shiftKey) deg = (Math.round(deg / 15) * 15) % 360;
      s.last = { rotation_deg: deg };
    }
    onMove(obj.id, s.last, false);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    const s = drag.current;
    if (!s) return;
    drag.current = null;
    (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
    if (controls.current) controls.current.enabled = true;
    if (Object.keys(s.last).length) onMove(obj.id, s.last, true);
  };

  const body = (() => {
    const edges = selected ? <Edges userData={{ helper: true }} color={SELECT_COLOUR} lineWidth={2} /> : null;
    const common = { castShadow: true, receiveShadow: true, userData: { objectId: obj.id, idHex } };
    const shape = <ObjectShape kind={obj.kind} w={w} d={d} h={h} colour={colour} wireframe={wireframe} common={common} finishes={finishes} layout={obj.kitchen_layout} />;
    return (
      <group>
        <mesh userData={common.userData} position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
          {edges}
        </mesh>
        {modelUrl && !isMeshModel(modelUrl)
          ? <SplatShadow kind={obj.kind} w={w} d={d} h={h} onFloor={elev < 0.05} />
          : modelUrl && !wireframe
            ? <MeshModel url={modelUrl} w={w} d={d} h={h} objectId={obj.id} idHex={idHex}>{shape}</MeshModel>
            : shape}
      </group>
    );
  })();

  return (
    <group
      position={[x, elev, z]}
      rotation={[0, rotationToScene(obj.rotation_deg), 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (tool === 'remove') onRemove(); else onSelect();
      }}
      onPointerDown={begin}
      onPointerMove={moveDrag}
      onPointerUp={end}
    >
      {body}
    </group>
  );
};

/** A generated model stands outside the group the intro scales: Spark rebuilds every splat whenever one is rescaled. */
const ObjectModel: React.FC<{ obj: SceneObject; frame: PlanFrame; product?: SceneProduct; url: string; finishes?: SlotFinishes; stale?: boolean }> = ({ obj, frame, product, url, finishes, stale }) => {
  const size = effectiveSize(obj, product);
  const [x, z] = toScene(obj.x_mm, obj.y_mm, frame);
  return (
    <group position={[x, (obj.elevation_mm ?? 0) / 1000, z]} rotation={[0, rotationToScene(obj.rotation_deg), 0]}>
      <SplatModel
        url={url} w={size.width_mm / 1000} d={size.depth_mm / 1000} h={size.height_mm / 1000}
        tint={stale ? splatTintOf(obj.kind, finishes ?? {}) : undefined}
        bands={splatBandsOf(obj.kind)}
      />
    </group>
  );
};

/** Exposes capture and camera moves to the page. Lives inside the Canvas so it can reach the renderer. */
const Bridge = forwardRef<SceneCanvasHandle, {
  controls: React.MutableRefObject<OrbitControlsImpl | null>; span: number; initial: CameraPose; idHexById: Record<string, string>;
  rooms: PlanRoom[]; frame: PlanFrame; lit: React.MutableRefObject<boolean>;
}>(({ controls, span, initial, idHexById, rooms, frame, lit }, ref) => {
  const { gl, scene, camera, size } = useThree();
  const flight = useRef<{ from: CameraPose; to: CameraPose; t: number } | null>(null);

  const setPose = (pose: CameraPose) => {
    camera.position.set(...pose.position);
    (camera as PerspectiveCamera).fov = pose.fov;
    (camera as PerspectiveCamera).updateProjectionMatrix();
    controls.current?.target.set(...pose.target);
    controls.current?.update();
    camera.lookAt(...pose.target);
  };
  const currentPose = (): CameraPose => {
    const t = controls.current?.target ?? new Vector3();
    return { position: camera.position.toArray() as [number, number, number], target: [t.x, t.y, t.z], fov: (camera as PerspectiveCamera).fov };
  };

  const flyTo = (to: CameraPose) => { flight.current = { from: currentPose(), to, t: 0 }; };
  useFrame((_, delta) => {
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + delta / 0.9);
    const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * k) as [number, number, number];
    setPose({ position: mix(f.from.position, f.to.position), target: mix(f.from.target, f.to.target), fov: f.from.fov + (f.to.fov - f.from.fov) * k });
    if (f.t >= 1) flight.current = null;
  });

  const roomPose = (roomId: string, eyeLevel: boolean): CameraPose | null => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room || room.outline.length < 3) return null;
    const pts = room.outline.map(([x, y]) => toScene(x, y, frame));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    if (eyeLevel) {
      const far = pts.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cz) > Math.hypot(best[0] - cx, best[1] - cz) ? p : best), pts[0]);
      return { position: [cx + (far[0] - cx) * 0.72, 1.6, cz + (far[1] - cz) * 0.72], target: [cx, 1.1, cz], fov: 70 };
    }
    const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const d = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    const s = Math.max(w, d, 2);
    return { position: [cx + s * 0.7, s * 1.15, cz + s * 0.85], target: [cx, 0.3, cz], fov: 45 };
  };

  const snapshot = (smooth: boolean): HTMLCanvasElement => {
    const src = gl.domElement;
    const scale = Math.min(1, MAX_CAPTURE_SIDE / Math.max(src.width, src.height));
    const out = document.createElement('canvas');
    out.width = Math.round(src.width * scale);
    out.height = Math.round(src.height * scale);
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(src, 0, 0, out.width, out.height);
    return out;
  };
  const toBlob = (c: HTMLCanvasElement, type: string) =>
    new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture failed'))), type, 0.92));

  const withHelpersHidden = <T,>(fn: () => T): T => {
    const hidden: Object3D[] = [];
    scene.traverse((o) => { if (o.userData?.helper && o.visible) { hidden.push(o); o.visible = false; } });
    try { return fn(); } finally { hidden.forEach((o) => { o.visible = true; }); }
  };

  const renderIdPass = (): HTMLCanvasElement => {
    const swapped: Array<[Mesh, Material | Material[]]> = [];
    const black = new MeshBasicMaterial({ color: '#000000', toneMapped: false });
    const made: Material[] = [black];
    const prevBackground = scene.background;
    const prevFog = scene.fog;
    const splats: Object3D[] = [];
    scene.traverse((o) => { if (o.userData?.splat && o.visible) { splats.push(o); o.visible = false; } });
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.userData?.splat) return;
      swapped.push([mesh, mesh.material]);
      const hex = mesh.userData?.objectId ? idHexById[mesh.userData.objectId as string] : null;
      if (hex) {
        const m = new MeshBasicMaterial({ color: new Color(hex), toneMapped: false, side: DoubleSide });
        made.push(m);
        mesh.material = m;
      } else {
        mesh.material = black;
      }
    });
    scene.background = new Color('#000000');
    scene.fog = null;
    try {
      gl.render(scene, camera);
      return snapshot(false);
    } finally {
      swapped.forEach(([mesh, mat]) => { mesh.material = mat; });
      splats.forEach((o) => { o.visible = true; });
      made.forEach((m) => m.dispose());
      scene.background = prevBackground;
      scene.fog = prevFog;
      gl.render(scene, camera);
    }
  };

  const idMap = () => Object.fromEntries(Object.entries(idHexById).map(([id, hex]) => [hex, id]));

  useImperativeHandle(ref, () => ({
    async capture() {
      const { colourCanvas, idCanvas } = withHelpersHidden(() => {
        const tone = gl.toneMapping;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.render(scene, camera);
        gl.toneMapping = tone;
        const colourCanvas = snapshot(true);
        const idCanvas = renderIdPass();
        return { colourCanvas, idCanvas };
      });
      return {
        colour: await toBlob(colourCanvas, 'image/jpeg'),
        idPass: await toBlob(idCanvas, 'image/png'),
        idMap: idMap(),
        camera: currentPose(),
        width: colourCanvas.width,
        height: colourCanvas.height,
      };
    },
    async captureIdPassAt(pose) {
      const before = currentPose();
      setPose(pose);
      try {
        const idCanvas = withHelpersHidden(() => renderIdPass());
        return { idPass: await toBlob(idCanvas, 'image/png'), idMap: idMap() };
      } finally {
        setPose(before);
      }
    },
    captureDepth(poses) { return renderDepthViews(gl, scene, poses, span / 2); },
    settled() { return splatsSettled(scene); },
    lit() { return lit.current; },
    setPose(pose) { flight.current = null; setPose(pose); },
    topView() { flyTo({ position: [0, span * 1.35, 0.01], target: [0, 0, 0], fov: 45 }); },
    resetView() { flyTo(initial); },
    focusRoom(roomId, eyeLevel) { const pose = roomPose(roomId, eyeLevel); if (pose) flyTo(pose); },
  }), [gl, scene, camera, size, idHexById, span, initial, rooms, frame]);

  return null;
});
Bridge.displayName = 'SceneCanvasBridge';

/** First-person walking: WASD or arrows, drag to look, click the floor to glide there; walls block, doors let you through. */
const WalkController: React.FC<{
  start: [number, number]; facing: [number, number]; walls: PlanWall[]; openings: PlanOpening[]; frame: PlanFrame;
  controls: React.MutableRefObject<OrbitControlsImpl | null>; onExit(): void;
}> = ({ start, facing, walls, openings, frame, controls, onExit }) => {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const glide = useRef<[number, number] | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const EYE = 1.6;

  useEffect(() => {
    const orbit = controls.current;
    if (orbit) orbit.enabled = false;
    camera.position.set(start[0], EYE, start[1]);
    look.current = { yaw: Math.atan2(-(facing[0] - start[0]), -(facing[1] - start[1])), pitch: -0.05 };
    (camera as PerspectiveCamera).fov = 70;
    (camera as PerspectiveCamera).updateProjectionMatrix();

    const el = gl.domElement;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: false }; el.setPointerCapture?.(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      look.current.yaw -= dx * 0.004;
      look.current.pitch = Math.max(-1.2, Math.min(1.2, look.current.pitch - dy * 0.004));
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = drag && !drag.moved;
      drag = null;
      if (!wasClick) return;
      const r = el.getBoundingClientRect();
      const ndc = new Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      if (dir.y >= -0.01) return;
      const t = -camera.position.y / dir.y;
      glide.current = [camera.position.x + dir.x * t, camera.position.z + dir.z * t];
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { exitRef.current(); return; }
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        e.preventDefault();
        if (e.type === 'keydown') keys.current.add(k); else keys.current.delete(k);
        glide.current = null;
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      keys.current.clear();
      if (orbit) {
        const ahead = new Vector3(0, 0, -2).applyEuler(camera.rotation).add(camera.position);
        orbit.target.set(ahead.x, Math.max(0.5, ahead.y), ahead.z);
        orbit.enabled = true;
        orbit.update();
      }
    };
  }, [camera, gl, controls, start, facing]);

  useFrame((_, dt) => {
    const k = keys.current;
    const { yaw, pitch } = look.current;
    let mx = 0; let mz = 0;
    if (k.has('w') || k.has('arrowup')) mz -= 1;
    if (k.has('s') || k.has('arrowdown')) mz += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    const speed = (k.has('shift') ? 3 : 1.4) * Math.min(dt, 0.05);
    let nx = camera.position.x; let nz = camera.position.z;
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      const sx = (mx / len) * speed; const sz = (mz / len) * speed;
      nx += sx * Math.cos(yaw) + sz * Math.sin(yaw);
      nz += -sx * Math.sin(yaw) + sz * Math.cos(yaw);
    } else if (glide.current) {
      const [gx, gz] = glide.current;
      const dx = gx - nx; const dz = gz - nz; const dist = Math.hypot(dx, dz);
      if (dist < 0.05) glide.current = null;
      else { const step = Math.min(dist, 1.6 * Math.min(dt, 0.05)); nx += (dx / dist) * step; nz += (dz / dist) * step; }
    }
    if (nx !== camera.position.x || nz !== camera.position.z) {
      const from = toPlan(camera.position.x, camera.position.z, frame);
      const to = toPlan(nx, nz, frame);
      const [px, py] = walkStep(from, to, walls, openings);
      if (px === from[0] && py === from[1]) glide.current = null;
      const [sx2, sz2] = toScene(px, py, frame);
      camera.position.set(sx2, EYE, sz2);
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  });

  return null;
};

let rectLightsReady = false;

/** Daylight coming in through one window: a soft area light in the opening, aimed into the room and slightly down. */
const WindowLight: React.FC<{ roomId: string | null; pos: [number, number, number]; look: [number, number, number]; width: number; height: number }> = ({ roomId, pos, look, width, height }) => {
  const ref = useRef<RectAreaLight>(null);
  if (!rectLightsReady) { RectAreaLightUniformsLib.init(); rectLightsReady = true; }
  useEffect(() => { ref.current?.lookAt(look[0], look[1], look[2]); }, [look]);
  return <rectAreaLight ref={ref} position={pos} width={width} height={height} intensity={2.2} color="#fff6e8" userData={{ windowRoom: roomId }} />;
};

export const SceneCanvas = forwardRef<SceneCanvasHandle, Props>((props, ref) => {
  const {
    rooms, walls, openings, surfaces, finishes = [], objects, products, defaultWallHeightMm, viewCamera, tool, wireframe, selectedId,
    onSelect, onMoveObject, onRemoveObject, onPaint, onFocusRoom, modelUrls = {}, walkRoomId, onWalkEnd,
    staleModels, paintScope = 'wall', splashBand = { fromMm: 900, toMm: 1500 }, photo = false, onPhotoProgress,
    frontsOpen = 0, cabinetHardware, sunHour = null, script, worlds = [], onAssets,
  } = props;
  const loading = useRef(new Set<string>());
  const reportAssets = useRef(onAssets);
  reportAssets.current = onAssets;
  const track = useCallback((key: string, on: boolean) => {
    if (on) loading.current.add(key); else loading.current.delete(key);
    reportAssets.current?.(loading.current.size);
  }, []);
  const drawn = useRef<Group>(null);
  const wallsGroup = useRef<Group>(null);
  const lit = useRef(true);
  const objectsGroup = useRef<Group>(null);
  const cabinetView = useMemo(() => ({ open: frontsOpen, hardware: cabinetHardware ?? 'bar_handles' }), [frontsOpen, cabinetHardware]);
  const hasSplats = Object.values(modelUrls).some((u) => !isMeshModel(u));
  const bounds = useMemo(() => planBounds(rooms, walls), [rooms, walls]);
  const frame = useMemo(() => planFrame(bounds), [bounds]);
  const walkPose = useMemo(() => {
    if (walkRoomId === undefined) return null;
    const room = rooms.find((r) => r.id === walkRoomId) ?? rooms[0];
    if (!room || room.outline.length < 3) return null;
    const pts = room.outline.map(([px, py]) => toScene(px, py, frame));
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
    const cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const far = pts.reduce((best, q) => (Math.hypot(q[0] - cx, q[1] - cz) > Math.hypot(best[0] - cx, best[1] - cz) ? q : best), pts[0]);
    return { start: [cx + (far[0] - cx) * 0.6, cz + (far[1] - cz) * 0.6] as [number, number], facing: [cx, cz] as [number, number] };
  }, [walkRoomId, rooms, frame]);
  const span = Math.max((bounds.maxX - bounds.minX) / 1000, (bounds.maxY - bounds.minY) / 1000, 2);
  const centre = useMemo(() => new Vector3(0, 0, 0), []);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const floorPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);

  const initial = useMemo<CameraPose>(() => {
    if (viewCamera && (viewCamera.x_mm || viewCamera.y_mm)) {
      const [px, pz] = toScene(viewCamera.x_mm, viewCamera.y_mm, frame);
      const [tx, tz] = toScene(viewCamera.look_x_mm, viewCamera.look_y_mm, frame);
      return { position: [px, viewCamera.height_mm / 1000, pz], target: [tx, 0.9, tz], fov: viewCamera.fov_deg };
    }
    return { position: [span * 0.85, span * 0.95, span * 0.95], target: [0, 0.3, 0], fov: 45 };
  }, [viewCamera, frame, span]);

  const surfaceIndex = useMemo(() => indexSurfaces(surfaces), [surfaces]);
  const finishesByObject = useMemo(
    () => Object.fromEntries(objects.map((o) => [o.id, objectSlotFinishes(o, finishes, products)])),
    [objects, finishes, products],
  );
  const roomSurface = (roomId: string, surface: 'floor' | 'ceiling') => surfaceIndex.get(surfaceKey({ room_id: roomId, surface }));
  const finishOfSurface = (sf: SceneSurface | null | undefined) => resolveFinish(sf ?? null, sf?.product_id ? products[sf.product_id] : undefined);

  const [hover, setHover] = useState<string | null>(null);
  const hoverAt = (key: string | null) => setHover((h) => (h === key ? h : key));
  const wallTarget = (roomId: string, wallId: string): SurfaceTarget | null =>
    paintScope === 'area' ? null
    : paintScope === 'walls' ? { roomId, surface: 'walls' }
      : paintScope === 'splash' ? { roomId, surface: 'splash', wallId, fromMm: splashBand.fromMm, toMm: splashBand.toMm }
        : { roomId, surface: 'wall', wallId };
  const [drag, setDrag] = useState<{ roomId: string; wallId: string | null; start: [number, number]; end: [number, number] } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dragRect = (d: { start: [number, number]; end: [number, number] }) => ({
    u0: Math.min(d.start[0], d.end[0]), u1: Math.max(d.start[0], d.end[0]), v0: Math.min(d.start[1], d.end[1]), v1: Math.max(d.start[1], d.end[1]),
  });
  const uvAt = (point: Vector3, wall: PlanWall | null): [number, number] => {
    if (!wall) return toPlan(point.x, point.z, frame);
    const [sx, sz] = toScene(wall.x1_mm, wall.y1_mm, frame);
    const len = Math.hypot(wall.x2_mm - wall.x1_mm, wall.y2_mm - wall.y1_mm) || 1;
    const dx = (wall.x2_mm - wall.x1_mm) / len; const dz = (wall.y2_mm - wall.y1_mm) / len;
    return [Math.round(((point.x - sx) * dx + (point.z - sz) * dz) * 1000), Math.round(point.y * 1000)];
  };
  const beginArea = (e: ThreeEvent<PointerEvent>, roomId: string, wall: PlanWall | null) => {
    if (tool !== 'paint' || paintScope !== 'area' || e.button !== 0) return;
    e.stopPropagation();
    if (controls.current) controls.current.enabled = false;
    const uv = uvAt(e.point, wall);
    setDrag({ roomId, wallId: wall?.id ?? null, start: uv, end: uv });
  };
  const moveArea = (e: ThreeEvent<PointerEvent>, roomId: string, wall: PlanWall | null) => {
    const d = dragRef.current;
    if (!d || d.roomId !== roomId || d.wallId !== (wall?.id ?? null)) return;
    const uv = uvAt(e.point, wall);
    setDrag({ ...d, end: uv });
  };
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      if (controls.current) controls.current.enabled = true;
      const r = dragRect(d);
      if (r.u1 - r.u0 < 50 || r.v1 - r.v0 < 50) return;
      onPaint({ roomId: d.roomId, surface: 'zone', wallId: d.wallId, zoneKey: crypto.randomUUID(), ...r });
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [onPaint]);
  const zoneTarget = (z: SceneSurface): SurfaceTarget => ({
    roomId: z.room_id, surface: 'zone', wallId: z.wall_id ?? null, zoneKey: z.zone_key ?? '',
    u0: z.zone_u0_mm ?? 0, u1: z.zone_u1_mm ?? 0, v0: z.zone_v0_mm ?? 0, v1: z.zone_v1_mm ?? 0,
  });
  const floorZones = surfaces.filter((z) => z.surface === 'zone' && !z.wall_id);

  const wallHoverKey = (roomId: string, wallId: string) => (paintScope === 'walls' ? `walls:${roomId}` : `wall:${roomId}:${wallId}`);

  const wallSides = useMemo(() => {
    const out = new Map<string, WallSides>();
    for (const w of walls) {
      const len = Math.hypot(w.x2_mm - w.x1_mm, w.y2_mm - w.y1_mm) || 1;
      const nx = -(w.y2_mm - w.y1_mm) / len;
      const ny = (w.x2_mm - w.x1_mm) / len;
      const mx = (w.x1_mm + w.x2_mm) / 2;
      const my = (w.y1_mm + w.y2_mm) / 2;
      const off = w.thickness_mm / 2 + 60;
      const roomAt = (sx: number, sy: number) => rooms.find((r) => pointInPolygon(sx, sy, r.outline))?.id ?? null;
      const plus = roomAt(mx + nx * off, my + ny * off);
      const minus = roomAt(mx - nx * off, my - ny * off);
      out.set(w.id, { plus, minus, exterior: plus && !minus ? 'minus' : minus && !plus ? 'plus' : null });
    }
    return out;
  }, [walls, rooms]);

  const idHexById = useMemo(() => {
    const out: Record<string, string> = {};
    objects.forEach((o, i) => { out[o.id] = rgbToHex(idColour(i + 1)); });
    return out;
  }, [objects]);

  const windowLights = useMemo(() => openings.flatMap((o) => {
    if (o.kind !== 'window') return [];
    const wall = walls.find((w) => w.id === o.wall_id);
    const sides = wall ? wallSides.get(wall.id) : undefined;
    if (!wall || !sides || !sides.exterior) return [];
    const p = openingPlacement(wall, o, frame);
    const len = Math.hypot(wall.x2_mm - wall.x1_mm, wall.y2_mm - wall.y1_mm) || 1;
    const sign = sides.exterior === 'minus' ? 1 : -1;
    const nx = (-(wall.y2_mm - wall.y1_mm) / len) * sign;
    const nz = ((wall.x2_mm - wall.x1_mm) / len) * sign;
    const inset = Math.max(wall.thickness_mm, 20) / 2000 + 0.03;
    const pos: [number, number, number] = [p.center[0] + nx * inset, p.center[1], p.center[2] + nz * inset];
    const look: [number, number, number] = [pos[0] + nx, pos[1] - 0.25, pos[2] + nz];
    const roomId = sides.exterior === 'minus' ? sides.plus : sides.minus;
    return [{ id: o.id, roomId, pos, look, width: p.width, height: p.height }];
  }), [openings, walls, wallSides, frame]);
  const litRooms = useMemo<LitRoom[]>(() => rooms.filter((r) => r.outline.length > 2).map((r) => ({
    id: r.id, outline: r.outline.map(([x, y]) => toScene(x, y, frame)), centre: toScene(...polygonCentroid(r.outline), frame), height: (r.height_mm ?? defaultWallHeightMm) / 1000,
  })), [rooms, frame, defaultWallHeightMm]);
  const lightVersion = useMemo(() => ({ surfaces, finishes, objects, products, sunHour }), [surfaces, finishes, objects, products, sunHour]);
  const lightReady = useCallback(() => !!drawn.current?.visible && (wallsGroup.current?.scale.y ?? 0) > 0.99, []);

  const roomOfPoint = (xMm: number, yMm: number) => rooms.find((r) => pointInPolygon(xMm, yMm, r.outline))?.id ?? null;

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      resize={{ offsetSize: true }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: initial.position, fov: initial.fov, near: 0.05, far: 500 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#e9e6e1']} />
      <RoomLighting span={span} sunHour={sunHour} rooms={litRooms} version={lightVersion} solid={lightReady} lit={lit} />
      {!wireframe && windowLights.map(({ id, ...l }) => <WindowLight key={id} {...l} />)}
      {photo && !wireframe && <PhotoMode ceilingHeight={defaultWallHeightMm / 1000} onProgress={(n, settled, preparing) => onPhotoProgress?.(n, settled, preparing)} />}
      {(hasSplats || worlds.length > 0) && <SparkLayer />}
      <AssetContext.Provider value={track}>
      <group ref={drawn}>
      <group userData={{ splat: true }}>
        <ContactShadows position={[0, 0.004, 0]} scale={span * 1.6} far={2.5} blur={2.2} opacity={0.3} resolution={1024} />
      </group>
      {rooms.map((room) => (
        <FloorMesh
          key={room.id}
          room={room}
          frame={frame}
          ceilingHeight={defaultWallHeightMm / 1000}
          surface={roomSurface(room.id, 'floor')}
          product={products[roomSurface(room.id, 'floor')?.product_id ?? '']}
          ceiling={finishOfSurface(roomSurface(room.id, 'ceiling'))}
          highlightFloor={tool === 'paint' && hover === `floor:${room.id}`}
          highlightCeiling={tool === 'paint' && hover === `ceiling:${room.id}`}
          wireframe={wireframe}
          onHover={(sf) => { if (tool === 'paint') hoverAt(sf ? `${sf}:${room.id}` : null); }}
          onPick={(e) => {
            if (tool !== 'paint' || paintScope === 'area') return;
            e.stopPropagation();
            onPaint({ roomId: room.id, surface: 'floor' });
          }}
          onAreaDown={(e) => beginArea(e, room.id, null)}
          onAreaMove={(e) => moveArea(e, room.id, null)}
          onPickCeiling={(e) => {
            if (tool !== 'paint') return;
            e.stopPropagation();
            onPaint({ roomId: room.id, surface: 'ceiling' });
          }}
          onDouble={(e) => {
            if (tool !== 'view' || !onFocusRoom) return;
            e.stopPropagation();
            onFocusRoom(room.id);
          }}
        />
      ))}
      {[...floorZones.map((z) => ({ z, r: { u0: z.zone_u0_mm ?? 0, u1: z.zone_u1_mm ?? 0, v0: z.zone_v0_mm ?? 0, v1: z.zone_v1_mm ?? 0 } })),
        ...(drag && !drag.wallId ? [{ z: null, r: dragRect(drag) }] : [])].map(({ z, r }) => {
        const [x0, z0] = toScene(r.u0, r.v0, frame);
        const [x1, z1] = toScene(r.u1, r.v1, frame);
        const w = x1 - x0; const d = z1 - z0;
        if (w < 0.01 || d < 0.01) return null;
        return (
          <mesh
            key={z?.id ?? 'floor-preview'}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(x0 + x1) / 2, z ? 0.004 : 0.006, (z0 + z1) / 2]}
            receiveShadow
            userData={z ? { surface: 'zone', roomId: z.room_id } : { helper: true }}
            onClick={(e) => { if (!z || tool !== 'paint') return; e.stopPropagation(); onPaint(zoneTarget(z)); }}
            onPointerDown={(e) => { if (z) beginArea(e, z.room_id, null); }}
            onPointerMove={(e) => { if (z) { moveArea(e, z.room_id, null); if (tool === 'paint') hoverAt(`zone:${z.id}`); } }}
            onPointerOut={() => hoverAt(null)}
          >
            <planeGeometry args={[w, d]} />
            {z
              ? <FinishMaterial finish={finishOfSurface(z)} role="surface:floor" fallback="#cfc6b8" w={w} h={d} wireframe={wireframe} highlight={tool === 'paint' && hover === `zone:${z.id}`} />
              : <meshBasicMaterial color="#3d7bff" transparent opacity={0.35} depthWrite={false} />}
          </mesh>
        );
      })}
      <group ref={wallsGroup}>
      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={openings}
          frame={frame}
          heightMm={defaultWallHeightMm}
          sides={wallSides.get(wall.id)!}
          finishOf={(roomId) => finishOfSurface(wallFaceFinish(surfaceIndex, roomId, wall.id))}
          overlaysOf={(roomId) => {
            const out: WallOverlay[] = [];
            const sf = splashFinish(surfaceIndex, roomId, wall.id);
            const f = finishOfSurface(sf);
            if (sf && f) out.push({ key: 'splash', finish: f, fromM: (sf.band_from_mm ?? 0) / 1000, toM: (sf.band_to_mm ?? 0) / 1000, aFrom: 0, aTo: 1e6, lift: 0.004 });
            for (const z of zonesOn(surfaces, roomId, wall.id)) {
              out.push({
                key: z.id, finish: finishOfSurface(z), lift: 0.007,
                fromM: (z.zone_v0_mm ?? 0) / 1000, toM: (z.zone_v1_mm ?? 0) / 1000, aFrom: (z.zone_u0_mm ?? 0) / 1000, aTo: (z.zone_u1_mm ?? 0) / 1000,
                highlight: tool === 'paint' && hover === `zone:${z.id}`,
                onClick: (e) => { if (tool !== 'paint') return; e.stopPropagation(); onPaint(zoneTarget(z)); },
              });
            }
            if (drag && drag.wallId === wall.id && drag.roomId === roomId) {
              const r = dragRect(drag);
              out.push({ key: 'preview', finish: null, preview: true, lift: 0.01, fromM: r.v0 / 1000, toM: r.v1 / 1000, aFrom: r.u0 / 1000, aTo: r.u1 / 1000 });
            }
            return out;
          }}
          highlightOf={(roomId) => tool === 'paint' && !!roomId && hover === wallHoverKey(roomId, wall.id)}
          wireframe={wireframe}
          cutaway
          centre={centre}
          onHover={(roomId) => { if (tool === 'paint') hoverAt(roomId ? wallHoverKey(roomId, wall.id) : null); }}
          onPick={(e, roomId) => {
            if (tool !== 'paint' || !roomId) return;
            e.stopPropagation();
            const t = wallTarget(roomId, wall.id);
            if (t) onPaint(t);
          }}
          onAreaDown={(e, roomId) => { if (roomId) beginArea(e, roomId, wall); }}
          onAreaMove={(e, roomId) => { if (roomId) moveArea(e, roomId, wall); }}
        />
      ))}
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wall_id);
        return wall ? <OpeningMesh key={o.id} wall={wall} opening={o} frame={frame} wireframe={wireframe} /> : null;
      })}
      </group>
      <CabinetViewContext.Provider value={cabinetView}>
      <group ref={objectsGroup}>
      {objects.filter((o) => !o.removed_at).map((o) => (
        <ObjectMesh
          key={o.id}
          obj={o}
          idHex={idHexById[o.id]}
          frame={frame}
          product={o.product_id ? products[o.product_id] : undefined}
          selected={selectedId === o.id}
          wireframe={wireframe}
          tool={tool}
          floorPlane={floorPlane}
          controls={controls}
          onSelect={() => onSelect(o.id)}
          onMove={(id, patch, commit) => {
            const next = { ...patch };
            if (patch.x_mm !== undefined && patch.y_mm !== undefined) next.room_id = roomOfPoint(patch.x_mm, patch.y_mm);
            onMoveObject(id, next, commit);
          }}
          onRemove={() => onRemoveObject(o.id)}
          modelUrl={modelUrls[o.id]}
          finishes={finishesByObject[o.id]}
        />
      ))}
      </group>
      {objects.filter((o) => !o.removed_at && modelUrls[o.id] && !isMeshModel(modelUrls[o.id])).map((o) => (
        <ObjectModel
          key={o.id}
          obj={o}
          frame={frame}
          product={o.product_id ? products[o.product_id] : undefined}
          url={modelUrls[o.id]}
          finishes={finishesByObject[o.id]}
          stale={staleModels?.has(o.id)}
        />
      ))}
      </CabinetViewContext.Provider>
      </group>
      {worlds.length > 0 && <PhotorealRooms worlds={worlds} rooms={rooms} frame={frame} heightM={defaultWallHeightMm / 1000} drawn={drawn} />}
      </AssetContext.Provider>
      {script && <ScriptDriver script={script} walls={wallsGroup} objects={objectsGroup} />}
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!script}
        enableDamping
        enableRotate={tool !== 'move' && tool !== 'turn'}
        target={initial.target}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.5}
        maxDistance={span * 4}
      />
      <Bridge ref={ref} controls={controls} span={span} initial={initial} idHexById={idHexById} rooms={rooms} frame={frame} lit={lit} />
      {!wireframe && !photo && (hasSplats || worlds.length > 0) && <SplatsAfterComposer script={script} />}
      {!wireframe && !photo && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.3} distanceFalloff={0.4} intensity={1.2} halfRes quality="medium" />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      {walkPose && (
        <WalkController
          start={walkPose.start} facing={walkPose.facing} walls={walls} openings={openings} frame={frame}
          controls={controls} onExit={() => onWalkEnd?.()}
        />
      )}
    </Canvas>
  );
});
SceneCanvas.displayName = 'SceneCanvas';
