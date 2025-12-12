/**
 * Designer Canvas - Main 3D viewport with React Three Fiber
 */
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraController } from './CameraController';
import { Lighting } from './Lighting';
import { Grid } from './Grid';
import { Room } from './Room';
import { PlacedItems } from './PlacedItems';
import { TransformControls } from './TransformControls';
import { PlacementPreview } from './PlacementPreview';
import { useSceneStore } from '@/stores/sceneStore';
import { useUIStore } from '@/stores/uiStore';
import { logger } from '@/services/logger.service';
import { getAssetById } from '@/data/assetLibrary';
import { getPlacementContext } from '@/utils/placement';

export const DesignerCanvas: React.FC = () => {
  const { settings, room, items } = useSceneStore();
  const { setIsDragging } = useUIStore();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('assetId');
    if (assetId) {
      const asset = getAssetById(assetId);

      if (!asset) {
        logger.error('Asset not found', { assetId });
        setIsDragging(false);
        return;
      }

      // TODO: Calculate 3D position from drop coordinates
      // For now, place at center of room
      const targetPosition: [number, number, number] = [2.5, 0, 2];

      // Get placement context based on asset type
      const placementContext = getPlacementContext(asset, targetPosition, room, items);

      logger.debug('Dropped asset with placement', {
        assetId,
        placementType: asset.placement_rules.type,
        context: placementContext
      });

      const newItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        assetId,
        position: placementContext.position,
        rotation: placementContext.rotation,
        scale: [1, 1, 1] as [number, number, number],
        variantIndex: 0,
        locked: false,
        parentId: placementContext.parentId,
        attachedToWall: placementContext.attachedToWall,
      };

      useSceneStore.getState().addItem(newItem);
    }
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="h-full w-full bg-gradient-to-br from-background to-muted"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <CameraController />
          <Lighting />
          {settings.gridVisible && <Grid />}
          <Room />
          <PlacedItems />
          <PlacementPreview />
          <TransformControls />
        </Suspense>
      </Canvas>
    </div>
  );
};

