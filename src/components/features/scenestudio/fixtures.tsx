import React, { useEffect, useMemo } from 'react';
import {
  CanvasTexture, CatmullRomCurve3, DoubleSide, LatheGeometry, PlaneGeometry, SRGBColorSpace, TubeGeometry, Vector2, Vector3, type BufferGeometry,
} from 'three';
import { seeded } from '@/lib/scene/fixturePlan';
import { partGeometry } from '@/lib/scene/partGeometry';

export type Common = { castShadow: boolean; receiveShadow: boolean; userData: Record<string, unknown> };
type V3 = [number, number, number];
interface Look { color: string; roughness: number; metalness: number }

const CHROME: Look = { color: '#c9cdd1', roughness: 0.18, metalness: 0.95 };
const BLACK_GLASS: Look = { color: '#0d0e10', roughness: 0.06, metalness: 0.1 };
const INOX: Look = { color: '#b4b8bc', roughness: 0.32, metalness: 0.9 };
const IRON: Look = { color: '#2b2a28', roughness: 0.4, metalness: 0.7 };

const Box: React.FC<{ size: V3; pos: V3; round?: number; look: Look; common: Common }> = ({ size, pos, round, look, common }) => {
  const g = useMemo(() => partGeometry(size, round), [size.join(), round]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh {...common} geometry={g} position={pos}><meshStandardMaterial {...look} /></mesh>;
};

const Tube: React.FC<{ points: V3[]; radius: number; look: Look; common: Common }> = ({ points, radius, look, common }) => {
  const g = useMemo(() => new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 40, radius, 12), [points.flat().join(), radius]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh {...common} geometry={g}><meshStandardMaterial {...look} /></mesh>;
};

/** A steel bowl in the cut-out of a worktop, with its tap behind it. */
export const SinkBowl: React.FC<{ x: number; z: number; top: number; w: number; d: number; common: Common }> = ({ x, z, top, w, d, common }) => {
  const deep = 0.18; const t = 0.006;
  return (
    <group position={[x, top, z]}>
      <Box size={[w, t, d]} pos={[0, -deep, 0]} look={INOX} common={common} />
      {[-1, 1].map((s) => <Box key={`x${s}`} size={[t, deep, d]} pos={[s * (w / 2 - t / 2), -deep / 2, 0]} look={INOX} common={common} />)}
      {[-1, 1].map((s) => <Box key={`z${s}`} size={[w, deep, t]} pos={[0, -deep / 2, s * (d / 2 - t / 2)]} look={INOX} common={common} />)}
      <mesh {...common} position={[0, -deep + 0.006, 0]}><cylinderGeometry args={[0.04, 0.04, 0.006, 24]} /><meshStandardMaterial {...CHROME} /></mesh>
      <group position={[0, 0, -d / 2 - 0.045]}>
        <mesh {...common} position={[0, 0.02, 0]}><cylinderGeometry args={[0.024, 0.027, 0.04, 24]} /><meshStandardMaterial {...CHROME} /></mesh>
        <Tube points={[[0, 0.02, 0], [0, 0.22, 0], [0, 0.33, 0.04], [0, 0.35, 0.11], [0, 0.31, 0.18], [0, 0.27, 0.19]]} radius={0.011} look={CHROME} common={common} />
        <Tube points={[[0.02, 0.05, 0], [0.05, 0.07, 0], [0.085, 0.09, 0]]} radius={0.006} look={CHROME} common={common} />
      </group>
    </group>
  );
};

export const Hob: React.FC<{ x: number; z: number; top: number; w: number; d: number; common: Common }> = ({ x, z, top, w, d, common }) => (
  <group position={[x, top + 0.003, z]}>
    <Box size={[w, 0.006, d]} pos={[0, 0, 0]} look={BLACK_GLASS} common={common} />
    {([[-0.25, -0.22, 0.09], [0.25, -0.22, 0.075], [-0.25, 0.2, 0.075], [0.25, 0.2, 0.1]] as V3[]).map(([u, v, r], i) => (
      <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[u * w, 0.0036, v * d]} userData={common.userData}>
        <ringGeometry args={[r - 0.0025, r, 48]} />
        <meshStandardMaterial color="#8a8d90" roughness={0.4} />
      </mesh>
    ))}
  </group>
);

