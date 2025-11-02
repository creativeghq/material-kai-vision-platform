// Module declarations for external libraries
// This file provides TypeScript declarations for modules that don't have built-in types

// CSS Modules
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '@supabase/supabase-js' {
  export const createClient: unknown;
  export const SupabaseClient: unknown;
  export const AuthError: unknown;
  export const PostgrestError: unknown;
  export const StorageError: unknown;
  export const FunctionsError: unknown;
  export const RealtimeChannel: unknown;
  export const RealtimeClient: unknown;
  export const GoTrueClient: unknown;
  export const SupabaseAuthClient: unknown;
  export const SupabaseQueryBuilder: unknown;
  export const SupabaseStorageClient: unknown;
  export const SupabaseFunctionsClient: unknown;
  export const SupabaseRealtimeClient: unknown;
}

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

declare module '@react-three/drei' {
  import { ComponentType } from 'react';
  export const OrbitControls: ComponentType<Record<string, unknown>>;
  export const PerspectiveCamera: ComponentType<Record<string, unknown>>;
  export const Environment: ComponentType<Record<string, unknown>>;
  export const Text: ComponentType<Record<string, unknown>>;
  export const Box: ComponentType<Record<string, unknown>>;
  export const Sphere: ComponentType<Record<string, unknown>>;
  export const Plane: ComponentType<Record<string, unknown>>;
  export const Cylinder: ComponentType<Record<string, unknown>>;
  export const Cone: ComponentType<Record<string, unknown>>;
  export const Torus: ComponentType<Record<string, unknown>>;
  export const useGLTF: unknown;
  export const useTexture: unknown;
  export const Center: ComponentType<Record<string, unknown>>;
  export const Bounds: ComponentType<Record<string, unknown>>;
  export const ContactShadows: ComponentType<Record<string, unknown>>;
  export const Float: ComponentType<Record<string, unknown>>;
  export const Html: ComponentType<Record<string, unknown>>;
  export const Image: ComponentType<Record<string, unknown>>;
  export const Instances: ComponentType<Record<string, unknown>>;
  export const Instance: ComponentType<Record<string, unknown>>;
  export const Lightformer: ComponentType<Record<string, unknown>>;
  export const MeshDistortMaterial: ComponentType<Record<string, unknown>>;
  export const MeshWobbleMaterial: ComponentType<Record<string, unknown>>;
  export const Points: ComponentType<Record<string, unknown>>;
  export const PointMaterial: ComponentType<Record<string, unknown>>;
  export const Preload: ComponentType<Record<string, unknown>>;
  export const RandomizedLight: ComponentType<Record<string, unknown>>;
  export const Reflector: ComponentType<Record<string, unknown>>;
  export const RenderTexture: ComponentType<Record<string, unknown>>;
  export const Sky: ComponentType<Record<string, unknown>>;
  export const Sparkles: ComponentType<Record<string, unknown>>;
  export const Stars: ComponentType<Record<string, unknown>>;
  export const Stats: ComponentType<Record<string, unknown>>;
  export const Trail: ComponentType<Record<string, unknown>>;
  export const TransformControls: ComponentType<Record<string, unknown>>;
  export const useBounds: unknown;
  export const useHelper: unknown;
  export const useAnimations: unknown;
  export const useProgress: unknown;
  export const useKeyboardControls: unknown;
  export const KeyboardControls: ComponentType<Record<string, unknown>>;
  export const PointerLockControls: ComponentType<Record<string, unknown>>;
  export const FlyControls: ComponentType<Record<string, unknown>>;
  export const MapControls: ComponentType<Record<string, unknown>>;
  export const TrackballControls: ComponentType<Record<string, unknown>>;
  export const ArcballControls: ComponentType<Record<string, unknown>>;
  export const FirstPersonControls: ComponentType<Record<string, unknown>>;
}
