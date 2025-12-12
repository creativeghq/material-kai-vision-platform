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
import { useSceneStore } from '@/stores/sceneStore';
import { useUIStore } from '@/stores/uiStore';
import { logger } from '@/services/logger.service';

export const DesignerCanvas: React.FC = () => {
  const { settings } = useSceneStore();
  const { setIsDragging } = useUIStore();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('assetId');
    if (assetId) {
      // TODO: Calculate 3D position from drop coordinates
      logger.debug('Dropped asset', { assetId });
      // For now, just add at origin
      const newItem = {
        id: `item-${Date.now()}`,
        assetId,
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
        variantIndex: 0,
        locked: false,
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
          <TransformControls />
        </Suspense>
      </Canvas>
    </div>
  );
};