/** What makes a black opening read as an oven: glass door, bar handle, control strip. */
export const OvenFace: React.FC<{ pos: V3; size: V3; common: Common }> = ({ pos, size: [w, h, d], common }) => {
  const z = d / 2; const strip = Math.min(0.11, h * 0.2); const bar = h / 2 - strip - 0.045;
  return (
    <group position={pos}>
      <Box size={[w - 0.004, strip, 0.02]} pos={[0, h / 2 - strip / 2, z + 0.01]} look={INOX} common={common} />
      <Box size={[0.12, strip * 0.42, 0.002]} pos={[0, h / 2 - strip / 2, z + 0.021]} look={BLACK_GLASS} common={common} />
      {[-1, 1].map((s) => (
        <mesh key={s} {...common} rotation={[Math.PI / 2, 0, 0]} position={[s * w * 0.32, h / 2 - strip / 2, z + 0.03]}>
          <cylinderGeometry args={[0.018, 0.02, 0.022, 24]} /><meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
      <Box size={[w - 0.004, h - strip - 0.006, 0.02]} pos={[0, -strip / 2 - 0.003, z + 0.01]} round={0.003} look={BLACK_GLASS} common={common} />
      <Tube points={[[-w * 0.4, bar, z + 0.055], [0, bar, z + 0.055], [w * 0.4, bar, z + 0.055]]} radius={0.008} look={CHROME} common={common} />
      {[-1, 1].map((s) => <Box key={`b${s}`} size={[0.012, 0.012, 0.04]} pos={[s * w * 0.37, bar, z + 0.037]} look={CHROME} common={common} />)}
    </group>
  );
};

export const HoodVisor: React.FC<{ x: number; w: number; d: number; common: Common }> = ({ x, w, d, common }) => (
  <group position={[x, 0, 0]}>
    <Box size={[w - 0.004, 0.03, d + 0.02]} pos={[0, -0.016, 0.01]} look={INOX} common={common} />
    <mesh position={[0, -0.032, 0.02]} rotation={[Math.PI / 2, 0, 0]} userData={common.userData}>
      <planeGeometry args={[w * 0.7, 0.05]} />
      <meshStandardMaterial color="#fff4dd" emissive="#ffe3b0" emissiveIntensity={2.2} />
    </mesh>
  </group>
);

function pleats(w: number, h: number, waves: number, amp: number, seed: number): BufferGeometry {
  const g = new PlaneGeometry(w, h, waves * 12, 10);
  const pos = g.getAttribute('position'); const uv = g.getAttribute('uv');
  const rnd = seeded(seed);
  const deep = Array.from({ length: waves + 1 }, () => 0.75 + rnd() * 0.5);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5; const v = pos.getY(i) / h + 0.5;
    const at = u * waves; const low = 1 - v;
    pos.setZ(i, Math.sin(at * Math.PI * 2) * amp * deep[Math.min(waves, Math.round(at))] * (0.7 + 0.3 * low) + Math.sin(at * Math.PI * 0.9 + seed) * amp * 0.35 * low);
    uv.setXY(i, u * w * 1.6, v * h);
  }
  g.computeVertexNormals();
  return g;
}

/** Two gathered drapes and a sheer on a rod, the sheer across the whole opening. */
export const Curtain: React.FC<{ w: number; d: number; h: number; wireframe: boolean; common: Common; fabric: React.ReactNode }> = ({ w, d, h, wireframe, common, fabric }) => {
  const drape = Math.min(0.55, w * 0.22);
  const amp = Math.min(0.04, d * 0.22);
  const left = useMemo(() => pleats(drape, h - 0.03, 5, amp, 3), [drape, h, amp]);
  const right = useMemo(() => pleats(drape, h - 0.03, 5, amp, 11), [drape, h, amp]);
  const sheer = useMemo(() => pleats(w - 0.1, h - 0.04, Math.max(6, Math.round(w * 7)), amp * 0.3, 7), [w, h, amp]);
  useEffect(() => () => { left.dispose(); right.dispose(); sheer.dispose(); }, [left, right, sheer]);
  return (
    <group>
      <mesh {...common} geometry={left} position={[-(w / 2 - drape / 2), (h - 0.03) / 2 + 0.005, d * 0.2]}>{fabric}</mesh>
      <mesh {...common} geometry={right} position={[w / 2 - drape / 2, (h - 0.03) / 2 + 0.005, d * 0.2]}>{fabric}</mesh>
      <mesh geometry={sheer} position={[0, (h - 0.04) / 2 + 0.01, -d * 0.3]} userData={common.userData}>
        <meshStandardMaterial color="#fdfbf6" roughness={1} transparent opacity={0.34} side={DoubleSide} depthWrite={false} wireframe={wireframe} />
      </mesh>
      <mesh {...common} rotation={[0, 0, Math.PI / 2]} position={[0, h - 0.012, d * 0.2]}><cylinderGeometry args={[0.011, 0.011, w + 0.16, 16]} /><meshStandardMaterial {...IRON} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} {...common} position={[s * (w / 2 + 0.08), h - 0.012, d * 0.2]}><sphereGeometry args={[0.02, 20, 14]} /><meshStandardMaterial {...IRON} /></mesh>)}
    </group>
  );
};

