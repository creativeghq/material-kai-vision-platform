/**
 * Transform Controls - Gizmo for transforming selected objects
 */
import React, { useRef, useEffect } from 'react';
import { TransformControls as DreiTransformControls } from '@react-three/drei';
import { useSceneStore } from '@/stores/sceneStore';
import { useUIStore } from '@/stores/uiStore';
import type { TransformControls as TransformControlsType } from 'three-stdlib';

export const TransformControls: React.FC = () => {
  const { items, selectedIds, selectedMeshRef, updateItem } = useSceneStore();
  const { activeTool, snapSettings } = useUIStore();
  const controlsRef = useRef<TransformControlsType>(null);

  const selectedItem = selectedIds.length === 1 ? items.find((i) => i.id === selectedIds[0]) : null;

  // Attach controls to the selected mesh
  useEffect(() => {
    if (controlsRef.current && selectedMeshRef) {
      controlsRef.current.attach(selectedMeshRef);
    }
  }, [selectedMeshRef]);

  useEffect(() => {
    if (controlsRef.current && selectedMeshRef) {
      const controls = controlsRef.current;

      const handleChange = () => {
        if (!selectedItem || selectedItem.locked) return;

        // Get the attached object from the controls
        const object = selectedMeshRef;
        if (!object) return;

        // Update item position, rotation, or scale based on active tool
        if (activeTool === 'translate') {
          updateItem(selectedItem.id, {
            position: [object.position.x, object.position.y, object.position.z],
          });
        } else if (activeTool === 'rotate') {
          updateItem(selectedItem.id, {
            rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          });
        } else if (activeTool === 'scale') {
          updateItem(selectedItem.id, {
            scale: [object.scale.x, object.scale.y, object.scale.z],
          });
        }
      };

      (controls as any).addEventListener('change', handleChange);
      return () => {
        (controls as any).removeEventListener('change', handleChange);
      };
    }
  }, [selectedItem, selectedMeshRef, activeTool, updateItem]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const { setActiveTool } = useUIStore.getState();

      switch (e.key.toLowerCase()) {
        case 'g':
          setActiveTool('translate');
          break;
        case 'r':
          setActiveTool('rotate');
          break;
        case 's':
          setActiveTool('scale');
          break;
        case 'delete':
        case 'backspace':
          if (selectedIds.length > 0) {
            useSceneStore.getState().deleteSelectedItems();
          }
          break;
      }

      // Ctrl+D for duplicate
      if (e.ctrlKey && e.key === 'd' && selectedItem) {
        e.preventDefault();
        useSceneStore.getState().duplicateItem(selectedItem.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedItem]);

  // Don't show controls if no item selected or if locked
  if (!selectedItem || !selectedMeshRef) {
    return null;
  }

  // Show controls but prevent transformation if locked
  return (
    <DreiTransformControls
      ref={controlsRef}
      mode={activeTool}
      enabled={!selectedItem.locked}
      translationSnap={snapSettings.enabled ? snapSettings.gridSize : undefined}
      rotationSnap={
        snapSettings.enabled ? (snapSettings.rotationSnap * Math.PI) / 180 : undefined
      }
      scaleSnap={snapSettings.enabled ? 0.1 : undefined}
    />
  );
};

