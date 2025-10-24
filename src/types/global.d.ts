// Global type declarations for missing modules

declare module '@tanstack/react-query' {
  export * from 'react-query';
}



// Removed Supabase declarations - using Edge Functions instead

declare module 'three' {
  export const TextureLoader: unknown;
  export const BoxGeometry: unknown;
  export const PlaneGeometry: unknown;
  export const SphereGeometry: unknown;
  export const MeshStandardMaterial: unknown;
  export const MeshBasicMaterial: unknown;
  export const Mesh: unknown;
  export const Group: unknown;
  export const Scene: unknown;
  export const PerspectiveCamera: unknown;
  export const OrthographicCamera: unknown;
  export const WebGLRenderer: unknown;
  export const AmbientLight: unknown;
  export const DirectionalLight: unknown;
  export const PointLight: unknown;
  export const SpotLight: unknown;
  export const HemisphereLight: unknown;
  export const Vector3: unknown;
  export const Vector2: unknown;
  export const Euler: unknown;
  export const Quaternion: unknown;
  export const Matrix4: unknown;
  export const Color: unknown;
  export const Fog: unknown;
  export const FogExp2: unknown;
  export const Texture: unknown;
  export const VideoTexture: unknown;
  export const DataTexture: unknown;
  export const CubeTexture: unknown;
  export const CanvasTexture: unknown;
  export const Clock: unknown;
  export const AnimationMixer: unknown;
  export const AnimationClip: unknown;
  export const KeyframeTrack: unknown;
  export const BufferGeometry: unknown;
  export const BufferAttribute: unknown;
  export const Float32BufferAttribute: unknown;
  export const Uint16BufferAttribute: unknown;
  export const Uint32BufferAttribute: unknown;
}



declare module '@react-three/drei' {
  import { ComponentType } from 'react';
  export const OrbitControls: ComponentType<Record<string, unknown>>;
  export const PerspectiveCamera: ComponentType<Record<string, unknown>>;
  export const Environment: ComponentType<Record<string, unknown>>;
}

// Removed duplicate Supabase declarations

// Suppress automatic type library inclusion
declare module 'babel__core' {}
declare module 'babel__generator' {}
declare module 'babel__template' {}
declare module 'babel__traverse' {}
declare module 'd3-array' {}
declare module 'd3-color' {}
declare module 'd3-ease' {}
declare module 'd3-interpolate' {}
declare module 'd3-path' {}
declare module 'd3-scale' {}
declare module 'd3-shape' {}
declare module 'd3-time' {}
declare module 'd3-timer' {}
declare module 'draco3d' {}
declare module 'history' {}
declare module 'istanbul-lib-coverage' {}
declare module 'istanbul-lib-report' {}
declare module 'istanbul-reports' {}
declare module 'json5' {}
declare module 'offscreencanvas' {}
declare module 'phoenix' {}
declare module 'prop-types' {}
declare module 'react-reconciler' {}
declare module 'stack-utils' {}
declare module 'stats.js' {}
declare module 'three' {
  export const TextureLoader: unknown;
  export * from '@types/three';
}
declare module 'use-sync-external-store' {}
declare module 'webxr' {}
declare module 'yargs-parser' {}

// React Three Fiber JSX namespace augmentation
declare module '@react-three/fiber' {
  import { ComponentType, ReactNode } from 'react';
  export const Canvas: ComponentType<Record<string, unknown>>;
  export const useLoader: unknown;
  export const useFrame: unknown;
  export const useThree: unknown;
  export const extend: unknown;
  export const createRoot: unknown;
  export const events: unknown;
  export const invalidate: unknown;
  export const advance: unknown;
  export const render: unknown;
  export const unmountComponentAtNode: unknown;
  export const act: unknown;
}

// Global JSX namespace for React Three Fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Three.js mesh elements
      mesh: unknown;
      group: unknown;
      primitive: unknown;

      // Geometries
      boxGeometry: unknown;
      planeGeometry: unknown;
      sphereGeometry: unknown;
      cylinderGeometry: unknown;
      coneGeometry: unknown;
      torusGeometry: unknown;
      bufferGeometry: unknown;

      // Materials
      meshStandardMaterial: unknown;
      meshBasicMaterial: unknown;
      meshLambertMaterial: unknown;
      meshPhongMaterial: unknown;
      meshToonMaterial: unknown;
      meshNormalMaterial: unknown;
      meshMatcapMaterial: unknown;
      meshDepthMaterial: unknown;
      meshDistanceMaterial: unknown;
      meshPhysicalMaterial: unknown;
      lineBasicMaterial: unknown;
      lineDashedMaterial: unknown;
      pointsMaterial: unknown;
      rawShaderMaterial: unknown;
      shaderMaterial: unknown;
      spriteMaterial: unknown;

      // Lights
      ambientLight: unknown;
      directionalLight: unknown;
      hemisphereLight: unknown;
      pointLight: unknown;
      rectAreaLight: unknown;
      spotLight: unknown;

      // Cameras
      perspectiveCamera: unknown;
      orthographicCamera: unknown;

      // Other elements
      scene: unknown;
      fog: unknown;
      fogExp2: unknown;
      texture: unknown;
      videoTexture: unknown;
      dataTexture: unknown;
      dataTexture3D: unknown;
      compressedTexture: unknown;
      cubeTexture: unknown;
      canvasTexture: unknown;
      points: unknown;
      line: unknown;
      sprite: unknown;
      instancedMesh: unknown;
      skinnedMesh: unknown;
      skeleton: unknown;
      bone: unknown;
      animationMixer: unknown;
      keyframeTrack: unknown;
      propertyMixer: unknown;
      propertyBinding: unknown;
      quaternionKeyframeTrack: unknown;
      vectorKeyframeTrack: unknown;
      colorKeyframeTrack: unknown;
      numberKeyframeTrack: unknown;
      booleanKeyframeTrack: unknown;
      stringKeyframeTrack: unknown;
      bufferAttribute: unknown;
    }
  }
}