const Turned: React.FC<{ pts: Array<[number, number]>; common: Common; y?: number; children: React.ReactNode }> = ({ pts, common, y = 0, children }) => {
  const g = useMemo(() => new LatheGeometry(pts.map(([a, b]) => new Vector2(a, b)), 40), [pts.flat().join()]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh {...common} geometry={g} position={[0, y, 0]}>{children}</mesh>;
};

const Bulb: React.FC<{ y: number; r: number; common: Common }> = ({ y, r, common }) => (
  <mesh position={[0, y, 0]} userData={common.userData}><sphereGeometry args={[r, 20, 14]} /><meshStandardMaterial color="#fff3dc" emissive="#ffd59a" emissiveIntensity={5} /></mesh>
);

/** A floor lamp when tall, a table lamp when not. */
export const Lamp: React.FC<{ w: number; h: number; baseHex?: string | null; shadeHex?: string | null; wireframe: boolean; common: Common }> = ({ w, h, baseHex, shadeHex, wireframe, common }) => {
  const floor = h > 0.9;
  const shadeH = floor ? Math.min(0.32, h * 0.22) : h * 0.45;
  const r = w / 2; const stem = h - shadeH;
  const base = <meshStandardMaterial color={baseHex ?? (floor ? IRON.color : '#d8cfc2')} roughness={floor ? 0.4 : 0.55} metalness={floor ? 0.7 : 0} side={DoubleSide} wireframe={wireframe} />;
  return (
    <group>
      {floor ? (
        <>
          <mesh {...common} position={[0, 0.012, 0]}><cylinderGeometry args={[r * 0.6, r * 0.62, 0.024, 40]} />{base}</mesh>
          <mesh {...common} position={[0, stem / 2, 0]}><cylinderGeometry args={[0.011, 0.011, stem + 0.1, 16]} />{base}</mesh>
        </>
      ) : (
        <Turned pts={[[0, 0], [r * 0.42, 0], [r * 0.5, stem * 0.12], [r * 0.62, stem * 0.42], [r * 0.46, stem * 0.72], [r * 0.16, stem * 0.9], [r * 0.12, stem]]} common={common}>{base}</Turned>
      )}
      <Turned pts={[[r, 0], [r * 0.8, shadeH]]} common={common} y={stem}>
        <meshStandardMaterial color={shadeHex ?? '#f3e9d8'} roughness={0.95} emissive="#ffcf8f" emissiveIntensity={0.35} side={DoubleSide} wireframe={wireframe} />
      </Turned>
      <Bulb y={stem + shadeH * 0.45} r={Math.min(0.03, r * 0.3)} common={common} />
    </group>
  );
};

export const Pendant: React.FC<{ w: number; h: number; hex: string; wireframe: boolean; common: Common }> = ({ w, h, hex, wireframe, common }) => {
  const r = w / 2; const shade = Math.min(r * 1.1, h * 0.5);
  return (
    <group>
      <mesh {...common} position={[0, (h + shade) / 2, 0]}><cylinderGeometry args={[0.003, 0.003, h - shade, 8]} /><meshStandardMaterial color="#1c1b1a" roughness={0.8} /></mesh>
      <mesh {...common} position={[0, h - 0.012, 0]}><cylinderGeometry args={[0.05, 0.05, 0.024, 32]} /><meshStandardMaterial {...IRON} /></mesh>
      <Turned pts={[[r, 0], [r * 0.97, shade * 0.28], [r * 0.82, shade * 0.6], [r * 0.5, shade * 0.86], [0.03, shade], [0.018, shade * 1.06]]} common={common}>
        <meshStandardMaterial color={hex} roughness={0.5} side={DoubleSide} wireframe={wireframe} />
      </Turned>
      <Bulb y={shade * 0.35} r={Math.min(0.045, r * 0.3)} common={common} />
    </group>
  );
};

/** An abstract print in the colours of the room; one size always gets the same picture. */
function print(w: number, h: number, colour: string, seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  const k = 640 / Math.max(w, h);
  c.width = Math.max(64, Math.round(w * k)); c.height = Math.max(64, Math.round(h * k));
  const x = c.getContext('2d')!;
  const rnd = seeded(seed);
  x.fillStyle = '#efe7da'; x.fillRect(0, 0, c.width, c.height);
  const tones = [colour, '#c9a27a', '#37474f', '#d9c7ae', '#8a5a44'];
  for (let i = 0; i < 6; i++) {
    x.globalAlpha = 0.55 + rnd() * 0.4;
    x.fillStyle = tones[Math.floor(rnd() * tones.length)];
    x.beginPath();
    if (i % 3 === 0) {
      x.arc(c.width * (0.25 + rnd() * 0.5), c.height * (0.2 + rnd() * 0.45), c.width * (0.1 + rnd() * 0.2), 0, Math.PI * 2);
    } else {
      const y = c.height * (0.35 + rnd() * 0.55); const sway = c.height * (0.05 + rnd() * 0.16); const deep = c.height * (0.06 + rnd() * 0.25);
      x.moveTo(0, y);
      x.bezierCurveTo(c.width * 0.3, y - sway, c.width * 0.6, y + sway, c.width, y - sway * 0.4);
      x.lineTo(c.width, y + deep); x.lineTo(0, y + deep);
    }
    x.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const Picture: React.FC<{ w: number; h: number; colour: string; mirror: boolean; wireframe: boolean; common: Common }> = ({ w, h, colour, mirror, wireframe, common }) => {
  const bar = mirror ? 0.018 : 0.022;
  const mat = mirror ? 0 : Math.min(0.07, Math.min(w, h) * 0.12);
  const iw = w - bar * 2; const ih = h - bar * 2;
  const art = useMemo(() => (mirror ? null : print(iw - mat * 2, ih - mat * 2, colour, Math.round(w * 1000) * 31 + Math.round(h * 1000))), [mirror, iw, ih, mat, colour, w, h]);
  useEffect(() => () => art?.dispose(), [art]);
  const frame: Look = { color: mirror ? '#b89b6a' : '#2a2622', roughness: 0.45, metalness: mirror ? 0.7 : 0.05 };
  return (
    <group position={[0, h / 2, 0]}>
      {[-1, 1].map((s) => <Box key={`x${s}`} size={[bar, h, 0.03]} pos={[s * (w / 2 - bar / 2), 0, 0]} look={frame} common={common} />)}
      {[-1, 1].map((s) => <Box key={`y${s}`} size={[w, bar, 0.03]} pos={[0, s * (h / 2 - bar / 2), 0]} look={frame} common={common} />)}
      <mesh {...common} position={[0, 0, 0.002]}>
        <planeGeometry args={[iw, ih]} />
        <meshStandardMaterial color={mirror ? '#eef1f3' : '#f7f4ee'} roughness={mirror ? 0.02 : 0.95} metalness={mirror ? 1 : 0} wireframe={wireframe} />
      </mesh>
      {art && <mesh {...common} position={[0, 0, 0.004]}><planeGeometry args={[iw - mat * 2, ih - mat * 2]} /><meshStandardMaterial map={art} roughness={0.85} wireframe={wireframe} /></mesh>}
    </group>
  );
};

/** A worktop slab, or the pieces left around a sink cut-out; the pattern runs on across the joints. */
export function worktopGeometry(pieces: Array<{ pos: V3; size: V3 }>): BufferGeometry[] {
  return pieces.map(({ pos, size }) => {
    const g = partGeometry(size);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + pos[0], uv.getY(i) + pos[2]);
    return g;
  });
}
