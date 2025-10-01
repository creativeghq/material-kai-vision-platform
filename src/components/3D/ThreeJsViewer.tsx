import React, { Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { TextureLoader } from 'three';

// Local JSX namespace extension for Three.js elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Mesh and group elements
      mesh: any;
      group: any;
      primitive: any;

      // Geometries
      boxGeometry: any;
      planeGeometry: any;
      sphereGeometry: any;
      cylinderGeometry: any;
      coneGeometry: any;
      torusGeometry: any;
      bufferGeometry: any;

      // Materials
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      meshLambertMaterial: any;
      meshPhongMaterial: any;
      meshToonMaterial: any;
      meshNormalMaterial: any;
      meshMatcapMaterial: any;
      meshDepthMaterial: any;
      meshDistanceMaterial: any;
      meshPhysicalMaterial: any;
      lineBasicMaterial: any;
      lineDashedMaterial: any;
      pointsMaterial: any;
      rawShaderMaterial: any;
      shaderMaterial: any;
      spriteMaterial: any;

      // Lights
      ambientLight: any;
      directionalLight: any;
      hemisphereLight: any;
      pointLight: any;
      rectAreaLight: any;
      spotLight: any;

      // Cameras
      perspectiveCamera: any;
      orthographicCamera: any;

      // Other elements
      scene: any;
      fog: any;
      fogExp2: any;
      texture: any;
      videoTexture: any;
      dataTexture: any;
      dataTexture3D: any;
      compressedTexture: any;
      cubeTexture: any;
      canvasTexture: any;
      points: any;
      line: any;
      sprite: any;
      instancedMesh: any;
      skinnedMesh: any;
      skeleton: any;
      bone: any;
      animationMixer: any;
      keyframeTrack: any;
      propertyMixer: any;
      propertyBinding: any;
      quaternionKeyframeTrack: any;
      vectorKeyframeTrack: any;
      colorKeyframeTrack: any;
      numberKeyframeTrack: any;
      booleanKeyframeTrack: any;
      stringKeyframeTrack: any;
      bufferAttribute: any;
    }
  }
}

import { Card } from '@/components/ui/card';

interface ThreeJsViewerProps {
  imageUrl?: string;
  modelUrl?: string;
  meshUrl?: string;
  className?: string;
}

const NeRFModel: React.FC<{ modelUrl: string }> = ({ modelUrl: _modelUrl }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  // In a real implementation, this would load and render the NeRF model
  // For now, we'll show an enhanced cube representing the 3D reconstruction
  return React.createElement('mesh', { position: [0, 0, 0] },
    React.createElement('boxGeometry', { args: [2, 2, 2] }),
    React.createElement('meshStandardMaterial', {
      color: "hsl(210 40% 98%)",
      transparent: true,
      opacity: 0.8,
      wireframe: false
    })
  );
};

const ImageTexturedCube: React.FC<{ imageUrl: string }> = ({ imageUrl }) => {
  const texture = useLoader(TextureLoader, imageUrl);

  return React.createElement('mesh', { position: [0, 0, 0] },
    React.createElement('boxGeometry', { args: [2, 2, 2] }),
    React.createElement('meshStandardMaterial', { map: texture })
  );
};

const Scene: React.FC<{
  imageUrl?: string;
  modelUrl?: string;
  meshUrl?: string;
}> = ({ imageUrl, modelUrl, meshUrl: _meshUrl }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  return (
    <>
      <PerspectiveCamera makeDefault fov={75} position={[0, 0, 5]} />
      <Environment preset="studio" />

      {/* Enhanced lighting for 3D models */}
      {React.createElement('ambientLight', { intensity: 0.6 })}
      {React.createElement('directionalLight', { position: [10, 10, 5], intensity: 1.2 })}
      {React.createElement('directionalLight', { position: [-10, -10, -5], intensity: 0.5 })}

      {/* Render NeRF model if available */}
      {modelUrl ? (
        <NeRFModel modelUrl={modelUrl} />
      ) : imageUrl ? (
        <ImageTexturedCube imageUrl={imageUrl} />
      ) : (
        /* Fallback placeholder */
        React.createElement('mesh', { position: [0, 0, 0] },
          React.createElement('boxGeometry', { args: [2, 2, 2] }),
          React.createElement('meshStandardMaterial', { color: "hsl(210 40% 98%)", wireframe: true })
        )
      )}

      {/* Floor plane */}
      {React.createElement('mesh', { rotation: [-Math.PI / 2, 0, 0], position: [0, -2, 0] },
        React.createElement('planeGeometry', { args: [10, 10] }),
        React.createElement('meshStandardMaterial', { color: "#6B7280", transparent: true, opacity: 0.3 })
      )}

      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
};

export const ThreeJsViewer: React.FC<ThreeJsViewerProps> = ({
  imageUrl,
  modelUrl,
  meshUrl,
  className = 'h-96 w-full',
}) => {
  return (
    <Card className={`${className} overflow-hidden`}>
      <div className="h-full w-full bg-gradient-to-br from-background to-muted">
        <Canvas>
          <Suspense fallback={null}>
            <Scene
              {...(imageUrl && { imageUrl })}
              {...(modelUrl && { modelUrl })}
              {...(meshUrl && { meshUrl })}
            />
          </Suspense>
        </Canvas>
      </div>
    </Card>
  );
};
