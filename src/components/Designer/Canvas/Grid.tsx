/**
 * Grid - Floor grid helper
 */
import React from 'react';
import { useUIStore } from '@/stores/uiStore';

export const Grid: React.FC = () => {
  const { snapSettings } = useUIStore();

  // Calculate grid divisions based on grid size
  // Total size is 20m, so divisions = 20 / gridSize
  const size = 20;
  const divisions = Math.floor(size / snapSettings.gridSize);

  return (
    <gridHelper
      args={[size, divisions, '#9ca3af', '#6b7280']}
      position={[0, 0.001, 0]} // Slightly above floor to prevent z-fighting
    />
  );
};

