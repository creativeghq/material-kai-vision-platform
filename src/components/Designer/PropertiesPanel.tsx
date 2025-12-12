/**
 * Properties Panel - Right panel with object properties and transform controls
 */
import React from 'react';
import { Copy, Trash2, Lock, Unlock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useSceneStore } from '@/stores/sceneStore';
import { SnapSettingsPanel } from './SnapSettingsPanel';

export const PropertiesPanel: React.FC = () => {
  const { items, selectedIds, updateItem, duplicateItem, deleteItem, toggleItemLock } =
    useSceneStore();

  const selectedItem = selectedIds.length === 1 ? items.find((i) => i.id === selectedIds[0]) : null;

  if (!selectedItem) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Properties</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Select an object to view and edit its properties
              </p>
            </div>
            <Separator />
            <SnapSettingsPanel />
          </div>
        </ScrollArea>
      </div>
    );
  }

  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const newPosition: [number, number, number] = [...selectedItem.position];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newPosition[axisIndex] = numValue;
    updateItem(selectedItem.id, { position: newPosition });
  };

  const handleRotationChange = (axis: 'x' | 'y' | 'z', value: string) => {
    const degrees = parseFloat(value);
    if (isNaN(degrees)) return;

    const radians = (degrees * Math.PI) / 180;
    const newRotation: [number, number, number] = [...selectedItem.rotation];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newRotation[axisIndex] = radians;
    updateItem(selectedItem.id, { rotation: newRotation });
  };

  const handleScaleChange = (axis: 'x' | 'y' | 'z', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;

    const newScale: [number, number, number] = [...selectedItem.scale];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newScale[axisIndex] = numValue;
    updateItem(selectedItem.id, { scale: newScale });
  };

  const handleReset = () => {
    updateItem(selectedItem.id, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Properties</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          {/* Quick Actions */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => duplicateItem(selectedItem.id)}
                disabled={selectedItem.locked}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteItem(selectedItem.id)}
                disabled={selectedItem.locked}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleItemLock(selectedItem.id)}
              >
                {selectedItem.locked ? (
                  <>
                    <Unlock className="mr-2 h-4 w-4" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Lock
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={selectedItem.locked}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <Separator />

          {/* Transform - Position */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Position (meters)</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="pos-x" className="text-xs">
                  X
                </Label>
                <Input
                  id="pos-x"
                  type="number"
                  step="0.01"
                  value={selectedItem.position[0].toFixed(2)}
                  onChange={(e) => handlePositionChange('x', e.target.value)}
                  disabled={selectedItem.locked}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="pos-y" className="text-xs">
                  Y
                </Label>
                <Input
                  id="pos-y"
                  type="number"
                  step="0.01"
                  value={selectedItem.position[1].toFixed(2)}
                  onChange={(e) => handlePositionChange('y', e.target.value)}
                  disabled={selectedItem.locked}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="pos-z" className="text-xs">
                  Z
                </Label>
                <Input
                  id="pos-z"
                  type="number"
                  step="0.01"
                  value={selectedItem.position[2].toFixed(2)}
                  onChange={(e) => handlePositionChange('z', e.target.value)}
                  disabled={selectedItem.locked}
                  className="col-span-3"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Transform - Rotation */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Rotation (degrees)</h3>
            <div className="space-y-2">
              {(['x', 'y', 'z'] as const).map((axis, idx) => (
                <div key={axis} className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor={`rot-${axis}`} className="text-xs uppercase">
                    {axis}
                  </Label>
                  <Input
                    id={`rot-${axis}`}
                    type="number"
                    step="1"
                    value={Math.round((selectedItem.rotation[idx] * 180) / Math.PI)}
                    onChange={(e) => handleRotationChange(axis, e.target.value)}
                    disabled={selectedItem.locked}
                    className="col-span-3"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Transform - Scale */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Scale</h3>
            <div className="space-y-2">
              {(['x', 'y', 'z'] as const).map((axis, idx) => (
                <div key={axis} className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor={`scale-${axis}`} className="text-xs uppercase">
                    {axis}
                  </Label>
                  <Input
                    id={`scale-${axis}`}
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={selectedItem.scale[idx].toFixed(2)}
                    onChange={(e) => handleScaleChange(axis, e.target.value)}
                    disabled={selectedItem.locked}
                    className="col-span-3"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

