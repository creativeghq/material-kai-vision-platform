/** What makes the 3D room read as a real interior: light, default surfaces, and real shapes for every object kind. */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, DoubleSide, PMREMGenerator, RepeatWrapping, SRGBColorSpace, type Mesh, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
export const Ceiling: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => {
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.y < height - 0.05;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]} visible={false}>
      {children}
      <meshStandardMaterial color="#f4f2ee" roughness={0.95} side={DoubleSide} />
    </mesh>
  );
};

type Common = { castShadow: boolean; receiveShadow: boolean; userData: Record<string, unknown> };
type Part = { pos: [number, number, number]; size: [number, number, number]; color: string; rough?: number; metal?: number; round?: number };

const WOOD = '#9c7550';
const WHITE = '#f2efe9';
const STEEL = '#c3c7cc';
const STONE = '#e9e5de';
const DARK = '#3b3a38';

function parts(kind: string, w: number, d: number, h: number, c: string): Part[] {
  const p: Part[] = [];
  const legs = (top: number, inset: number, t: number, color: string) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.push({ pos: [sx * (w / 2 - inset), top / 2, sz * (d / 2 - inset)], size: [t, top, t], color });
    }
  };
  const fronts = (y0: number, y1: number, z: number, color: string, cols: number, rows = 1, handleColor = STEEL) => {
    const gap = 0.004;
    const fw = w / cols; const fh = (y1 - y0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = -w / 2 + fw * (i + 0.5); const cy = y0 + fh * (j + 0.5);
      p.push({ pos: [cx, cy, z], size: [fw - gap * 2, fh - gap * 2, 0.018], color, rough: 0.35 });
      p.push({ pos: [cx, rows > 1 ? cy + fh * 0.36 : y1 - 0.07, z + 0.02], size: [Math.min(0.16, fw * 0.5), 0.012, 0.02], color: handleColor, metal: 0.8, rough: 0.25 });
    }
  };
  switch (kind) {
    case 'sofa':
    case 'armchair': {
      const seatH = Math.min(0.45, h * 0.55); const back = Math.min(0.2, d * 0.22); const arm = Math.min(0.16, w * 0.12);
      legs(0.08, 0.06, 0.04, WOOD);
      p.push({ pos: [0, 0.08 + (seatH - 0.08) / 2 - 0.06, 0], size: [w, seatH - 0.2, d], color: c, rough: 0.95, round: 0.03 });
      const seats = kind === 'sofa' ? Math.max(2, Math.round((w - arm * 2) / 0.8)) : 1;
      const sw = (w - arm * 2) / seats;
      for (let i = 0; i < seats; i++) p.push({ pos: [-w / 2 + arm + sw * (i + 0.5), seatH - 0.08, back / 2 + 0.01], size: [sw - 0.01, 0.16, d - back - 0.02], color: c, rough: 0.95, round: 0.05 });
      p.push({ pos: [0, (seatH + h) / 2 - 0.05, -d / 2 + back / 2], size: [w, h - seatH + 0.1, back], color: c, rough: 0.95, round: 0.05 });
      for (const sx of [-1, 1]) p.push({ pos: [sx * (w / 2 - arm / 2), seatH * 0.75, 0], size: [arm, seatH * 0.7 + 0.12, d], color: c, rough: 0.95, round: 0.04 });
      return p;
    }
    case 'bed': {
      const head = Math.max(0.9, h); const frameH = 0.28;
      p.push({ pos: [0, frameH / 2, 0], size: [w, frameH, d], color: c, rough: 0.9, round: 0.02 });
      p.push({ pos: [0, frameH + 0.11, 0.02], size: [w - 0.05, 0.22, d - 0.08], color: '#fbfaf7', rough: 0.95, round: 0.05 });
      p.push({ pos: [0, frameH + 0.235, d * 0.15], size: [w - 0.02, 0.05, d * 0.68], color: '#e4dccf', rough: 0.95, round: 0.03 });
      for (const sx of [-1, 1]) p.push({ pos: [sx * w * 0.24, frameH + 0.28, -d / 2 + 0.3], size: [w * 0.42, 0.13, 0.4], color: '#ffffff', rough: 0.95, round: 0.05 });
      p.push({ pos: [0, head / 2, -d / 2 + 0.04], size: [w + 0.04, head, 0.08], color: c, rough: 0.9, round: 0.02 });
      return p;
    }
    case 'dining_table':
    case 'coffee_table':
    case 'side_table':
    case 'desk': {
      const top = 0.035;
      p.push({ pos: [0, h - top / 2, 0], size: [w, top, d], color: kind === 'dining_table' || kind === 'desk' ? WOOD : c, rough: 0.5, round: 0.008 });
      legs(h - top, 0.06, 0.05, DARK);
      return p;
    }
    case 'chair':
    case 'stool': {
      const seat = Math.min(0.46, h * 0.6);
      p.push({ pos: [0, seat, 0], size: [w, 0.04, d], color: c, rough: 0.6, round: 0.01 });
      legs(seat - 0.02, 0.04, 0.035, WOOD);
      if (kind === 'chair') p.push({ pos: [0, (seat + h) / 2, -d / 2 + 0.02], size: [w, h - seat, 0.035], color: c, rough: 0.6, round: 0.01 });
      return p;
    }
    case 'kitchen_base':
    case 'island':
    case 'sink': {
      const plinth = 0.1; const wt = 0.04; const carcassTop = h - wt;
      p.push({ pos: [0, plinth / 2, 0.02], size: [w, plinth, d - 0.06], color: DARK, rough: 0.8 });
      p.push({ pos: [0, plinth + (carcassTop - plinth) / 2, 0], size: [w, carcassTop - plinth, d - 0.02], color: c, rough: 0.5 });
      fronts(plinth, carcassTop, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), 1);
      p.push({ pos: [0, h - wt / 2, 0.01], size: [w + 0.02, wt, d + 0.02], color: STONE, rough: 0.3 });
      if (kind === 'sink') {
        p.push({ pos: [0, h + 0.004, 0], size: [Math.min(0.55, w * 0.8), 0.01, Math.min(0.42, d * 0.7)], color: STEEL, metal: 0.8, rough: 0.2 });
        p.push({ pos: [0, h + 0.15, -d / 2 + 0.08], size: [0.03, 0.3, 0.03], color: STEEL, metal: 0.9, rough: 0.2 });
      }
      return p;
    }
    case 'kitchen_wall':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d - 0.02], color: c, rough: 0.5 });
      fronts(0, h, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), 1);
      return p;
    case 'kitchen_tall':
    case 'wardrobe':
      p.push({ pos: [0, 0.05, 0.02], size: [w, 0.1, d - 0.06], color: DARK, rough: 0.8 });
      p.push({ pos: [0, 0.1 + (h - 0.1) / 2, 0], size: [w, h - 0.1, d - 0.02], color: c, rough: 0.5 });
      fronts(0.1, h, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), kind === 'kitchen_tall' ? 2 : 1);
      return p;
    case 'cabinet':
    case 'nightstand':
    case 'tv_unit':
    case 'vanity':
      legs(0.1, 0.04, 0.03, DARK);
      p.push({ pos: [0, 0.1 + (h - 0.1) / 2, 0], size: [w, h - 0.1, d], color: c, rough: 0.45, round: 0.01 });
      fronts(0.1, h, d / 2 + 0.004, c, Math.max(1, Math.round(w / 0.5)), kind === 'nightstand' ? 2 : 1);
      return p;
    case 'shelving':
      for (const sx of [-1, 1]) p.push({ pos: [sx * (w / 2 - 0.01), h / 2, 0], size: [0.02, h, d], color: c, rough: 0.6 });
      for (let i = 0; i <= 4; i++) p.push({ pos: [0, (h - 0.02) * (i / 4) + 0.01, 0], size: [w, 0.02, d], color: c, rough: 0.6 });
      return p;
    case 'appliance':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: STEEL, metal: 0.6, rough: 0.3 });
      p.push({ pos: [0, h * 0.62, d / 2 + 0.003], size: [w * 0.86, h * 0.3, 0.006], color: '#1d1f22', rough: 0.15 });
      return p;
    case 'toilet':
      p.push({ pos: [0, 0.2, d * 0.1], size: [w * 0.9, 0.4, d * 0.75], color: '#fbfbfb', rough: 0.15, round: 0.08 });
      p.push({ pos: [0, Math.max(0.6, h) - 0.2, -d / 2 + 0.09], size: [w, 0.4, 0.18], color: '#fbfbfb', rough: 0.15, round: 0.04 });
      return p;
    case 'bathtub':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: '#fbfbfb', rough: 0.15, round: 0.04 });
      p.push({ pos: [0, h - 0.02, 0], size: [w - 0.12, 0.03, d - 0.12], color: '#e6ecef', rough: 0.1 });
      return p;
    case 'shower':
      p.push({ pos: [0, 0.03, 0], size: [w, 0.06, d], color: '#fbfbfb', rough: 0.2 });
      p.push({ pos: [0, h / 2, d / 2], size: [w, h, 0.01], color: '#cfe3ec', rough: 0.05 });
      return p;
    case 'rug':
      p.push({ pos: [0, 0.006, 0], size: [w, 0.012, d], color: c, rough: 1 });
      return p;
    case 'lamp':
      p.push({ pos: [0, 0.015, 0], size: [w * 0.5, 0.03, w * 0.5], color: DARK, rough: 0.5, round: 0.01 });
      p.push({ pos: [0, h * 0.4, 0], size: [0.025, h * 0.8, 0.025], color: DARK, metal: 0.6, rough: 0.4 });
      p.push({ pos: [0, h * 0.86, 0], size: [w, h * 0.28, w], color: '#f6eedd', rough: 0.9, round: 0.02 });
      return p;
    case 'tv':
      p.push({ pos: [0, h / 2, 0], size: [w, h, 0.04], color: '#111214', rough: 0.2 });
      return p;
    case 'artwork':
    case 'mirror':
      p.push({ pos: [0, h / 2, 0], size: [w, h, 0.03], color: DARK, rough: 0.6 });
      p.push({ pos: [0, h / 2, 0.018], size: [w - 0.06, h - 0.06, 0.006], color: kind === 'mirror' ? '#dfe6ea' : c, rough: kind === 'mirror' ? 0.05 : 0.8, metal: kind === 'mirror' ? 0.9 : 0 });
      return p;
    case 'radiator':
      for (let x = -w / 2 + 0.04; x < w / 2; x += 0.08) p.push({ pos: [x, h / 2, 0], size: [0.05, h, d], color: WHITE, rough: 0.4 });
      return p;
    case 'curtain':
      for (let x = -w / 2 + 0.05; x < w / 2; x += 0.1) p.push({ pos: [x, h / 2, (Math.round(x * 10) % 2) * 0.03], size: [0.09, h, 0.03], color: c, rough: 1 });
      return p;
    case 'stairs': {
      const steps = Math.max(3, Math.round(h / 0.18));
      for (let i = 0; i < steps; i++) p.push({ pos: [0, (h / steps) * (i + 0.5), -d / 2 + (d / steps) * (i + 0.5)], size: [w, h / steps, d / steps], color: WOOD, rough: 0.6 });
      return p;
    }
    default:
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: c, rough: 0.7, round: Math.min(0.04, Math.min(w, d, h) * 0.15) });
      return p;
  }
}

