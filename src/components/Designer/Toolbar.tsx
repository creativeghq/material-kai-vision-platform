/**
 * Toolbar - Top toolbar with file, edit, view, tools menus
 */
import React, { useState } from 'react';
import {
  Save,
  FolderOpen,
  Download,
  Share2,
  Undo,
  Redo,
  Grid3x3,
  Move,
  RotateCw,
  Maximize,
  Eye,
  EyeOff,
  Settings,
  Layers,
  Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/uiStore';
import { useSceneStore } from '@/stores/sceneStore';
import { cn } from '@/lib/utils';
import { logger } from '@/services/logger.service';
import { RoomSettingsModal } from './RoomSettingsModal';

export const Toolbar: React.FC = () => {
  const { activeTool, setActiveTool, togglePanel, panelVisibility, cameraMode, setCameraMode } = useUIStore();
  const {
    settings,
    setSettings,
    room,
    toggleWallVisibility,
    setAllWallsVisibility,
    history,
    undo,
    redo,
  } = useSceneStore();
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);

  // Check if all walls are visible
  const allWallsVisible = room.walls.every((wall) => wall.visible !== false);
  const anyWallHidden = room.walls.some((wall) => wall.visible === false);

  // Check if undo/redo is available
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleSave = () => {
    // TODO: Implement save functionality
    logger.debug('Save project');
  };

  const handleLoad = () => {
    // TODO: Implement load functionality
    logger.debug('Load project');
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    logger.debug('Export project');
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    logger.debug('Share project');
  };

  const handleUndo = () => {
    if (canUndo) {
      undo();
      logger.debug('Undo');
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      redo();
      logger.debug('Redo');
    }
  };

  return (
    <div className="flex h-14 items-center gap-2 border-b bg-card px-4">
      {/* File Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleSave}>
          <Save className="h-4 w-4" />
          <span className="ml-2">Save</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLoad}>
          <FolderOpen className="h-4 w-4" />
          <span className="ml-2">Open</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          <span className="ml-2">Export</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleShare}>
          <Share2 className="h-4 w-4" />
          <span className="ml-2">Share</span>
        </Button>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Edit Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Room Settings */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRoomSettingsOpen(true)}
          title="Room Settings"
        >
          <Home className="h-4 w-4" />
          <span className="ml-2">Room</span>
        </Button>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Transform Tools */}
      <div className="flex items-center gap-1">
        <Button
          variant={activeTool === 'translate' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setActiveTool('translate')}
          title="Translate (G)"
        >
          <Move className="h-4 w-4" />
        </Button>
        <Button
          variant={activeTool === 'rotate' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setActiveTool('rotate')}
          title="Rotate (R)"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant={activeTool === 'scale' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setActiveTool('scale')}
          title="Scale (S)"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* View Options */}
      <div className="flex items-center gap-1">
        {/* 2D/3D View Toggle */}
        <Button
          variant={cameraMode === 'topDown' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setCameraMode(cameraMode === 'topDown' ? 'orbit' : 'topDown')}
          title={cameraMode === 'topDown' ? 'Switch to 3D View' : 'Switch to 2D Top-Down View'}
        >
          {cameraMode === 'topDown' ? (
            <span className="text-xs font-bold">3D</span>
          ) : (
            <span className="text-xs font-bold">2D</span>
          )}
        </Button>

        <Button
          variant={settings.gridVisible ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setSettings({ gridVisible: !settings.gridVisible })}
          title="Toggle Grid"
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>

        {/* Wall Visibility Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={anyWallHidden ? 'default' : 'ghost'}
              size="icon"
              title="Wall Visibility"
            >
              <Layers className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Wall Visibility</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAllWallsVisibility(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Show All Walls
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAllWallsVisibility(false)}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide All Walls
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {room.walls.map((wall, index) => (
              <DropdownMenuItem key={wall.id} onClick={() => toggleWallVisibility(wall.id)}>
                {wall.visible !== false ? (
                  <Eye className="mr-2 h-4 w-4" />
                ) : (
                  <EyeOff className="mr-2 h-4 w-4 opacity-50" />
                )}
                Wall {index + 1}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('assetLibrary')}
          title="Toggle Asset Library"
          className={cn(!panelVisibility.assetLibrary && 'opacity-50')}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => togglePanel('properties')}
          title="Toggle Properties"
          className={cn(!panelVisibility.properties && 'opacity-50')}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <div className="ml-auto text-sm text-muted-foreground">
        <span className="font-medium">3D Room Designer</span>
      </div>

      {/* Room Settings Modal */}
      <RoomSettingsModal open={roomSettingsOpen} onOpenChange={setRoomSettingsOpen} />
    </div>
  );
};

