/**
 * 3D room view (#321 M3, #259 Phase 2) — the same layout rows the 2D plan draws, at true scale.
 *
 * Consumes `room_layout_items_resolved` unchanged: Phase 2 adds a second RENDERER, not a second
 * data model. If the two views ever disagree about where or how big something is, exactly one of
 * them is wrong and it is a rendering bug, not a sync problem.
 *
 * Items without a 3D model are drawn as a labelled box at their planned footprint rather than
 * omitted. A room that silently loses half its furniture in 3D looks emptier than it is, and the
 * missing pieces are precisely the ones a tenant needs prompting to upload.
 */
import React, { Suspense, useMemo } from 'react';
import { useGLTF, OrbitControls, Environment, Grid } from '@react-three/drei';
import {
  cloneSceneWithOwnMaterials,
} from '@/components/features/ar/materialOverrides';
import { planToScene, planRotationToScene, trueScaleTransform } from './roomScene';
import type { ResolvedLayoutItem } from '@/services/roomPlannerService';

export interface SceneItem extends ResolvedLayoutItem {
  /** GLB/glTF url, when the product has one. */
  modelUrl?: string | null;
}

interface RoomSceneProps {
  room: { widthM: number; depthM: number };
  items: SceneItem[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

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

export const RoomScene3D: React.FC<RoomSceneProps> = ({ room, items, selectedId, onSelect }) => (
  <>
    <Environment preset="apartment" background={false} />
    <ambientLight intensity={0.5} />
    <directionalLight position={[6, 10, 6]} intensity={1.1} />
    <directionalLight position={[-5, 6, -4]} intensity={0.35} />

    {/* Floor at true size, so the room reads as the room and not as infinite space. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
      <planeGeometry args={[room.widthM, room.depthM]} />
      <meshStandardMaterial color="#d9d4cd" roughness={0.95} />
    </mesh>
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
