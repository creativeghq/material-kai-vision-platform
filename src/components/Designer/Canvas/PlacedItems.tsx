/**
 * Placed Items - Renders all placed objects in the scene
 */
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSceneStore } from '@/stores/sceneStore';

interface PlacedItemMeshProps {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  locked: boolean;
  isSelected: boolean;
  onSelect: () => void;
  meshRef?: React.RefObject<THREE.Mesh>;
}

const PlacedItemMesh: React.FC<PlacedItemMeshProps> = ({
  position,
  rotation,
  scale,
  locked,
  isSelected,
  onSelect,
  meshRef,
}) => {
  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        // Allow selection of locked items so they can be unlocked
        onSelect();
      }}
      castShadow
      receiveShadow
    >
      {/* Placeholder cube - will be replaced with actual GLB models */}
      <boxGeometry args={[0.6, 0.9, 0.6]} />
      <meshStandardMaterial
        color={locked ? '#9ca3af' : isSelected ? '#3b82f6' : '#6366f1'}
        metalness={0.3}
        roughness={0.7}
      />
      {/* Selection outline */}
      {isSelected && (
        <lineSegments>
          <edgesGeometry attach="geometry" args={[new THREE.BoxGeometry(0.6, 0.9, 0.6)]} />
          <lineBasicMaterial attach="material" color="#3b82f6" linewidth={2} />
        </lineSegments>
      )}
    </mesh>
  );
};

export const PlacedItems: React.FC = () => {
  const { items, selectedIds, selectItem, deselectAll, setSelectedMeshRef } = useSceneStore();
  const meshRefs = useRef<Map<string, React.RefObject<THREE.Mesh>>>(new Map());

  // Create or get ref for each item
  const getMeshRef = (itemId: string) => {
    if (!meshRefs.current.has(itemId)) {
      meshRefs.current.set(itemId, React.createRef<THREE.Mesh>());
    }
    return meshRefs.current.get(itemId)!;
  };

  // Update the selected mesh ref when selection changes
  useEffect(() => {
    if (selectedIds.length === 1) {
      const selectedId = selectedIds[0];
      const meshRef = meshRefs.current.get(selectedId);
      if (meshRef?.current) {
        setSelectedMeshRef(meshRef.current);
      }
    } else {
      setSelectedMeshRef(null);
    }
  }, [selectedIds, setSelectedMeshRef]);

  const handleBackgroundClick = () => {
    deselectAll();
  };

  return (
    <>
      {/* Background click handler */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        onClick={handleBackgroundClick}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
      </mesh>

      {/* Render all placed items */}
      {items.map((item) => (
        <PlacedItemMesh
          key={item.id}
          id={item.id}
          position={item.position}
          rotation={item.rotation}
          scale={item.scale}
          locked={item.locked}
          isSelected={selectedIds.includes(item.id)}
          onSelect={() => selectItem(item.id, false)}
          meshRef={getMeshRef(item.id)}
        />
      ))}
    </>
  );
};

