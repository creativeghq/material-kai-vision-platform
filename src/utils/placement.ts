/**
 * Placement utilities for smart object placement
 */
import type { PlacedItem, Asset, PlacementType, RoomConfig, Wall } from '@/types/designer';
import { getRoomBounds } from './constraints';

export interface PlacementContext {
  position: [number, number, number];
  rotation: [number, number, number];
  attachedToWall?: string;
  parentId?: string;
}

/**
 * Get placement context based on asset type and target position
 */
export function getPlacementContext(
  asset: Asset,
  targetPosition: [number, number, number],
  room: RoomConfig,
  existingItems: PlacedItem[]
): PlacementContext {
  const placementType = asset.placement_rules.type;

  switch (placementType) {
    case 'floor':
      return getFloorPlacement(asset, targetPosition);
    
    case 'wall':
      return getWallPlacement(asset, targetPosition, room);
    
    case 'ceiling':
      return getCeilingPlacement(asset, targetPosition, room);
    
    case 'countertop':
      return getCountertopPlacement(asset, targetPosition, existingItems);
    
    case 'freestanding':
    default:
      return {
        position: targetPosition,
        rotation: [0, 0, 0],
      };
  }
}

/**
 * Floor placement - sits on floor at Y=0 + item height/2
 */
function getFloorPlacement(
  asset: Asset,
  targetPosition: [number, number, number]
): PlacementContext {
  const itemHeight = asset.dimensions.height;
  const y = itemHeight / 2; // Center the object on the floor

  return {
    position: [targetPosition[0], y, targetPosition[2]],
    rotation: [0, 0, 0],
  };
}

/**
 * Wall placement - attaches to nearest wall at specified height
 */
function getWallPlacement(
  asset: Asset,
  targetPosition: [number, number, number],
  room: RoomConfig
): PlacementContext {
  const nearestWall = findNearestWall(targetPosition, room.walls);
  
  if (!nearestWall) {
    // Fallback to floor placement if no wall found
    return getFloorPlacement(asset, targetPosition);
  }

  const wallOffset = asset.placement_rules.wallOffset || 0.05; // Default 5cm from wall
  const floorOffset = asset.placement_rules.floorOffset || 1.5; // Default 1.5m from floor
  
  // Calculate position along the wall
  const wallPosition = getPositionAlongWall(nearestWall.wall, targetPosition);
  
  // Offset from wall based on wall normal
  const offsetPosition = offsetFromWall(wallPosition, nearestWall.wall, wallOffset);
  
  return {
    position: [offsetPosition[0], floorOffset, offsetPosition[1]],
    rotation: [0, nearestWall.angle, 0],
    attachedToWall: nearestWall.wall.id,
  };
}

/**
 * Ceiling placement - hangs from ceiling
 */
function getCeilingPlacement(
  asset: Asset,
  targetPosition: [number, number, number],
  room: RoomConfig
): PlacementContext {
  const ceilingHeight = room.ceiling.height;
  const ceilingOffset = asset.placement_rules.ceilingOffset || 0.1;
  const itemHeight = asset.dimensions.height;
  
  const y = ceilingHeight - ceilingOffset - itemHeight / 2;

  return {
    position: [targetPosition[0], y, targetPosition[2]],
    rotation: [0, 0, 0],
  };
}

/**
 * Countertop placement - places on top of another item
 */
function getCountertopPlacement(
  asset: Asset,
  targetPosition: [number, number, number],
  existingItems: PlacedItem[]
): PlacementContext {
  const surfaceItem = findSurfaceBelow(targetPosition, existingItems);
  
  if (!surfaceItem) {
    // No surface found, default to floor
    return getFloorPlacement(asset, targetPosition);
  }

  // Place on top of the surface item
  const surfaceHeight = surfaceItem.position[1] + 0.45; // Approximate surface height
  const itemHeight = asset.dimensions.height;
  const y = surfaceHeight + itemHeight / 2;

  return {
    position: [targetPosition[0], y, targetPosition[2]],
    rotation: [0, 0, 0],
    parentId: surfaceItem.id,
  };
}

/**
 * Find the nearest wall to a position
 */
