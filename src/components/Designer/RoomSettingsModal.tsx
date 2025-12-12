/**
 * Room Settings Modal - Configure room dimensions and properties
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSceneStore } from '@/stores/sceneStore';
import type { RoomConfig } from '@/types/designer';

interface RoomSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({ open, onOpenChange }) => {
  const { room, setRoom } = useSceneStore();

  // Calculate current room dimensions from walls
  const getCurrentDimensions = () => {
    if (room.walls.length === 0) return { width: 5, depth: 4, height: 2.7 };

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    room.walls.forEach((wall) => {
      minX = Math.min(minX, wall.start[0], wall.end[0]);
      maxX = Math.max(maxX, wall.start[0], wall.end[0]);
      minZ = Math.min(minZ, wall.start[1], wall.end[1]);
      maxZ = Math.max(maxZ, wall.start[1], wall.end[1]);
    });

    return {
      width: maxX - minX,
      depth: maxZ - minZ,
      height: room.walls[0]?.height || 2.7,
    };
  };

  const currentDims = getCurrentDimensions();
  const [width, setWidth] = useState(currentDims.width);
  const [depth, setDepth] = useState(currentDims.depth);
  const [height, setHeight] = useState(currentDims.height);
  const [wallThickness, setWallThickness] = useState(0.15);

  const handleApply = () => {
    // Create new rectangular room with specified dimensions
    const newRoom: RoomConfig = {
      walls: [
        { id: 'wall-1', start: [0, 0], end: [width, 0], height, thickness: wallThickness, material: 'white-paint' },
        { id: 'wall-2', start: [width, 0], end: [width, depth], height, thickness: wallThickness, material: 'white-paint' },
        { id: 'wall-3', start: [width, depth], end: [0, depth], height, thickness: wallThickness, material: 'white-paint' },
        { id: 'wall-4', start: [0, depth], end: [0, 0], height, thickness: wallThickness, material: 'white-paint' },
      ],
      openings: room.openings,
      floor: room.floor,
      ceiling: { ...room.ceiling, height },
    };

    setRoom(newRoom);
    onOpenChange(false);
  };

  const floorArea = width * depth;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Room Settings</DialogTitle>
          <DialogDescription>
            Configure room dimensions and properties. Changes will update the room in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Dimensions */}
          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Dimensions</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="width">Width (m)</Label>
                <Input
                  id="width"
                  type="number"
                  min="2"
                  max="20"
                  step="0.1"
                  value={width}
                  onChange={(e) => setWidth(parseFloat(e.target.value) || 2)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="depth">Depth (m)</Label>
                <Input
                  id="depth"
                  type="number"
                  min="2"
                  max="20"
                  step="0.1"
                  value={depth}
                  onChange={(e) => setDepth(parseFloat(e.target.value) || 2)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="height">Height (m)</Label>
                <Input
                  id="height"
                  type="number"
                  min="2.2"
                  max="5"
                  step="0.1"
                  value={height}
                  onChange={(e) => setHeight(parseFloat(e.target.value) || 2.2)}
                />
              </div>
            </div>

            <div className="rounded-md bg-muted p-3 text-sm">
              <span className="font-medium">Floor Area:</span> {floorArea.toFixed(2)} m²
            </div>
          </div>

          {/* Wall Properties */}
          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Wall Properties</h3>
            
            <div className="space-y-2">
              <Label htmlFor="thickness">Wall Thickness</Label>
              <Select value={wallThickness.toString()} onValueChange={(v) => setWallThickness(parseFloat(v))}>
                <SelectTrigger id="thickness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.10">10 cm</SelectItem>
                  <SelectItem value="0.15">15 cm</SelectItem>
                  <SelectItem value="0.20">20 cm</SelectItem>
                  <SelectItem value="0.30">30 cm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

