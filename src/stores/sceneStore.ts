/**
 * Scene Store - Manages 3D scene state (room, items, selection)
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type * as THREE from 'three';
import type { RoomConfig, PlacedItem, SceneData, Light, SceneSettings } from '@/types/designer';
import { applyAllConstraints } from '@/utils/constraints';

interface HistoryState {
  past: SceneData[];
  future: SceneData[];
}

interface SceneStore {
  // State
  room: RoomConfig;
  items: PlacedItem[];
  selectedIds: string[];
  selectedMeshRef: THREE.Mesh | null;
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
  setSelectedMeshRef: (mesh: THREE.Mesh | null) => void;
  setSettings: (settings: Partial<SceneSettings>) => void;
  loadScene: (sceneData: SceneData) => void;
  getSceneData: () => SceneData;
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
  toggleWallVisibility: (wallId: string) => void;
  setAllWallsVisibility: (visible: boolean) => void;
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
      selectedMeshRef: null,
      lights: defaultLights,
      settings: defaultSettings,
      history: { past: [], future: [] },

      // Actions
      setRoom: (room) => set({ room }),

      addItem: (item) => {
        get().saveToHistory();
        set((state) => {
          // Apply constraints to initial position
          const constraintResult = applyAllConstraints(item.position, state.room, item);
          item.position = constraintResult.position;

          state.items.push(item);
          state.selectedIds = [item.id];
        });
      },

      updateItem: (id, updates) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item && !item.locked) {
            // If position is being updated, apply constraints
            if (updates.position) {
              const constraintResult = applyAllConstraints(
                updates.position,
                state.room,
                item
              );
              updates.position = constraintResult.position;
            }
            Object.assign(item, updates);
          }
        }),

      deleteItem: (id) => {
        get().saveToHistory();
        set((state) => {
          state.items = state.items.filter((i) => i.id !== id);
          state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
        });
      },

      deleteSelectedItems: () => {
        get().saveToHistory();
        set((state) => {
          const unlockedSelected = state.selectedIds.filter(
            (id) => !state.items.find((i) => i.id === id)?.locked
          );
          state.items = state.items.filter((i) => !unlockedSelected.includes(i.id));
          state.selectedIds = [];
        });
      },

      duplicateItem: (id) => {
        get().saveToHistory();
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item) {
            const newItem: PlacedItem = {
              ...item,
              id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              position: [item.position[0] + 0.5, item.position[1], item.position[2] + 0.5],
            };
            state.items.push(newItem);
            state.selectedIds = [newItem.id];
          }
        });
      },

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

      deselectAll: () => set({ selectedIds: [], selectedMeshRef: null }),

      toggleItemLock: (id) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (item) {
            item.locked = !item.locked;
          }
        }),

      setSelectedMeshRef: (mesh) => set({ selectedMeshRef: mesh }),

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
        set((state) => {
          const currentState = get().getSceneData();

          // Limit history to 50 entries
          const newPast = [...state.history.past, currentState].slice(-50);

          state.history.past = newPast;
          state.history.future = []; // Clear future when new action is performed
        });
      },

      undo: () => {
        set((state) => {
          if (state.history.past.length === 0) return;

          const currentState = get().getSceneData();
          const previousState = state.history.past[state.history.past.length - 1];

          // Move current state to future
          state.history.future = [currentState, ...state.history.future];

          // Remove last state from past
          state.history.past = state.history.past.slice(0, -1);

          // Restore previous state
          state.room = previousState.room;
          state.items = previousState.items;
          state.lights = previousState.lights;
          state.settings = previousState.settings;
          state.selectedIds = [];
        });
      },

      redo: () => {
        set((state) => {
          if (state.history.future.length === 0) return;

          const currentState = get().getSceneData();
          const nextState = state.history.future[0];

          // Move current state to past
          state.history.past = [...state.history.past, currentState];

          // Remove first state from future
          state.history.future = state.history.future.slice(1);

          // Restore next state
          state.room = nextState.room;
          state.items = nextState.items;
          state.lights = nextState.lights;
          state.settings = nextState.settings;
          state.selectedIds = [];
        });
      },

      toggleWallVisibility: (wallId) =>
        set((state) => {
          const wall = state.room.walls.find((w) => w.id === wallId);
          if (wall) {
            wall.visible = wall.visible === false ? true : false;
          }
        }),

      setAllWallsVisibility: (visible) =>
        set((state) => {
          state.room.walls.forEach((wall) => {
            wall.visible = visible;
          });
        }),
    })),
    { name: 'SceneStore' }
  )
);

