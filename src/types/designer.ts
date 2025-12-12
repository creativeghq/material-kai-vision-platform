/**
 * Type definitions for 3D Room Designer
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Dimensions {
  width: number;
  depth: number;
  height: number;
}

export interface RoomConfig {
  walls: Wall[];
  openings: Opening[];
  floor: FloorConfig;
  ceiling: CeilingConfig;
}

export interface Wall {
  id: string;
  start: [number, number];
  end: [number, number];
  height: number;
  thickness: number;
  material: string;
}

export interface Opening {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  position: number;
  width: number;
  height: number;
  fromFloor: number;
}

export interface FloorConfig {
  materialId: string;
  rotation: number;
}

export interface CeilingConfig {
  materialId: string;
  height: number;
}

export interface PlacedItem {
  id: string;
  assetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  variantIndex: number;
  locked: boolean;
}

export interface Asset {
  id: string;
  category_id: string;
  name: string;
  description: string;
  model_url: string;
  thumbnail_url: string;
  dimensions: Dimensions;
  default_rotation: Vector3;
  snap_points: SnapPoint[];
  placement_rules: PlacementRules;
  variants: AssetVariant[];
  tags: string[];
  is_active: boolean;
}

export interface SnapPoint {
  id: string;
  position: [number, number, number];
  direction: [number, number, number];
  type: 'side' | 'surface' | 'wall';
}

export interface PlacementRules {
  type: 'floor' | 'wall' | 'ceiling' | 'freestanding';
  wallOffset?: number;
  floorOffset?: number;
}

export interface AssetVariant {
  name: string;
  thumbnail_url: string;
  texture_urls: Record<string, string>;
}

export interface AssetCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  room_types: string[];
  icon: string;
  sort_order: number;
}

export interface Material {
  id: string;
  name: string;
  category: 'floor' | 'wall' | 'ceiling';
  thumbnail_url: string;
  texture_urls: {
    diffuse?: string;
    normal?: string;
    roughness?: string;
    metalness?: string;
  };
  repeat_scale: { x: number; y: number };
  is_active: boolean;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
  mode: 'orbit' | 'firstPerson' | 'topDown';
}

export interface SceneSettings {
  gridVisible: boolean;
  gridSize: number;
  snapToGrid: boolean;
  rotationSnap: number;
}

export interface SceneData {
  version: string;
  camera: CameraState;
  room: RoomConfig;
  items: PlacedItem[];
  lights: Light[];
  settings: SceneSettings;
}

export interface Light {
  type: 'ambient' | 'directional' | 'point' | 'spot';
  position?: [number, number, number];
  intensity: number;
  color: string;
  castShadow?: boolean;
}

export interface DesignerProject {
  id: string;
  user_id: string;
  workspace_id?: string;
  name: string;
  room_type: string;
  room_dimensions: Dimensions;
  scene_data: SceneData;
  thumbnail_url?: string;
  is_template: boolean;
  is_public: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
}

export type TransformMode = 'translate' | 'rotate' | 'scale';

