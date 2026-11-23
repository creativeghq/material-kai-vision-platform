/** What makes the 3D room read as a real interior: light, default surfaces, and real shapes for every object kind. */
import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, DoubleSide, PMREMGenerator, RepeatWrapping, SRGBColorSpace, type Mesh, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DARK, STEEL, STONE, WHITE, objectParts } from '@/lib/scene/objectParts';
import type { SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import type { Finish } from '@/lib/scene/sceneSurfaces';
import { useFinishMaps } from '@/components/features/scenestudio/surfaceMaps';
import { KITCHEN_KINDS, type KitchenLayout } from '@/lib/scene/kitchenComposition';
import type { BoardSlot } from '@/lib/scene/cabinetPanels';
import { CabinetViewContext, buildKitchenGeometry, type FittingGroup } from '@/components/features/scenestudio/cabinetMesh';

export const RoomLighting: React.FC<{ span: number }> = ({ span }) => {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  const s = Math.max(span, 4);
  return (
    <>
      <hemisphereLight args={['#fff7ec', '#bfae97', 0.35]} />
      <directionalLight
        position={[s * 0.55, s * 1.1, s * 0.35]}
        intensity={1.7}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
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

let oak: Texture | null = null;

/** Oak planks, 1 m of floor per texture repeat: 5 rows of 20 cm boards, joints staggered. */
export function oakFloorTexture(): Texture {
  if (oak) return oak;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d')!;
  const rows = 5; const rowH = c.height / rows;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 512 + rnd() * 120;
    for (let x = -offset; x < c.width; x += 640 + rnd() * 380) {
      const tone = 168 + rnd() * 26;
      g.fillStyle = `rgb(${tone}, ${tone * 0.76}, ${tone * 0.5})`;
      g.fillRect(x, r * rowH, 1100, rowH);
      for (let k = 0; k < 14; k++) {
        const y = r * rowH + rnd() * rowH;
        g.strokeStyle = `rgba(90, 58, 30, ${0.05 + rnd() * 0.08})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        g.moveTo(x, y);
        for (let t = 0; t < 1100; t += 40) g.lineTo(x + t, y + Math.sin((t + k * 50) / 90) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(60, 40, 20, 0.55)';
      g.fillRect(x, r * rowH, 3, rowH);
    }
    g.fillStyle = 'rgba(60, 40, 20, 0.45)';
    g.fillRect(0, r * rowH, c.width, 3);
  }
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  oak = t;
  return t;
}

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
/** One material slot carrying a finish laid at its real size, with relief and gloss; plaster when there is none. */
export const FinishMaterial: React.FC<{
  attach?: string; finish: Finish | null; fallback: string; w: number; h: number; offX?: number; offY?: number;
  wireframe: boolean; highlight?: boolean; side?: typeof DoubleSide;
}> = ({ attach, finish, fallback, w, h, offX = 0, offY = 0, wireframe, highlight, side }) => {
  const maps = useFinishMaps(finish, w, h, offX, offY);
  const colour = finish?.imageUrl ? '#ffffff' : finish?.hex ?? fallback;
  return (
    <meshStandardMaterial
      key={maps ? `m${maps.map ? 1 : 0}` : 'n'}
      attach={attach}
      color={colour}
      map={maps?.map ?? null}
      normalMap={maps?.normalMap ?? null}
      roughnessMap={maps?.roughnessMap ?? null}
      roughness={1}
      emissive={highlight ? '#3d7bff' : '#000000'}
      emissiveIntensity={highlight ? 0.22 : 0}
      side={side}
      wireframe={wireframe}
    />
  );
};

export type SlotFinishes = Partial<Record<SceneObjectSlot, Finish | null>>;

const PartMaterial: React.FC<{ part: ReturnType<typeof objectParts>[number]; finish: Finish | null | undefined; wireframe: boolean }> = ({ part, finish, wireframe }) =>
  finish?.imageUrl
    ? <FinishMaterial finish={finish} fallback={part.color} w={Math.max(part.size[0], part.size[2])} h={part.size[1]} wireframe={wireframe} />
    : <meshStandardMaterial color={finish?.hex ?? part.color} roughness={part.rough ?? 0.7} metalness={part.metal ?? 0} wireframe={wireframe} />;

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
            {finish?.imageUrl
              ? <FinishMaterial finish={finish} fallback={fallback} w={1} h={1} wireframe={wireframe} />
              : <meshStandardMaterial color={finish?.hex ?? fallback} roughness={BOARD_DEFAULT[slot].rough} wireframe={wireframe} />}
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
      {extras.map((q, i) => (
        <mesh key={`x${i}`} {...common} position={q.pos}>
          <boxGeometry args={q.size} />
          <PartMaterial part={q} finish={q.slot ? finishes[q.slot] : null} wireframe={wireframe} />
        </mesh>
      ))}
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
      {list.map((q, i) => (q.round
        ? (
          <RoundedBox key={i} {...common} args={q.size} radius={Math.min(q.round, Math.min(...q.size) / 2 - 0.0005)} smoothness={3} position={q.pos}>
            <PartMaterial part={q} finish={q.slot ? finishes[q.slot] : null} wireframe={wireframe} />
          </RoundedBox>
        ) : (
          <mesh key={i} {...common} position={q.pos}>
            <boxGeometry args={q.size} />
            <PartMaterial part={q} finish={q.slot ? finishes[q.slot] : null} wireframe={wireframe} />
          </mesh>
        )))}
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
