/**
 * Camera Controller - Handles camera modes and controls
 */
import React, { useRef, useEffect } from 'react';
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { useUIStore } from '@/stores/uiStore';
import { useSceneStore } from '@/stores/sceneStore';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export const CameraController: React.FC = () => {
  const { cameraMode } = useUIStore();
  const { room } = useSceneStore();
  const controlsRef = useRef<OrbitControlsType>(null);

  // Calculate room center for camera targeting
  const roomCenter = React.useMemo(() => {
    if (room.walls.length === 0) return [2.5, 0, 2];

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    room.walls.forEach((wall) => {
      minX = Math.min(minX, wall.start[0], wall.end[0]);
      maxX = Math.max(maxX, wall.start[0], wall.end[0]);
      minZ = Math.min(minZ, wall.start[1], wall.end[1]);
      maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
    });

    return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
  }, [room.walls]);

  // Update controls target when room changes
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(roomCenter[0], roomCenter[1], roomCenter[2]);
      controlsRef.current.update();
    }
  }, [roomCenter]);

  return (
    <>
      {cameraMode === 'topDown' ? (
        <>
          {/* Orthographic camera for 2D top-down view */}
          <OrthographicCamera
            makeDefault
            position={[roomCenter[0], 10, roomCenter[2]]}
            zoom={100}
            near={0.1}
            far={100}
          />
          <OrbitControls
            ref={controlsRef}
            enablePan
            enableZoom
            enableRotate={false} // Lock rotation in 2D mode
            minZoom={50}
            maxZoom={200}
            target={[roomCenter[0], 0, roomCenter[2]]}
          />
        </>
      ) : (
        <>
          {/* Perspective camera for 3D view */}
          <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
          <OrbitControls
            ref={controlsRef}
            enablePan
            enableZoom
            enableRotate
            minDistance={2}
            maxDistance={50}
            maxPolarAngle={Math.PI / 2 - 0.1}
            target={[roomCenter[0], 0, roomCenter[2]]}
          />
        </>
      )}
    </>
  );
};

