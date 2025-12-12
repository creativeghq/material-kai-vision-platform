/**
 * Scene Store - Manages 3D scene state (room, items, selection)
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { RoomConfig, PlacedItem, SceneData, Light, SceneSettings } from '@/types/designer';

interface HistoryState {
  past: SceneData[];
  future: SceneData[];
}

interface SceneStore {
  // State
  room: RoomConfig;
  items: PlacedItem[];
  selectedIds: string[];
  lights: Light[];
  settings: SceneSettings;
  history: HistoryState;

  // Actions
  setRoom: (room: RoomConfig) => void;
  addItem: (item: PlacedItem) => void;
  updateItem: (id: string, updates: Partial<PlacedItem>) => void;
  deleteItem: (id: string) => void;
  deleteSelectedItems: () => void;
  duplicateItem: (id: string) => void;
  selectItem: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  toggleItemLock: (id: string) => void;
  setSettings: (settings: Partial<SceneSettings>) => void;
  loadScene: (sceneData: SceneData) => void;
  getSceneData: () => SceneData;
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

const defaultRoom: RoomConfig = {
  walls: [
    { id: 'wall-1', start: [0, 0], end: [5, 0], height: 2.7, thickness: 0.15, material: 'white-paint' },
    { id: 'wall-2', start: [5, 0], end: [5, 4], height: 2.7, thickness: 0.15, material: 'white-paint' },
    { id: 'wall-3', start: [5, 4], end: [0, 4], height: 2.7, thickness: 0.15, material: 'white-paint' },
    { id: 'wall-4', start: [0, 4], end: [0, 0], height: 2.7, thickness: 0.15, material: 'white-paint' },
  ],
  openings: [],
  floor: { materialId: 'wood-oak', rotation: 0 },
  ceiling: { materialId: 'white-matte', height: 2.7 },
};

const defaultLights: Light[] = [
  { type: 'ambient', intensity: 0.4, color: '#ffffff' },
  { type: 'directional', position: [5, 10, 5], intensity: 0.8, color: '#ffffff', castShadow: true },
];

const defaultSettings: SceneSettings = {
  gridVisible: true,
  gridSize: 0.1,
  snapToGrid: true,
  rotationSnap: 15,
};

export const useSceneStore = create<SceneStore>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      room: defaultRoom,
      items: [],
      selectedIds: [],
      lights: defaultLights,
      settings: defaultSettings,
      history: { past: [], future: [] },

      // Actions
      setRoom: (room) => set({ room }),

      addItem: (item) =>
        set((state) => {
          state.items.push(item);
          state.selectedIds = [item.id];
        }),

      updateItem: (id, updates) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item && !item.locked) {
            Object.assign(item, updates);
          }
        }),

      deleteItem: (id) =>
        set((state) => {
          state.items = state.items.filter((i) => i.id !== id);
          state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
        }),

      deleteSelectedItems: () =>
        set((state) => {
          const unlockedSelected = state.selectedIds.filter(
            (id) => !state.items.find((i) => i.id === id)?.locked
          );
          state.items = state.items.filter((i) => !unlockedSelected.includes(i.id));
          state.selectedIds = [];
        }),

      duplicateItem: (id) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item) {
            const newItem: PlacedItem = {
              ...item,
              id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              position: [item.position[0] + 0.5, item.position[1], item.position[2] + 0.5],
            };
            state.items.push(newItem);
            state.selectedIds = [newItem.id];
          }
        }),

      selectItem: (id, multi = false) =>
        set((state) => {
          if (multi) {
            if (state.selectedIds.includes(id)) {
              state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
            } else {
              state.selectedIds.push(id);
            }
          } else {
            state.selectedIds = [id];
          }
        }),

      deselectAll: () => set({ selectedIds: [] }),

      toggleItemLock: (id) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item) {
            item.locked = !item.locked;
          }
        }),

      setSettings: (settings) =>
        set((state) => {
          Object.assign(state.settings, settings);
        }),

      loadScene: (sceneData) =>
        set({
          room: sceneData.room,
          items: sceneData.items,
          lights: sceneData.lights,
          settings: sceneData.settings,
          selectedIds: [],
        }),

      getSceneData: () => {
        const state = get();
        return {
          version: '1.0',
          camera: { position: [5, 5, 5], target: [0, 0, 0], zoom: 1, mode: 'orbit' as const },
          room: state.room,
          items: state.items,
          lights: state.lights,
          settings: state.settings,
        };
      },

      saveToHistory: () => {
        // Implementation for undo/redo will be added
      },

      undo: () => {
        // Implementation for undo will be added
      },

      redo: () => {
        // Implementation for redo will be added
      },
    })),
    { name: 'SceneStore' }
  )
);

