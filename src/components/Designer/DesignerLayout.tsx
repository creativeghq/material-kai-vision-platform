/**
 * Designer Layout - Main layout component with panels
 */
import React from 'react';
import { Toolbar } from './Toolbar';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { DesignerCanvas } from './Canvas/DesignerCanvas';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

export const DesignerLayout: React.FC = () => {
  const { panelVisibility } = useUIStore();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Asset Library Panel */}
        <div
          className={cn(
            'border-r bg-card transition-all duration-300',
            panelVisibility.assetLibrary ? 'w-64' : 'w-0'
          )}
        >
          {panelVisibility.assetLibrary && <AssetLibraryPanel />}
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 overflow-hidden">
          <DesignerCanvas />
        </div>

        {/* Properties Panel */}
        <div
          className={cn(
            'border-l bg-card transition-all duration-300',
            panelVisibility.properties ? 'w-80' : 'w-0'
          )}
        >
          {panelVisibility.properties && <PropertiesPanel />}
        </div>
      </div>
    </div>
  );
};

