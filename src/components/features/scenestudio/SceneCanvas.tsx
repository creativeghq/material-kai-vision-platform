/** The editable Scene Studio room (#564): walls cut around openings, floors, and every object as a true-size stand-in. */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import {
  Color, DoubleSide, Material, Mesh, MeshBasicMaterial, Plane, Shape, Vector3,
  type Object3D, type PerspectiveCamera, type Texture,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PresetLighting, DEFAULT_PRESET } from '@/components/features/lighting/PresetLighting';
import { loadSharedTexture } from '@/components/features/ar/materialOverrides';
import { tileFormatM } from '@/components/features/roomplanner/surfaceFormat';
import {
  effectiveSize, idColour, openingPlacement, planBounds, planFrame, pointInPolygon, rgbToHex,
  rotationToPlan, rotationToScene, toPlan, toScene, wallPieces,
  type PlanFrame, type PlanOpening, type PlanRoom, type PlanWall,
} from '@/lib/scene/sceneGeometry';
import type { SceneCamera, SceneObject, SceneProduct, SceneSurface } from '@/services/sceneStudioService';

export type SceneTool = 'view' | 'move' | 'turn' | 'remove' | 'paint';

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
  setPose(pose: CameraPose): void;
  topView(): void;
  resetView(): void;
}

interface Props {
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  surfaces: SceneSurface[];
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
  onPaint(roomId: string, surface: 'floor' | 'walls'): void;
}

const MAX_CAPTURE_SIDE = 1536;
const FLOOR_DEFAULT = '#c9b8a2';
const WALL_DEFAULT = '#efebe4';
const SELECT_COLOUR = '#ff7a3d';

const KIND_COLOURS: Record<string, string> = {
  sofa: '#8d6e63', armchair: '#a1887f', chair: '#6d4c41', stool: '#6d4c41', dining_table: '#795548', coffee_table: '#795548',
  side_table: '#795548', desk: '#8d6e63', bed: '#d7ccc8', nightstand: '#8d6e63', wardrobe: '#bcaaa4', cabinet: '#bcaaa4',
  shelving: '#a1887f', tv_unit: '#5d4037', tv: '#212121', rug: '#c5a46e', lamp: '#f5f5f5', pendant: '#f5f5f5', plant: '#4c7a3d',
  artwork: '#b0a8a0', mirror: '#cfd8dc', curtain: '#e8e0d4', kitchen_base: '#eceff1', kitchen_wall: '#eceff1',
  kitchen_tall: '#eceff1', island: '#eceff1', appliance: '#9e9e9e', sink: '#e0e0e0', toilet: '#fafafa', bathtub: '#fafafa',
  shower: '#cfd8dc', vanity: '#d7ccc8', stairs: '#a1887f', fireplace: '#8d8d8d', radiator: '#f5f5f5', other: '#9e9aa6',
};

function useTileTexture(product: SceneProduct | undefined): { map: Texture | null; tileW: number; tileL: number } {
  const [map, setMap] = useState<Texture | null>(null);
  const url = product?.imageUrl ?? null;
  const fmt = useMemo(() => (product ? tileFormatM(product) : null), [product]);
  useEffect(() => {
    setMap(null);
    if (!url) return;
    let live = true;
    loadSharedTexture(url).then((shared) => {
      if (!live) return;
      const own = shared.clone();
      own.needsUpdate = true;
      setMap(own);
    }).catch(() => { if (live) setMap(null); });
    return () => { live = false; };
  }, [url]);
  useEffect(() => () => { map?.dispose(); }, [map]);
  return { map, tileW: fmt?.tileWidthM ?? 0.6, tileL: fmt?.tileLengthM ?? 0.6 };
}

