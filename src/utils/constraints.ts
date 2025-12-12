/**
 * Constraint utilities for 3D object placement
 */
import type { RoomConfig, PlacedItem } from '@/types/designer';

export interface ConstraintResult {
  position: [number, number, number];
  constrained: boolean;
}

/**
 * Calculate room bounds from wall configuration
 */
export function getRoomBounds(room: RoomConfig): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
} {
  if (room.walls.length === 0) {
    return { minX: 0, maxX: 5, minZ: 0, maxZ: 4, height: 2.7 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxHeight = 0;

  room.walls.forEach((wall) => {
    minX = Math.min(minX, wall.start[0], wall.end[0]);
    maxX = Math.max(maxX, wall.start[0], wall.end[0]);
    minZ = Math.min(minZ, wall.start[1], wall.end[1]);
    maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
    maxHeight = Math.max(maxHeight, wall.height);
  });

  return { minX, maxX, minZ, maxZ, height: maxHeight };
}

/**
 * Apply floor constraint - prevent objects from going below floor
 */
export function applyFloorConstraint(
  position: [number, number, number],
  itemHeight: number = 0.9
): ConstraintResult {
  const minY = itemHeight / 2; // Half the object height (objects are centered)
  const constrainedY = Math.max(position[1], minY);
  
  return {
    position: [position[0], constrainedY, position[2]],
    constrained: constrainedY !== position[1],
  };
}

/**
 * Apply room boundary constraints - keep objects within room walls
 */
export function applyRoomBoundaryConstraint(
  position: [number, number, number],
  room: RoomConfig,
  itemDimensions: { width: number; depth: number } = { width: 0.6, depth: 0.6 }
): ConstraintResult {
  const bounds = getRoomBounds(room);
  
  // Add padding based on item dimensions (half width/depth since objects are centered)
  const paddingX = itemDimensions.width / 2;
  const paddingZ = itemDimensions.depth / 2;
  
  const constrainedX = Math.max(
    bounds.minX + paddingX,
    Math.min(position[0], bounds.maxX - paddingX)
  );
  
  const constrainedZ = Math.max(
    bounds.minZ + paddingZ,
    Math.min(position[2], bounds.maxZ - paddingZ)
  );
  
  return {
    position: [constrainedX, position[1], constrainedZ],
    constrained: constrainedX !== position[0] || constrainedZ !== position[2],
  };
}

/**
 * Apply all constraints to an item position
 */
export function applyAllConstraints(
  position: [number, number, number],
  room: RoomConfig,
  item?: Partial<PlacedItem>
): ConstraintResult {
  // Default item dimensions (will be replaced with actual dimensions later)
  const itemHeight = 0.9;
  const itemDimensions = { width: 0.6, depth: 0.6 };
  
  // Apply floor constraint first
  let result = applyFloorConstraint(position, itemHeight);
  
  // Then apply room boundary constraints
  const boundaryResult = applyRoomBoundaryConstraint(result.position, room, itemDimensions);
  
  return {
    position: boundaryResult.position,
    constrained: result.constrained || boundaryResult.constrained,
  };
}

/**
 * Check if a position is valid (within constraints)
 */
export function isPositionValid(
  position: [number, number, number],
  room: RoomConfig
): boolean {
  const result = applyAllConstraints(position, room);
  return !result.constrained;
}

