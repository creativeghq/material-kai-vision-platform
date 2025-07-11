import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Card } from '@/components/ui/card';

interface ThreeJsViewerProps {
  imageUrl?: string;
  className?: string;
}

const Scene: React.FC<{ imageUrl?: string }> = ({ imageUrl }) => {
  return (
    <>
      <PerspectiveCamera makeDefault fov={75} position={[0, 0, 5]} />
      <Environment preset="studio" />
      
      {/* Basic scene lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      {/* Simple placeholder geometry */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#4F46E5" wireframe />
      </mesh>
      
      {/* Floor plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#6B7280" transparent opacity={0.3} />
      </mesh>
      
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
};

export const ThreeJsViewer: React.FC<ThreeJsViewerProps> = ({ 
  imageUrl, 
  className = "h-96 w-full" 
}) => {
  return (
    <Card className={`${className} overflow-hidden`}>
      <div className="h-full w-full bg-gradient-to-br from-background to-muted">
        <Canvas>
          <Suspense fallback={null}>
            <Scene imageUrl={imageUrl} />
          </Suspense>
        </Canvas>
      </div>
    </Card>
  );
};