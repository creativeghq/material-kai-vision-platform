/**
 * Toolbar - Top toolbar with file, edit, view, tools menus
 */
import React from 'react';
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
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUIStore } from '@/stores/uiStore';
import { useSceneStore } from '@/stores/sceneStore';
import { cn } from '@/lib/utils';

export const Toolbar: React.FC = () => {
  const { activeTool, setActiveTool, togglePanel, panelVisibility } = useUIStore();
  const { settings, setSettings } = useSceneStore();

  const handleSave = () => {
    // TODO: Implement save functionality
    console.log('Save project');
  };

  const handleLoad = () => {
    // TODO: Implement load functionality
    console.log('Load project');
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export project');
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    console.log('Share project');
  };

  const handleUndo = () => {
    // TODO: Implement undo
    console.log('Undo');
  };

  const handleRedo = () => {
    // TODO: Implement redo
    console.log('Redo');
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
        <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo (Ctrl+Z)">
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo className="h-4 w-4" />
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
        <Button
          variant={settings.gridVisible ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setSettings({ gridVisible: !settings.gridVisible })}
          title="Toggle Grid"
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>
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
    </div>
  );
};

