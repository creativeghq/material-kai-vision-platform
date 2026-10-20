import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { PresetLighting } from '@/components/features/lighting/PresetLighting';
import {
  cameraPose,
  type CameraShot,
  type TileFloorPlan,
  type TileSceneState,
} from '@/lib/installation/tileFloorTemplate';
import type { PhotoCamera } from '@/lib/installation/photoCamera';

export interface TileSceneColors {
  tile: string;
  grout: string;
}

interface Props {
  plan: TileFloorPlan;
  state: TileSceneState;
  shot: CameraShot;
  exploded: boolean;
  colors: TileSceneColors;
  selected: number | null;
  onSelect: (pieceIndex: number | null) => void;
  tileImageUrl?: string | null;
  photoCamera?: PhotoCamera | null;
}

const SUBSTRATE = '#b9b4ab';
const PRIMER = '#7fa7c9';
const ADHESIVE = '#9a9c99';
const SPACER = '#ff8a1f';
const CHALK = '#d64545';
const CUT_TINT = '#f2c26b';
const SELECTED = '#4f9cff';
const SLAB_M = 0.08;
const DROP_M = 0.35;

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

const mm = (v: number) => v / 1000;

function ease(t: number): number {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
}

function useRidgeTexture(): THREE.CanvasTexture | null {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (let y = 0; y < 64; y++) {
      const v = Math.round(130 + 45 * Math.sin((y / 64) * Math.PI * 2));
      ctx.fillStyle = `rgb(${v},${v + 2},${v})`;
      ctx.fillRect(0, y, 8, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useTileTexture(url: string | null | undefined): THREE.Texture | null {
  const gl = useThree((s) => s.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    setTexture(null);
    if (!url) return;
    let live = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, (tex) => {
      if (!live) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      const img = tex.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height && img.height > img.width) {
        tex.center.set(0.5, 0.5);
        tex.rotation = Math.PI / 2;
      }
      loaded = tex;
      setTexture(tex);
    }, undefined, () => { if (live) setTexture(null); });
    return () => {
      live = false;
      loaded?.dispose();
    };
  }, [url, gl]);
  return texture;
}

function CameraRig({ shot, widthM, depthM, photo }: { shot: CameraShot; widthM: number; depthM: number; photo: PhotoCamera | null | undefined }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const moving = useRef(true);
  const pose = useMemo(() => cameraPose(shot, widthM, depthM), [shot, widthM, depthM]);

  useEffect(() => {
    moving.current = true;
  }, [pose]);

  useLayoutEffect(() => {
    if (!photo) {
      if (camera.fov !== 45) {
        camera.fov = 45;
        camera.updateProjectionMatrix();
      }
      moving.current = true;
      return;
    }
    camera.position.set(...photo.position);
    camera.quaternion.set(...photo.quaternion);
    camera.fov = photo.fovDeg;
    camera.updateProjectionMatrix();
    if (controls) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const t = forward.y < -1e-3 ? -camera.position.y / forward.y : 3;
      controls.target.copy(camera.position).addScaledVector(forward, t);
    }
  }, [photo, camera, controls]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => { moving.current = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, delta) => {
    if (photo || !moving.current || !controls) return;
    const k = 1 - Math.pow(0.02, delta);
    const goal = new THREE.Vector3(...pose.position);
    const target = new THREE.Vector3(...pose.target);
    camera.position.lerp(goal, k);
    controls.target.lerp(target, k);
    controls.update();
    if (camera.position.distanceTo(goal) < 0.005 && controls.target.distanceTo(target) < 0.005) moving.current = false;
  });

  return null;
}

