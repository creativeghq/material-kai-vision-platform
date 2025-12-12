/**
 * Asset Library - Furniture and object definitions with placement rules
 */
import type { Asset } from '@/types/designer';

export const assetLibrary: Asset[] = [
  // Kitchen - Floor Items
  {
    id: 'kitchen-base-cabinet',
    category_id: 'kitchen',
    name: 'Base Cabinet',
    description: 'Standard kitchen base cabinet',
    model_url: '/models/kitchen/base-cabinet.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 0.6, height: 0.9, depth: 0.6 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'floor',
      allowsItemsOnTop: true, // Can place countertop items on it
    },
    variants: [
      {
        name: 'White',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/white.jpg' },
      },
    ],
    tags: ['kitchen', 'storage', 'cabinet'],
    is_active: true,
  },
  {
    id: 'kitchen-refrigerator',
    category_id: 'kitchen',
    name: 'Refrigerator',
    description: 'Standard refrigerator',
    model_url: '/models/kitchen/refrigerator.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 0.7, height: 1.8, depth: 0.7 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'floor',
    },
    variants: [
      {
        name: 'Stainless Steel',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/steel.jpg' },
      },
    ],
    tags: ['kitchen', 'appliance'],
    is_active: true,
  },

  // Kitchen - Wall Items
  {
    id: 'kitchen-wall-cabinet',
    category_id: 'kitchen',
    name: 'Wall Cabinet',
    description: 'Wall-mounted kitchen cabinet',
    model_url: '/models/kitchen/wall-cabinet.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 0.6, height: 0.7, depth: 0.3 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'wall',
      wallOffset: 0.05, // 5cm from wall
      floorOffset: 1.5, // 1.5m from floor
    },
    variants: [
      {
        name: 'White',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/white.jpg' },
      },
    ],
    tags: ['kitchen', 'storage', 'cabinet', 'wall-mounted'],
    is_active: true,
  },

  // Kitchen - Countertop Items
  {
    id: 'kitchen-microwave',
    category_id: 'kitchen',
    name: 'Microwave',
    description: 'Countertop microwave oven',
    model_url: '/models/kitchen/microwave.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 0.5, height: 0.3, depth: 0.4 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'countertop',
      requiresSurface: true,
      canBePlacedOn: ['kitchen-base-cabinet', 'kitchen-counter'],
    },
    variants: [
      {
        name: 'Black',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/black.jpg' },
      },
    ],
    tags: ['kitchen', 'appliance', 'countertop'],
    is_active: true,
  },

  // Living Room - Floor Items
  {
    id: 'living-sofa',
    category_id: 'living-room',
    name: 'Sofa',
    description: '3-seater sofa',
    model_url: '/models/living/sofa.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 2.0, height: 0.85, depth: 0.9 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'floor',
    },
    variants: [
      {
        name: 'Grey Fabric',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/grey-fabric.jpg' },
      },
    ],
    tags: ['living-room', 'seating', 'sofa'],
    is_active: true,
  },
  {
    id: 'living-coffee-table',
    category_id: 'living-room',
    name: 'Coffee Table',
    description: 'Modern coffee table',
    model_url: '/models/living/coffee-table.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 1.2, height: 0.45, depth: 0.6 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'floor',
      allowsItemsOnTop: true,
    },
    variants: [
      {
        name: 'Wood',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/wood.jpg' },
      },
    ],
    tags: ['living-room', 'table'],
    is_active: true,
  },

  // Lighting - Ceiling Items
  {
    id: 'lighting-pendant',
    category_id: 'lighting',
    name: 'Pendant Light',
    description: 'Modern pendant light fixture',
    model_url: '/models/lighting/pendant.glb',
    thumbnail_url: '/placeholder.svg',
    dimensions: { width: 0.3, height: 0.4, depth: 0.3 },
    default_rotation: [0, 0, 0],
    snap_points: [],
    placement_rules: {
      type: 'ceiling',
      ceilingOffset: 0.1, // 10cm from ceiling
    },
    variants: [
      {
        name: 'Black Metal',
        thumbnail_url: '/placeholder.svg',
        texture_urls: { diffuse: '/textures/black-metal.jpg' },
      },
    ],
    tags: ['lighting', 'ceiling', 'pendant'],
    is_active: true,
  },
];

/**
 * Get asset by ID
 */
export function getAssetById(id: string): Asset | undefined {
  return assetLibrary.find((asset) => asset.id === id);
}

/**
 * Get assets by category
 */
export function getAssetsByCategory(categoryId: string): Asset[] {
  return assetLibrary.filter((asset) => asset.category_id === categoryId);
}

/**
 * Get all active assets
 */
export function getActiveAssets(): Asset[] {
  return assetLibrary.filter((asset) => asset.is_active);
}

