/**
 * Camera Controller - Handles camera modes and controls
 */
import React, { useRef } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useUIStore } from '@/stores/uiStore';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export const CameraController: React.FC = () => {
  const { cameraMode } = useUIStore();
  const controlsRef = useRef<OrbitControlsType>(null);

  return (
    <>
      <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
      {cameraMode === 'orbit' && (
        <OrbitControls
          ref={controlsRef}
          enablePan
          enableZoom
          enableRotate
          minDistance={2}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      )}
      {/* TODO: Add FirstPerson and TopDown camera modes */}
    </>
  );
};

