/**
 * UI Store - Manages UI state (tools, panels, camera mode)
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { TransformMode } from '@/types/designer';

interface PanelState {
  assetLibrary: boolean;
  properties: boolean;
  timeline: boolean;
}

interface SnapConfig {
  enabled: boolean;
  gridSize: number;
  rotationSnap: number;
}

interface UIStore {
  // State
  activeTool: TransformMode;
  cameraMode: 'orbit' | 'firstPerson' | 'topDown';
  panelVisibility: PanelState;
  snapSettings: SnapConfig;
  isDragging: boolean;
  hoveredAssetId: string | null;

  // Actions
  setActiveTool: (tool: TransformMode) => void;
  setCameraMode: (mode: 'orbit' | 'firstPerson' | 'topDown') => void;
  togglePanel: (panel: keyof PanelState) => void;
  setSnapSettings: (settings: Partial<SnapConfig>) => void;
  setIsDragging: (isDragging: boolean) => void;
  setHoveredAssetId: (id: string | null) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      // Initial state
      activeTool: 'translate',
      cameraMode: 'orbit',
      panelVisibility: {
        assetLibrary: true,
        properties: true,
        timeline: false,
      },
      snapSettings: {
        enabled: true,
        gridSize: 0.1,
        rotationSnap: 15,
      },
      isDragging: false,
      hoveredAssetId: null,

      // Actions
      setActiveTool: (tool) => set({ activeTool: tool }),

      setCameraMode: (mode) => set({ cameraMode: mode }),

      togglePanel: (panel) =>
        set((state) => ({
          panelVisibility: {
            ...state.panelVisibility,
            [panel]: !state.panelVisibility[panel],
          },
        })),

      setSnapSettings: (settings) =>
        set((state) => ({
          snapSettings: { ...state.snapSettings, ...settings },
        })),

      setIsDragging: (isDragging) => set({ isDragging }),

      setHoveredAssetId: (id) => set({ hoveredAssetId: id }),
    }),
    { name: 'UIStore' }
  )
);