const FloorMesh: React.FC<{
  room: PlanRoom; frame: PlanFrame; surface?: SceneSurface; product?: SceneProduct; wireframe: boolean;
  onPick(e: ThreeEvent<MouseEvent>): void;
}> = ({ room, frame, surface, product, wireframe, onPick }) => {
  const shape = useMemo(() => {
    const s = new Shape();
    room.outline.forEach(([x, y], i) => {
      const [sx, sz] = toScene(x, y, frame);
      if (i === 0) s.moveTo(sx, -sz); else s.lineTo(sx, -sz);
    });
    s.closePath();
    return s;
  }, [room.outline, frame]);
  const { map, tileW, tileL } = useTileTexture(product);
  useEffect(() => { if (map) { map.repeat.set(1 / tileW, 1 / tileL); map.needsUpdate = true; } }, [map, tileW, tileL]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow userData={{ surface: 'floor', roomId: room.id }} onClick={onPick}>
      <shapeGeometry args={[shape]} />
      {map
        ? <meshStandardMaterial key="tex" map={map} roughness={0.85} wireframe={wireframe} />
        : <meshStandardMaterial key="flat" color={surface?.colour_hex ?? FLOOR_DEFAULT} roughness={0.9} wireframe={wireframe} />}
    </mesh>
  );
};

interface WallSides { plus: string | null; minus: string | null; exterior: 'plus' | 'minus' | null }

const WallMesh: React.FC<{
  wall: PlanWall; openings: PlanOpening[]; frame: PlanFrame; heightMm: number; sides: WallSides;
  colourOf(roomId: string | null): string; wireframe: boolean; cutaway: boolean; centre: Vector3;
  onPick(e: ThreeEvent<MouseEvent>, roomId: string | null): void;
}> = ({ wall, openings, frame, heightMm, sides, colourOf, wireframe, cutaway, centre, onPick }) => {
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
  const plusColour = colourOf(sides.plus);
  const minusColour = colourOf(sides.minus);
  const cap = 0.12;
  return (
    <group>
      {pieces.map((p, i) => {
        const h = low ? Math.min(p.height, Math.max(0, cap - (p.center[1] - p.height / 2))) : p.height;
        if (h <= 0.001) return null;
        const y = low ? (p.center[1] - p.height / 2) + h / 2 : p.center[1];
        return (
          <mesh
            key={i}
            position={[p.center[0], y, p.center[2]]}
            rotation={[0, p.rotationY, 0]}
            castShadow
            receiveShadow
            userData={{ surface: 'walls', wallId: wall.id }}
            onClick={(e) => {
              const idx = e.face?.materialIndex;
              onPick(e, idx === 4 ? sides.plus : idx === 5 ? sides.minus : (sides.plus ?? sides.minus));
            }}
          >
            <boxGeometry args={[p.length, h, p.thickness]} />
            <meshStandardMaterial attach="material-0" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-1" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-2" color={low ? '#ffffff' : WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-3" color={WALL_DEFAULT} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-4" color={plusColour} roughness={0.95} wireframe={wireframe} />
            <meshStandardMaterial attach="material-5" color={minusColour} roughness={0.95} wireframe={wireframe} />
          </mesh>
        );
      })}
    </group>
  );
};

const OpeningMesh: React.FC<{ wall: PlanWall; opening: PlanOpening; frame: PlanFrame; wireframe: boolean }> = ({ wall, opening, frame, wireframe }) => {
  const p = useMemo(() => openingPlacement(wall, opening, frame), [wall, opening, frame]);
  const thickness = Math.max(wall.thickness_mm, 20) / 1000;
  if (opening.kind === 'opening') return null;
  const isWindow = opening.kind === 'window';
  return (
    <mesh position={p.center} rotation={[0, p.rotationY, 0]}>
      <boxGeometry args={[p.width, p.height, isWindow ? 0.02 : thickness * 0.4]} />
      <meshStandardMaterial
        color={isWindow ? '#bcdff5' : '#6d4c41'}
        transparent={isWindow}
        opacity={isWindow ? 0.35 : 1}
        roughness={isWindow ? 0.05 : 0.7}
        wireframe={wireframe}
      />
    </mesh>
  );
};

const ObjectMesh: React.FC<{
  obj: SceneObject; idHex: string; frame: PlanFrame; product?: SceneProduct; selected: boolean; wireframe: boolean;
  tool: SceneTool; floorPlane: Plane; controls: React.MutableRefObject<OrbitControlsImpl | null>;
  onSelect(): void; onMove: Props['onMoveObject']; onRemove(): void;
}> = ({ obj, idHex, frame, product, selected, wireframe, tool, floorPlane, controls, onSelect, onMove, onRemove }) => {
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
    const material = <meshStandardMaterial color={colour} roughness={0.8} wireframe={wireframe} />;
    const edges = selected ? <Edges userData={{ helper: true }} color={SELECT_COLOUR} lineWidth={2} /> : null;
    const common = { castShadow: true, receiveShadow: true, userData: { objectId: obj.id, idHex } };
    if (obj.kind === 'plant') {
      return (
        <group>
          <mesh {...common} position={[0, h * 0.15, 0]}><cylinderGeometry args={[w * 0.3, w * 0.25, h * 0.3, 16]} /><meshStandardMaterial color="#e0dcd4" wireframe={wireframe} />{edges}</mesh>
          <mesh {...common} position={[0, h * 0.65, 0]}><sphereGeometry args={[Math.max(w, d) * 0.5, 16, 12]} />{material}</mesh>
        </group>
      );
    }
    if (obj.kind === 'lamp' || obj.kind === 'pendant') {
      return <mesh {...common} position={[0, h / 2, 0]}><cylinderGeometry args={[w * 0.5, w * 0.35, h, 20]} />{material}{edges}</mesh>;
    }
    return <mesh {...common} position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} />{material}{edges}</mesh>;
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

/** Exposes capture and camera moves to the page. Lives inside the Canvas so it can reach the renderer. */
const Bridge = forwardRef<SceneCanvasHandle, {
  controls: React.MutableRefObject<OrbitControlsImpl | null>; span: number; initial: CameraPose; idHexById: Record<string, string>;
}>(({ controls, span, initial, idHexById }, ref) => {
  const { gl, scene, camera, size } = useThree();

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
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
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
        gl.render(scene, camera);
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
    setPose,
    topView() { setPose({ position: [0, span * 1.35, 0.01], target: [0, 0, 0], fov: 45 }); },
    resetView() { setPose(initial); },
  }), [gl, scene, camera, size, idHexById, span, initial]);

  return null;
});
Bridge.displayName = 'SceneCanvasBridge';