function findNearestWall(
  position: [number, number, number],
  walls: Wall[]
): { wall: Wall; distance: number; angle: number } | null {
  let nearest: { wall: Wall; distance: number; angle: number } | null = null;
  let minDistance = Infinity;

  walls.forEach((wall) => {
    const distance = distanceToWall(position, wall);
    if (distance < minDistance) {
      minDistance = distance;
      const angle = Math.atan2(
        wall.end[1] - wall.start[1],
        wall.end[0] - wall.start[0]
      );
      nearest = { wall, distance, angle };
    }
  });

  return nearest;
}

/**
 * Calculate distance from a point to a wall
 */
function distanceToWall(position: [number, number, number], wall: Wall): number {
  // Simplified: distance to wall line segment
  const x = position[0];
  const z = position[2];
  
  // Wall endpoints
  const x1 = wall.start[0];
  const z1 = wall.start[1];
  const x2 = wall.end[0];
  const z2 = wall.end[1];
  
  // Calculate perpendicular distance to line segment
  const A = x - x1;
  const B = z - z1;
  const C = x2 - x1;
  const D = z2 - z1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : -1;
  
  let xx, zz;
  
  if (param < 0) {
    xx = x1;
    zz = z1;
  } else if (param > 1) {
    xx = x2;
    zz = z2;
  } else {
    xx = x1 + param * C;
    zz = z1 + param * D;
  }
  
  const dx = x - xx;
  const dz = z - zz;
  
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Get position along a wall closest to target position
 */
function getPositionAlongWall(
  wall: Wall,
  targetPosition: [number, number, number]
): [number, number] {
  const x = targetPosition[0];
  const z = targetPosition[2];

  const x1 = wall.start[0];
  const z1 = wall.start[1];
  const x2 = wall.end[0];
  const z2 = wall.end[1];

  const C = x2 - x1;
  const D = z2 - z1;
  const A = x - x1;
  const B = z - z1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = Math.max(0, Math.min(1, lenSq !== 0 ? dot / lenSq : 0));

  return [x1 + param * C, z1 + param * D];
}

/**
 * Offset a position from a wall by a given distance
 */
function offsetFromWall(
  position: [number, number],
  wall: Wall,
  offset: number
): [number, number] {
  // Calculate wall normal (perpendicular direction)
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.sqrt(dx * dx + dz * dz);

  // Normal vector (perpendicular to wall, pointing inward)
  const normalX = -dz / length;
  const normalZ = dx / length;

  return [
    position[0] + normalX * offset,
    position[1] + normalZ * offset,
  ];
}

/**
 * Find a surface item below a position
 */
function findSurfaceBelow(
  position: [number, number, number],
  items: PlacedItem[]
): PlacedItem | null {
  // Find items that could be surfaces (below the target position)
  const potentialSurfaces = items.filter((item) => {
    const itemTop = item.position[1] + 0.45; // Approximate top surface
    const isBelow = itemTop < position[1];

    // Check if position is within item's horizontal bounds
    const dx = Math.abs(position[0] - item.position[0]);
    const dz = Math.abs(position[2] - item.position[2]);

    // Approximate bounds (will be improved with actual asset dimensions)
    const withinBounds = dx < 0.5 && dz < 0.5;

    return isBelow && withinBounds;
  });

  // Return the highest surface
  if (potentialSurfaces.length === 0) return null;

  return potentialSurfaces.reduce((highest, current) => {
    return current.position[1] > highest.position[1] ? current : highest;
  });
}

/**
 * Check if a placement is valid based on asset rules
 */
export function isPlacementValid(
  asset: Asset,
  context: PlacementContext,
  room: RoomConfig,
  existingItems: PlacedItem[]
): boolean {
  const placementType = asset.placement_rules.type;

  switch (placementType) {
    case 'wall':
      return !!context.attachedToWall;

    case 'countertop':
      return !!context.parentId;

    case 'floor':
    case 'ceiling':
    case 'freestanding':
    default:
      return true;
  }
}

/**
 * Get visual feedback color based on placement validity
 */
export function getPlacementFeedbackColor(isValid: boolean): string {
  return isValid ? '#4ade80' : '#ef4444'; // Green for valid, red for invalid
}

