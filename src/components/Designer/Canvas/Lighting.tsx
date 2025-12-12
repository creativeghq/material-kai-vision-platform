/**
 * Lighting - Scene lighting setup
 */
import React from 'react';
import { Environment } from '@react-three/drei';
import { useSceneStore } from '@/stores/sceneStore';

export const Lighting: React.FC = () => {
  const { lights } = useSceneStore();

  return (
    <>
      <Environment preset="studio" />
      {lights.map((light, index) => {
        if (light.type === 'ambient') {
          return <ambientLight key={index} intensity={light.intensity} color={light.color} />;
        }
        if (light.type === 'directional' && light.position) {
          return (
            <directionalLight
              key={index}
              position={light.position}
              intensity={light.intensity}
              color={light.color}
              castShadow={light.castShadow}
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-far={50}
              shadow-camera-left={-10}
              shadow-camera-right={10}
              shadow-camera-top={10}
              shadow-camera-bottom={-10}
            />
          );
        }
        return null;
      })}
    </>
  );
};