export const SceneCanvas = forwardRef<SceneCanvasHandle, Props>((props, ref) => {
  const {
    rooms, walls, openings, surfaces, objects, products, defaultWallHeightMm, viewCamera, tool, wireframe, selectedId,
    onSelect, onMoveObject, onRemoveObject, onPaint,
  } = props;
  const bounds = useMemo(() => planBounds(rooms, walls), [rooms, walls]);
  const frame = useMemo(() => planFrame(bounds), [bounds]);
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

  const surfaceOf = useMemo(() => {
    const map = new Map<string, SceneSurface>();
    for (const s of surfaces) map.set(`${s.room_id}:${s.surface}`, s);
    return map;
  }, [surfaces]);

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

  const colourOfWalls = (roomId: string | null) => (roomId ? surfaceOf.get(`${roomId}:walls`)?.colour_hex : null) ?? WALL_DEFAULT;

  const roomOfPoint = (xMm: number, yMm: number) => rooms.find((r) => pointInPolygon(xMm, yMm, r.outline))?.id ?? null;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: initial.position, fov: initial.fov, near: 0.05, far: 500 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#e9e6e1']} />
      <PresetLighting preset={DEFAULT_PRESET} />
      {rooms.map((room) => (
        <FloorMesh
          key={room.id}
          room={room}
          frame={frame}
          surface={surfaceOf.get(`${room.id}:floor`)}
          product={products[surfaceOf.get(`${room.id}:floor`)?.product_id ?? '']}
          wireframe={wireframe}
          onPick={(e) => {
            if (tool !== 'paint') return;
            e.stopPropagation();
            onPaint(room.id, 'floor');
          }}
        />
      ))}
      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={openings}
          frame={frame}
          heightMm={defaultWallHeightMm}
          sides={wallSides.get(wall.id)!}
          colourOf={colourOfWalls}
          wireframe={wireframe}
          cutaway
          centre={centre}
          onPick={(e, roomId) => {
            if (tool !== 'paint' || !roomId) return;
            e.stopPropagation();
            onPaint(roomId, 'walls');
          }}
        />
      ))}
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wall_id);
        return wall ? <OpeningMesh key={o.id} wall={wall} opening={o} frame={frame} wireframe={wireframe} /> : null;
      })}
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
        />
      ))}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        enableRotate={tool !== 'move' && tool !== 'turn'}
        target={initial.target}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.5}
        maxDistance={span * 4}
      />
      <Bridge ref={ref} controls={controls} span={span} initial={initial} idHexById={idHexById} />
    </Canvas>
  );
});
SceneCanvas.displayName = 'SceneCanvas';