export const TileInstallationScene: React.FC<Props> = ({ plan, state, shot, exploded, colors, selected, onSelect, tileImageUrl, photoCamera }) => {
  const { params, pieces, spacers } = plan;
  const roomW = params.areaWidthM;
  const roomD = params.areaDepthM;
  const ox = -roomW / 2;
  const oz = -roomD / 2;
  const inPhoto = !!photoCamera;

  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  const gap = Math.max(roomW, roomD) * 0.05;
  const lift = exploded && !inPhoto ? { primer: gap, adhesive: gap * 2.4, tiles: gap * 4.2 } : { primer: 0, adhesive: 0, tiles: 0 };
  const bedM = mm(params.trowelNotchMm) / 2;
  const tileM = mm(params.tileThicknessMm);
  const tileY = bedM + tileM / 2 + lift.tiles;
  const gapM = mm(params.perimeterGapMm);
  const innerW = mm(plan.innerWidthMm);
  const innerD = mm(plan.innerDepthMm);

  const tilesRef = useRef<THREE.InstancedMesh>(null);
  const spacersRef = useRef<THREE.InstancedMesh>(null);
  const ridges = useRidgeTexture();
  const tileTexture = useTileTexture(tileImageUrl);

  const clipping = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(ox + gapM)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), ox + gapM + innerW),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(oz + gapM)),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), oz + gapM + innerD),
  ], [ox, oz, gapM, innerW, innerD]);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const turn = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useLayoutEffect(() => {
    const mesh = tilesRef.current;
    if (!mesh) return;
    const placedWhole = Math.floor(state.placed);
    const partial = state.placed - placedWhole;
    const dryLay = state.dryLay > 0 && state.placed === 0 ? new Set(plan.dryLay) : null;
    const base = tileTexture ? '#ffffff' : colors.tile;
    for (const pc of pieces) {
      const visible = pc.order < placedWhole || (pc.order === placedWhole && partial > 0) || dryLay?.has(pc.index);
      if (!visible) {
        mesh.setMatrixAt(pc.index, hidden);
        continue;
      }
      const dropping = pc.order === placedWhole && partial > 0;
      const e = dropping ? ease(partial) : 1;
      const ghostLift = dryLay?.has(pc.index) && pc.order >= placedWhole ? 0.002 : 0;
      pos.set(ox + mm(pc.cx), tileY + (1 - e) * DROP_M + ghostLift, oz + mm(pc.cz));
      euler.set((1 - e) * 0.25, 0, (1 - e) * -0.15);
      turn.setFromAxisAngle(yAxis, pc.angle);
      quat.setFromEuler(euler).premultiply(turn);
      scl.set(mm(pc.length), tileM, mm(pc.width));
      mesh.setMatrixAt(pc.index, matrix.compose(pos, quat, scl));
      if (pc.index === selected) color.set(SELECTED);
      else if (state.highlightCuts && pc.cut) color.set(CUT_TINT);
      else color.set(base);
      if (dryLay?.has(pc.index) && pc.order >= placedWhole) color.lerp(new THREE.Color('#ffffff'), 0.45);
      mesh.setColorAt(pc.index, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [pieces, plan.dryLay, state.placed, state.dryLay, state.highlightCuts, selected, colors.tile, tileTexture, tileY, tileM, ox, oz, matrix, quat, turn, euler, pos, scl, color, hidden, yAxis]);

  useLayoutEffect(() => {
    const mesh = spacersRef.current;
    if (!mesh) return;
    const placedWhole = Math.floor(state.placed);
    const j = mm(params.jointMm);
    const arm = Math.max(j * 6, 0.02);
    spacers.forEach((sp, i) => {
      if (!state.spacersVisible || sp.afterOrder >= placedWhole) {
        mesh.setMatrixAt(2 * i, hidden);
        mesh.setMatrixAt(2 * i + 1, hidden);
        return;
      }
      pos.set(ox + mm(sp.x), tileY + tileM * 0.15, oz + mm(sp.z));
      quat.identity();
      scl.set(arm, tileM * 0.8, j);
      mesh.setMatrixAt(2 * i, matrix.compose(pos, quat, scl));
      scl.set(j, tileM * 0.8, arm);
      mesh.setMatrixAt(2 * i + 1, matrix.compose(pos, quat, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [spacers, state.placed, state.spacersVisible, params.jointMm, tileY, tileM, ox, oz, matrix, quat, pos, scl, hidden]);

  const adhesiveDepth = innerD * state.adhesive;
  const ridgePitch = mm(params.trowelNotchMm * 2.2);
  useLayoutEffect(() => {
    if (ridges) ridges.repeat.set(1, Math.max(adhesiveDepth, 0.001) / ridgePitch);
  }, [ridges, adhesiveDepth, ridgePitch]);

  const onTileClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) onSelect(e.instanceId);
  };

  const picked = selected != null ? pieces[selected] : null;
  const sel = picked && picked.order < state.placed ? picked : null;
  const span = Math.max(roomW, roomD);
  const selText = sel
    ? sel.visible
      ? `${sel.cut ? 'Cut piece' : 'Full tile'} · ${Math.round(sel.visible.lx)} × ${Math.round(sel.visible.lz)} mm`
      : `${sel.cut ? 'Cut piece of a' : 'Full'} ${Math.round(sel.length)} × ${Math.round(sel.width)} mm tile`
    : '';

  return (
    <>
      <PresetLighting preset="natural_daylight" />
      <OrbitControls makeDefault enabled={!inPhoto} enableDamping maxPolarAngle={Math.PI / 2.05} minDistance={0.3} maxDistance={span * 4} />
      <CameraRig shot={exploded ? 'low' : shot} widthM={roomW} depthM={roomD} photo={photoCamera} />

      {!inPhoto && (
        <>
          <mesh position={[0, -SLAB_M / 2, 0]} receiveShadow onClick={() => onSelect(null)}>
            <boxGeometry args={[roomW, SLAB_M, roomD]} />
            <meshStandardMaterial color={SUBSTRATE} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.2, oz - 0.04]}>
            <boxGeometry args={[roomW + 0.16, 0.4 + SLAB_M, 0.08]} />
            <meshStandardMaterial color="#e6e1d8" roughness={0.9} />
          </mesh>
          <mesh position={[ox - 0.04, 0.2, 0]}>
            <boxGeometry args={[0.08, 0.4 + SLAB_M, roomD]} />
            <meshStandardMaterial color="#e6e1d8" roughness={0.9} />
          </mesh>
        </>
      )}

      {state.primer > 0 && (
        <mesh position={[0, 0.0006 + lift.primer, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[roomW, roomD]} />
          <meshStandardMaterial color={PRIMER} transparent opacity={0.55 * state.primer} roughness={0.6} />
        </mesh>
      )}

      {state.chalk > 0 && (
        <group position={[0, 0.0012 + lift.primer, 0]}>
          <mesh position={[ox + mm(plan.centreX), 0, 0]} scale={[1, 1, state.chalk]}>
            <boxGeometry args={[0.006, 0.001, roomD]} />
            <meshBasicMaterial color={CHALK} />
          </mesh>
          <mesh position={[0, 0, oz + mm(plan.centreZ)]} scale={[state.chalk, 1, 1]}>
            <boxGeometry args={[roomW, 0.001, 0.006]} />
            <meshBasicMaterial color={CHALK} />
          </mesh>
        </group>
      )}

      {adhesiveDepth > 0.001 && (
        <mesh position={[0, bedM / 2 + lift.adhesive, oz + gapM + adhesiveDepth / 2]} scale={[innerW, bedM, adhesiveDepth]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={ADHESIVE} map={ridges ?? undefined} roughness={1} />
        </mesh>
      )}

      {state.adhesive > 0 && state.adhesive < 1 && (
        <group position={[ox + roomW * 0.5, bedM + 0.02 + lift.adhesive, oz + gapM + adhesiveDepth]} rotation={[-0.6, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.28, 0.003, 0.12]} />
            <meshStandardMaterial color="#c9ced3" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.03, 0.06, 0.12]} />
            <meshStandardMaterial color="#2b2b2b" />
          </mesh>
        </group>
      )}

      {pieces.length > 0 && (
        <instancedMesh key={`tiles-${pieces.length}`} ref={tilesRef} args={[undefined, undefined, pieces.length]} onClick={onTileClick} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            key={tileTexture ? tileTexture.uuid : 'plain'}
            map={tileTexture ?? undefined}
            roughness={0.35}
            metalness={0.02}
            clippingPlanes={clipping}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      )}

      {spacers.length > 0 && (
        <instancedMesh key={`spacers-${spacers.length}`} ref={spacersRef} args={[undefined, undefined, spacers.length * 2]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={SPACER} roughness={0.6} />
        </instancedMesh>
      )}

      {state.grout > 0 && (
        <mesh
          position={[0, bedM + tileM * 0.48 + lift.tiles, oz + gapM + (innerD * state.grout) / 2]}
          scale={[innerW, tileM * 0.96, innerD * state.grout]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={colors.grout} roughness={0.95} />
        </mesh>
      )}

      {state.straightedge != null && (
        <mesh position={[ox + roomW * (0.15 + 0.7 * state.straightedge), 0.012, 0]} rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.04, 0.02, Math.min(2, roomD * 0.9)]} />
          <meshStandardMaterial color="#d0d4d8" metalness={0.9} roughness={0.25} />
        </mesh>
      )}

      {state.level != null && (
        <mesh position={[ox + roomW * (0.1 + 0.8 * state.level), tileY + tileM / 2 + 0.03, 0]}>
          <boxGeometry args={[0.05, 0.06, Math.min(1.2, roomD * 0.8)]} />
          <meshStandardMaterial color="#e8b923" roughness={0.5} />
        </mesh>
      )}

      {state.sponge != null && (
        <mesh
          position={[
            ox + roomW * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(state.sponge * Math.PI * 6))),
            tileY + tileM / 2 + 0.02,
            oz + roomD * (0.15 + 0.7 * state.sponge),
          ]}
        >
          <boxGeometry args={[0.16, 0.04, 0.11]} />
          <meshStandardMaterial color="#f4d03f" roughness={1} />
        </mesh>
      )}

      {state.backButter != null && (
        <group position={[0, 0.3, roomD / 2 + mm(params.tileWidthMm) / 2 + 0.15]} rotation={[Math.PI, 0, 0]}>
          <mesh>
            <boxGeometry args={[mm(params.tileLengthMm), tileM, mm(params.tileWidthMm)]} />
            <meshStandardMaterial color={tileTexture ? '#ffffff' : colors.tile} map={tileTexture ?? undefined} roughness={0.35} />
          </mesh>
          <mesh
            position={[0, -tileM / 2 - 0.0012, -mm(params.tileWidthMm) / 2 + (mm(params.tileWidthMm) * state.backButter) / 2]}
            scale={[mm(params.tileLengthMm), 0.002, Math.max(mm(params.tileWidthMm) * state.backButter, 0.001)]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={ADHESIVE} roughness={1} />
          </mesh>
        </group>
      )}

      {exploded && !inPhoto && (
        <>
          <LayerLabel position={[ox - 0.1, 0, oz + roomD]} text="Substrate" />
          {params.prime && <LayerLabel position={[ox - 0.1, lift.primer, oz + roomD]} text="Primer" />}
          <LayerLabel position={[ox - 0.1, lift.adhesive, oz + roomD]} text={`Adhesive · ${params.trowelNotchMm} mm notch`} />
          <LayerLabel position={[ox - 0.1, tileY, oz + roomD]} text={`Tiles · ${params.tileLengthMm}×${params.tileWidthMm} mm`} />
        </>
      )}

      {sel && (
        <Html position={[ox + mm(sel.cx), tileY + 0.06, oz + mm(sel.cz)]} center>
          <div className="pointer-events-none whitespace-nowrap rounded-sm border border-hairline bg-card px-2 py-1 text-xs text-foreground shadow-overlay">
            {selText}
          </div>
        </Html>
      )}
    </>
  );
};

function LayerLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center>
      <div className="pointer-events-none whitespace-nowrap rounded-sm border border-hairline bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {text}
      </div>
    </Html>
  );
}
