import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { GuideBuild } from '@/lib/installation/guideBuild';
import type { GuideRoom } from '@/lib/installation/guideSchema';
import { applyHomography, computeHomography, invertHomography, type Pt } from '@/lib/surfaceRenderer/homography';

/** The photographed back wall, straightened to a flat elevation and placed in metres around the product. */
export interface PhotoElevation {
  map: THREE.Texture;
  x0: number;
  width: number;
  height: number;
  zWall: number;
  topIsCeiling: boolean;
  wall: string;
  floor: string;
  left: { color: string } | null;
  right: { color: string } | null;
}

const PX_PER_M = 420;
const EDGE = 0.015;

export function usePhotoElevation(room: GuideRoom | null | undefined, photoUrl: string | null, build: GuideBuild): PhotoElevation | null {
  const url = room?.plate_url ?? photoUrl;
  const quad = room?.wall_outline ?? null;
  const front = room?.front ?? null;
  const [elevation, setElevation] = useState<PhotoElevation | null>(null);
  const key = `${url}|${quad?.map((p) => `${p.x},${p.y}`).join(';')}|${front?.map((p) => `${p.x},${p.y}`).join(';')}`;
  useEffect(() => {
    setElevation(null);
    if (!url || !quad || quad.length !== 4 || !build.hasAssembly) return;
    let live = true;
    let made: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!live) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const [bl, br, tr, tl] = quad.map((p) => ({ x: p.x * iw, y: p.y * ih }));
      let H;
      try {
        H = computeHomography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], [tl, tr, br, bl]);
      } catch {
        return;
      }
      const toWall = invertHomography(H);
      const alongFloor = (px: number) => {
        const t = (px - bl.x) / (br.x - bl.x || 1);
        return applyHomography(toWall, { x: px, y: bl.y + t * (br.y - bl.y) }).x;
      };
      const leftCorner = Math.min(bl.x, tl.x) / iw > EDGE;
      const rightCorner = Math.max(br.x, tr.x) / iw < 1 - EDGE;
      const fx = front ? front.map((p) => p.x * iw) : [bl.x, br.x];
      let uL = alongFloor(Math.min(...fx));
      let uR = alongFloor(Math.max(...fx));
      if (leftCorner && uL < 0.08) uL = 0;
      if (rightCorner && uR > 0.92) uR = 1;
      const p = build.product;
      const width = p.size.x / Math.max(0.05, uR - uL);
      const span = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
      const height = width * ((span(bl, tl) + span(br, tr)) / 2) / ((span(tl, tr) + span(bl, br)) / 2);
      if (!(width > 0.3 && width < 20 && height > 0.5 && height < 8)) return;

      const k = Math.min(PX_PER_M, 2048 / width, 2048 / height);
      const cw = Math.max(2, Math.round(width * k));
      const ch = Math.max(2, Math.round(height * k));
      const src = document.createElement('canvas');
      src.width = iw;
      src.height = ih;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d');
      if (!sctx || !octx) return;
      sctx.drawImage(img, 0, 0);
      let px: Uint8ClampedArray;
      try {
        px = sctx.getImageData(0, 0, iw, ih).data;
      } catch {
        return;
      }
      const topIsCeiling = Math.min(tl.y, tr.y) / ih > EDGE;
      const fadeY = topIsCeiling ? 0 : ch * 0.08;
      const fadeL = leftCorner ? 0 : cw * 0.1;
      const fadeR = rightCorner ? 0 : cw * 0.1;
      const dst = octx.createImageData(cw, ch);
      const band: number[][] = [[], [], []];
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const q = applyHomography(H, { x: (x + 0.5) / cw, y: (y + 0.5) / ch });
          const inside = q.x >= 0 && q.x < iw && q.y >= 0 && q.y < ih;
          const si = (Math.min(ih - 1, Math.max(0, Math.round(q.y))) * iw + Math.min(iw - 1, Math.max(0, Math.round(q.x)))) * 4;
          const di = (y * cw + x) * 4;
          dst.data[di] = px[si];
          dst.data[di + 1] = px[si + 1];
          dst.data[di + 2] = px[si + 2];
          const f = Math.min(1, fadeY ? y / fadeY : 1, fadeL ? x / fadeL : 1, fadeR ? (cw - 1 - x) / fadeR : 1);
          dst.data[di + 3] = inside ? Math.round(255 * f * f * (3 - 2 * f)) : 0;
          if (inside && y > ch * 0.12 && y < ch * 0.2 && (x + y) % 4 === 0) {
            band[0].push(px[si]);
            band[1].push(px[si + 1]);
            band[2].push(px[si + 2]);
          }
        }
      }
      octx.putImageData(dst, 0, 0);
      const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 220);
      const hex = (c: number[][]) => `#${c.map((ch2) => median(ch2).toString(16).padStart(2, '0')).join('')}`;
      const beside = (edgeX: number, dir: -1 | 1) => {
        const acc: number[][] = [[], [], []];
        const y0 = Math.max(0, Math.round(Math.min(tl.y, tr.y) + (bl.y - tl.y) * 0.25));
        const y1 = Math.min(ih - 1, Math.round(Math.min(bl.y, br.y) - (bl.y - tl.y) * 0.25));
        for (let y = y0; y < y1; y += 4) {
          for (let d = iw * 0.01; d < iw * 0.05; d += 3) {
            const x = Math.round(edgeX + dir * d);
            if (x < 0 || x >= iw) break;
            const i = (y * iw + x) * 4;
            acc[0].push(px[i]);
            acc[1].push(px[i + 1]);
            acc[2].push(px[i + 2]);
          }
        }
        return hex(acc);
      };
      const map = new THREE.CanvasTexture(out);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      made = map;
      setElevation({
        map,
        x0: p.center.x - p.size.x / 2 - uL * width,
        width,
        height,
        zWall: p.center.z - p.size.z / 2,
        topIsCeiling,
        wall: hex(band),
        floor: room?.floor ?? '#d9d3c9',
        left: leftCorner ? { color: beside(Math.min(bl.x, tl.x), -1) } : null,
        right: rightCorner ? { color: beside(Math.max(br.x, tr.x), 1) } : null,
      });
    };
    img.src = url;
    return () => {
      live = false;
      made?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, build.product, build.hasAssembly]);
  return elevation;
}

