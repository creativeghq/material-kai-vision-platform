/** 3D room view (#321 M3, #259 Phase 2) — the same layout rows the 2D plan draws, at true scale. */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useGLTF, OrbitControls, Grid } from '@react-three/drei';
import type { Texture } from 'three';
import { PresetLighting, DEFAULT_PRESET } from '@/components/features/lighting/PresetLighting';
import type { PresetKey } from '@/components/features/lighting/lightingPresets';
import {
  cloneSceneWithOwnMaterials, loadSharedTexture,
} from '@/components/features/ar/materialOverrides';
import { planToScene, planRotationToScene, trueScaleTransform, WALL_NORMALS, wallTransform } from './roomScene';
import type { ResolvedLayoutItem, SurfaceKey } from '@/services/roomPlannerService';
import type { SurfaceTexture } from './surfaceFormat';

export interface SceneItem extends ResolvedLayoutItem {
  /** GLB/glTF url, when the product has one. */
  modelUrl?: string | null;
}

interface RoomSceneProps {
  room: { widthM: number; depthM: number };
  /** Wall height, from the layout's resolved view — the default lives in SQL, not here. */
  heightM: number;
  items: SceneItem[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Which of the shared lighting presets to light the room with (#335). */
  lighting?: PresetKey;
  /** What is applied to each surface (#404 Phase 0.4). Absent = the flat placeholder colour. */
  surfaces?: Partial<Record<SurfaceKey, SurfaceTexture>>;
}

const FLOOR_COLOR = '#d9d4cd';
const WALL_COLOR = '#ece8e2';

/**
 * A tiling texture for one surface, outside Suspense so a photo the browser cannot fetch leaves
 * the flat colour rather than blanking the room. The download is shared per URL; the repeat is
 * this surface's own clone, released only once the material holds its replacement.
 */
function useTiledTexture(tex: SurfaceTexture | undefined, spanX: number, spanY: number): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  const url = tex?.url ?? null;
  const tileW = tex?.tileWidthM ?? 0;
  const tileL = tex?.tileLengthM ?? 0;
  useEffect(() => {
    setTexture(null);
    if (!url || tileW <= 0 || tileL <= 0) return;
    let live = true;
    loadSharedTexture(url)
      .then((shared) => {
        if (!live) return;
        const own = shared.clone();
        // One repeat per piece, so a 60×60 reads as 60×60 across a 4 m floor and not as one photo.
        own.repeat.set(spanX / tileW, spanY / tileL);
        own.needsUpdate = true;
        setTexture(own);
      })
      .catch(() => { if (live) setTexture(null); });
    return () => { live = false; };
  }, [url, tileW, tileL, spanX, spanY]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return texture;
}

/** One surface: flat colour until its texture arrives, flat colour again if it never does. */
const SurfacePlane: React.FC<{
  size: [number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  tex?: SurfaceTexture;
  flatColor: string;
}> = ({ size, position, rotation, tex, flatColor }) => {
  const map = useTiledTexture(tex, size[0], size[1]);
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={size} />
      {map
        ? <meshStandardMaterial key="tiled" map={map} roughness={0.9} />
        : <meshStandardMaterial key="flat" color={flatColor} roughness={0.95} />}
    </mesh>
  );
};

/** One product, scaled to its planned footprint and stood on the floor. */
const PlacedModel: React.FC<{ item: SceneItem; url: string }> = ({ item, url }) => {
  const gltf = useGLTF(url);
  // Private materials per instance: two of the same product in one room share a cached glTF, and
  // three keeps material references shared across clone(). Without this, selecting one chair would
  // highlight every chair.
  const scene = useMemo(() => cloneSceneWithOwnMaterials(gltf.scene), [gltf.scene]);
  const { scale, offset } = useMemo(
    () => trueScaleTransform(scene, Number(item.effective_width_m), Number(item.effective_depth_m)),
    [scene, item.effective_width_m, item.effective_depth_m],
  );

  return (
    <group position={offset} scale={scale}>
      <primitive object={scene} />
    </group>
  );
};

/** Stand-in for a product with no uploaded model — its planned footprint, at a plausible height. */
const PlaceholderBox: React.FC<{ item: SceneItem; selected: boolean }> = ({ item, selected }) => {
  const w = Number(item.effective_width_m);
  const d = Number(item.effective_depth_m);
  // No measured height exists for a product without a model, so pick something furniture-shaped
  // and keep it visibly provisional rather than implying a measurement.
  const h = Math.min(Math.max((w + d) / 2, 0.3), 1.0);
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={selected ? '#e14c93' : '#9a92a6'}
        transparent
        opacity={0.55}
        roughness={0.85}
      />
    </mesh>
  );
};

export const RoomScene3D: React.FC<RoomSceneProps> = ({
  room, heightM, items, selectedId, onSelect, lighting = DEFAULT_PRESET, surfaces,
}) => (
  <>
    <PresetLighting preset={lighting} />

    {/* Floor at true size, so the room reads as the room and not as infinite space. */}
    <SurfacePlane
      size={[room.widthM, room.depthM]}
      position={[0, -0.001, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      tex={surfaces?.floor}
      flatColor={FLOOR_COLOR}
    />
    {/* The grid stands in for a floor; over a tiled one it reads as extra joints. */}
    {!surfaces?.floor?.url && (
      <Grid
        args={[room.widthM, room.depthM]}
        cellSize={0.5}
        sectionSize={1}
        infiniteGrid={false}
        fadeDistance={Math.max(room.widthM, room.depthM) * 3}
        cellColor="#b9b1a6"
        sectionColor="#8d8579"
        position={[0, 0.001, 0]}
      />
    )}

    {/* Four inward-facing walls, single-sided: from outside, the near ones fall away. */}
    {WALL_NORMALS.map(({ key, normal }) => {
      const wall = wallTransform(normal, room.widthM, room.depthM, heightM);
      return (
        <SurfacePlane
          key={key}
          size={[wall.span, heightM]}
          position={wall.position}
          rotation={[0, wall.rotationY, 0]}
          tex={surfaces?.[key]}
          flatColor={WALL_COLOR}
        />
      );
    })}

    {items.map((item) => {
      const [x, , z] = planToScene(Number(item.x_m), Number(item.y_m), room);
      return (
        <group
          key={item.id}
          position={[x, 0, z]}
          rotation={[0, planRotationToScene(Number(item.rotation_deg)), 0]}
          onClick={(e) => { e.stopPropagation(); onSelect?.(item.id); }}
        >
          {item.modelUrl ? (
            // Per-item Suspense: one slow or broken model must not hold up the whole room.
            <Suspense fallback={<PlaceholderBox item={item} selected={selectedId === item.id} />}>
              <PlacedModel item={item} url={item.modelUrl} />
            </Suspense>
          ) : (
            <PlaceholderBox item={item} selected={selectedId === item.id} />
          )}
        </group>
      );
    })}

    <OrbitControls
      makeDefault
      enablePan
      minDistance={1}
      maxDistance={Math.max(room.widthM, room.depthM) * 3}
      // Stop the camera dropping under the floor, which is disorienting and shows the room's
      // underside.
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[0, 0.4, 0]}
    />
  </>
);