/** The detailed body of one object; every part carries the object's id so picking and the ID pass still work. */
export const ObjectShape: React.FC<{ kind: string; w: number; d: number; h: number; colour: string; wireframe: boolean; common: Common }> = ({ kind, w, d, h, colour, wireframe, common }) => {
  const list = useMemo(() => parts(kind, w, d, h, colour), [kind, w, d, h, colour]);
  if (kind === 'plant') {
    return (
      <group>
        <mesh {...common} position={[0, h * 0.12, 0]}><cylinderGeometry args={[w * 0.28, w * 0.22, h * 0.24, 20]} /><meshStandardMaterial color="#d9d3c9" roughness={0.8} wireframe={wireframe} /></mesh>
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
        <mesh {...common} position={[0, h * 0.35, 0]}><coneGeometry args={[w * 0.5, h * 0.3, 24, 1, true]} /><meshStandardMaterial color={colour} roughness={0.5} side={DoubleSide} emissive="#ffe9c4" emissiveIntensity={0.15} wireframe={wireframe} /></mesh>
      </group>
    );
  }
  return (
    <group>
      {list.map((q, i) => (q.round
        ? (
          <RoundedBox key={i} {...common} args={q.size} radius={Math.min(q.round, Math.min(...q.size) / 2 - 0.0005)} smoothness={3} position={q.pos}>
            <meshStandardMaterial color={q.color} roughness={q.rough ?? 0.7} metalness={q.metal ?? 0} wireframe={wireframe} />
          </RoundedBox>
        ) : (
          <mesh key={i} {...common} position={q.pos}>
            <boxGeometry args={q.size} />
            <meshStandardMaterial color={q.color} roughness={q.rough ?? 0.7} metalness={q.metal ?? 0} wireframe={wireframe} />
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