function SideWall({ x, z, depth, height, turn, color }: { x: number; z: number; depth: number; height: number; turn: number; color: string }) {
  const camera = useThree((st) => st.camera);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, toneMapped: false }), [color]);
  const skirting = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7f6f3', roughness: 0.6 }), []);
  useEffect(() => () => { material.dispose(); skirting.dispose(); }, [material, skirting]);
  useFrame((_, delta) => {
    const inward = turn > 0 ? camera.position.x - x : x - camera.position.x;
    const want = inward < -0.1 ? 0.1 : 1;
    for (const m of [material, skirting]) {
      m.opacity += (want - m.opacity) * (1 - Math.exp(-delta * 8));
      m.transparent = m.opacity < 0.99;
      m.depthWrite = !m.transparent;
    }
  });
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, height / 2, 0]} material={material}>
        <planeGeometry args={[depth, height]} />
      </mesh>
      <mesh position={[0, 0.045, 0.008]} material={skirting}>
        <boxGeometry args={[depth, 0.09, 0.016]} />
      </mesh>
    </group>
  );
}

export function ElevationRoom({ elevation, build }: { elevation: PhotoElevation; build: GuideBuild }) {
  const e = elevation;
  const roomH = Math.max(2.5, e.topIsCeiling ? e.height : e.height + 0.4);
  const kitFront = build.kitBounds.center.z + build.kitBounds.size.z / 2;
  const depth = Math.max(4, kitFront - e.zWall + 2.5);
  const alcove = build.product.size.z + 0.45;
  const xL = e.x0;
  const xR = e.x0 + e.width;
  const cx = (xL + xR) / 2;
  const reach = Math.max(4, build.kitBounds.size.x / 2 + 2);
  const floorColor = useMemo(() => new THREE.Color(e.floor), [e.floor]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, e.zWall + depth / 2]} receiveShadow>
        <planeGeometry args={[xR - xL + reach * 2, depth]} />
        <meshStandardMaterial color={floorColor} roughness={0.7} />
      </mesh>
      <mesh position={[cx, roomH / 2, e.zWall - 0.004]}>
        <planeGeometry args={[xR - xL, roomH]} />
        <meshBasicMaterial color={e.wall} toneMapped={false} />
      </mesh>
      <mesh position={[e.x0 + e.width / 2, e.height / 2, e.zWall - 0.002]}>
        <planeGeometry args={[e.width, e.height]} />
        <meshBasicMaterial key={e.map.uuid} map={e.map} transparent toneMapped={false} />
      </mesh>
      <mesh position={[cx, roomH / 2, e.zWall]} receiveShadow>
        <planeGeometry args={[xR - xL, roomH]} />
        <shadowMaterial transparent opacity={0.18} />
      </mesh>
      {e.left && <SideWall x={xL} z={e.zWall + alcove / 2} depth={alcove} height={roomH} turn={Math.PI / 2} color={e.left.color} />}
      {e.right && <SideWall x={xR} z={e.zWall + alcove / 2} depth={alcove} height={roomH} turn={-Math.PI / 2} color={e.right.color} />}
      {e.left && (
        <mesh position={[xL - reach / 2, roomH / 2, e.zWall + alcove]}>
          <planeGeometry args={[reach, roomH]} />
          <meshBasicMaterial color={e.left.color} toneMapped={false} />
        </mesh>
      )}
      {e.right && (
        <mesh position={[xR + reach / 2, roomH / 2, e.zWall + alcove]}>
          <planeGeometry args={[reach, roomH]} />
          <meshBasicMaterial color={e.right.color} toneMapped={false} />
        </mesh>
      )}
      {!e.left && (
        <mesh position={[xL - reach / 2, roomH / 2, e.zWall - 0.004]}>
          <planeGeometry args={[reach, roomH]} />
          <meshBasicMaterial color={e.wall} toneMapped={false} />
        </mesh>
      )}
      {!e.right && (
        <mesh position={[xR + reach / 2, roomH / 2, e.zWall - 0.004]}>
          <planeGeometry args={[reach, roomH]} />
          <meshBasicMaterial color={e.wall} toneMapped={false} />
        </mesh>
      )}
      <pointLight position={[cx, roomH - 0.2, e.zWall + 0.8]} intensity={2.4} distance={8} color="#ffffff" />
      <directionalLight position={[cx + 1, 3.2, e.zWall + 4]} intensity={1.1} color="#ffffff" />
    </group>
  );
}
