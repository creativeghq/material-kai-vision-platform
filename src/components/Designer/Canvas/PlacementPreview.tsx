/**
 * Placement Preview - Ghost preview of item being placed
 */
import React from 'react';
import { useUIStore } from '@/stores/uiStore';
import { getAssetById } from '@/data/assetLibrary';

export const PlacementPreview: React.FC = () => {
  const { isDragging, hoveredAssetId } = useUIStore();

  if (!isDragging || !hoveredAssetId) return null;

  const asset = getAssetById(hoveredAssetId);
  if (!asset) return null;

  // Simple box preview for now
  const { width, height, depth } = asset.dimensions;

  return (
    <mesh position={[2.5, height / 2, 2]}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial 
        color="#4ade80" 
        transparent 
        opacity={0.5} 
        wireframe 
      />
    </mesh>
  );
};

