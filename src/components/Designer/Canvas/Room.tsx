/**
 * Room - Renders room geometry (walls, floor, ceiling)
 */
import React from 'react';
import { useSceneStore } from '@/stores/sceneStore';
import * as THREE from 'three';

export const Room: React.FC = () => {
  const { room } = useSceneStore();

  // Calculate room bounds from walls
  const bounds = React.useMemo(() => {
    if (room.walls.length === 0) return { minX: 0, maxX: 5, minZ: 0, maxZ: 4 };

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    room.walls.forEach((wall) => {
      minX = Math.min(minX, wall.start[0], wall.end[0]);
      maxX = Math.max(maxX, wall.start[0], wall.end[0]);
      minZ = Math.min(minZ, wall.start[1], wall.end[1]);
      maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
    });

    return { minX, maxX, minZ, maxZ };
  }, [room.walls]);

  const floorWidth = bounds.maxX - bounds.minX;
  const floorDepth = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <group>
      {/* Floor */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, 0, centerZ]}
      >
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>

      {/* Walls */}
      {room.walls.map((wall) => {
        // Skip rendering if wall is hidden
        if (wall.visible === false) return null;

        const start = new THREE.Vector2(wall.start[0], wall.start[1]);
        const end = new THREE.Vector2(wall.end[0], wall.end[1]);
        const length = start.distanceTo(end);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const centerX = (start.x + end.x) / 2;
        const centerZ = (start.y + end.y) / 2;

        return (
          <mesh
            key={wall.id}
            position={[centerX, wall.height / 2, centerZ]}
            rotation={[0, angle, 0]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[length, wall.height, wall.thickness]} />
            <meshStandardMaterial color="#f3f4f6" />
          </mesh>
        );
      })}

      {/* Ceiling (optional, commented out for better visibility) */}
      {/* <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, room.ceiling.height, centerZ]}
      >
        <planeGeometry args={[floorWidth, floorDepth]} />
        <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh> */}
    </group>
  );
};

