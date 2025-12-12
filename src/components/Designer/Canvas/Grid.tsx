/**
 * Grid - Floor grid helper
 */
import React from 'react';
import { useSceneStore } from '@/stores/sceneStore';

export const Grid: React.FC = () => {
  const { settings } = useSceneStore();

  return (
    <gridHelper args={[20, 20, '#9ca3af', '#6b7280']} position={[0, 0, 0]} />
  );
};

