/**
 * Snap Settings Panel - Configure snapping behavior
 */
import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore } from '@/stores/uiStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const SnapSettingsPanel: React.FC = () => {
  const { snapSettings, setSnapSettings } = useUIStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Snap Settings</CardTitle>
        <CardDescription>Configure object snapping behavior</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grid Snap Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="grid-snap" className="text-sm">
            Grid Snap
          </Label>
          <Switch
            id="grid-snap"
            checked={snapSettings.enabled}
            onCheckedChange={(checked) => setSnapSettings({ enabled: checked })}
          />
        </div>

        {/* Grid Size */}
        {snapSettings.enabled && (
          <div className="space-y-2">
            <Label htmlFor="grid-size" className="text-sm">
              Grid Size
            </Label>
            <Select
              value={snapSettings.gridSize.toString()}
              onValueChange={(value) => setSnapSettings({ gridSize: parseFloat(value) })}
            >
              <SelectTrigger id="grid-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.05">5 cm</SelectItem>
                <SelectItem value="0.10">10 cm</SelectItem>
                <SelectItem value="0.25">25 cm</SelectItem>
                <SelectItem value="0.50">50 cm</SelectItem>
                <SelectItem value="1.00">1 m</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Rotation Snap */}
        {snapSettings.enabled && (
          <div className="space-y-2">
            <Label htmlFor="rotation-snap" className="text-sm">
              Rotation Snap
            </Label>
            <Select
              value={snapSettings.rotationSnap.toString()}
              onValueChange={(value) => setSnapSettings({ rotationSnap: parseInt(value) })}
            >
              <SelectTrigger id="rotation-snap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5°</SelectItem>
                <SelectItem value="15">15°</SelectItem>
                <SelectItem value="45">45°</SelectItem>
                <SelectItem value="90">90°</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Hint */}
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p>Hold <kbd className="rounded bg-background px-1.5 py-0.5">Shift</kbd> to temporarily disable snapping</p>
        </div>
      </CardContent>
    </Card>
  );
};

