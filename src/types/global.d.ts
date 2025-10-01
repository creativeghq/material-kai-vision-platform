// Global type declarations for missing modules

declare module '@tanstack/react-query' {
  export * from 'react-query';
}



declare module '@supabase/supabase-js' {
  export const createClient: any;
  export const SupabaseClient: any;
  export const AuthError: any;
  export const PostgrestError: any;
  export const StorageError: any;
  export const FunctionsError: any;
  export const RealtimeChannel: any;
  export const RealtimeClient: any;
  export const GoTrueClient: any;
  export const SupabaseAuthClient: any;
  export const SupabaseQueryBuilder: any;
  export const SupabaseStorageClient: any;
  export const SupabaseFunctionsClient: any;
  export const SupabaseRealtimeClient: any;
}

declare module 'three' {
  export const TextureLoader: any;
  export const BoxGeometry: any;
  export const PlaneGeometry: any;
  export const SphereGeometry: any;
  export const MeshStandardMaterial: any;
  export const MeshBasicMaterial: any;
  export const Mesh: any;
  export const Group: any;
  export const Scene: any;
  export const PerspectiveCamera: any;
  export const OrthographicCamera: any;
  export const WebGLRenderer: any;
  export const AmbientLight: any;
  export const DirectionalLight: any;
  export const PointLight: any;
  export const SpotLight: any;
  export const HemisphereLight: any;
  export const Vector3: any;
  export const Vector2: any;
  export const Euler: any;
  export const Quaternion: any;
  export const Matrix4: any;
  export const Color: any;
  export const Fog: any;
  export const FogExp2: any;
  export const Texture: any;
  export const VideoTexture: any;
  export const DataTexture: any;
  export const CubeTexture: any;
  export const CanvasTexture: any;
  export const Clock: any;
  export const AnimationMixer: any;
  export const AnimationClip: any;
  export const KeyframeTrack: any;
  export const BufferGeometry: any;
  export const BufferAttribute: any;
  export const Float32BufferAttribute: any;
  export const Uint16BufferAttribute: any;
  export const Uint32BufferAttribute: any;
}



declare module '@react-three/drei' {
  import { ComponentType } from 'react';
  export const OrbitControls: ComponentType<any>;
  export const PerspectiveCamera: ComponentType<any>;
  export const Environment: ComponentType<any>;
}

declare module '@supabase/supabase-js' {
  export const createClient: any;
  export * from 'supabase';
}

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
  export const TextureLoader: any;
  export * from '@types/three';
}
declare module 'use-sync-external-store' {}
declare module 'webxr' {}
declare module 'yargs-parser' {}

// React Three Fiber JSX namespace augmentation
declare module '@react-three/fiber' {
  import { ComponentType, ReactNode } from 'react';
  export const Canvas: ComponentType<any>;
  export const useLoader: any;
  export const useFrame: any;
  export const useThree: any;
  export const extend: any;
  export const createRoot: any;
  export const events: any;
  export const invalidate: any;
  export const advance: any;
  export const render: any;
  export const unmountComponentAtNode: any;
  export const act: any;
}

// Global JSX namespace for React Three Fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Three.js mesh elements
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
