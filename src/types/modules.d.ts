// Module declarations for external libraries
// This file provides TypeScript declarations for modules that don't have built-in types

// CSS Modules
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
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

declare module '@react-three/drei' {
  import { ComponentType } from 'react';
  export const OrbitControls: ComponentType<any>;
  export const PerspectiveCamera: ComponentType<any>;
  export const Environment: ComponentType<any>;
  export const Text: ComponentType<any>;
  export const Box: ComponentType<any>;
  export const Sphere: ComponentType<any>;
  export const Plane: ComponentType<any>;
  export const Cylinder: ComponentType<any>;
  export const Cone: ComponentType<any>;
  export const Torus: ComponentType<any>;
  export const useGLTF: any;
  export const useTexture: any;
  export const Center: ComponentType<any>;
  export const Bounds: ComponentType<any>;
  export const ContactShadows: ComponentType<any>;
  export const Float: ComponentType<any>;
  export const Html: ComponentType<any>;
  export const Image: ComponentType<any>;
  export const Instances: ComponentType<any>;
  export const Instance: ComponentType<any>;
  export const Lightformer: ComponentType<any>;
  export const MeshDistortMaterial: ComponentType<any>;
  export const MeshWobbleMaterial: ComponentType<any>;
  export const Points: ComponentType<any>;
  export const PointMaterial: ComponentType<any>;
  export const Preload: ComponentType<any>;
  export const RandomizedLight: ComponentType<any>;
  export const Reflector: ComponentType<any>;
  export const RenderTexture: ComponentType<any>;
  export const Sky: ComponentType<any>;
  export const Sparkles: ComponentType<any>;
  export const Stars: ComponentType<any>;
  export const Stats: ComponentType<any>;
  export const Trail: ComponentType<any>;
  export const TransformControls: ComponentType<any>;
  export const useBounds: any;
  export const useHelper: any;
  export const useAnimations: any;
  export const useProgress: any;
  export const useKeyboardControls: any;
  export const KeyboardControls: ComponentType<any>;
  export const PointerLockControls: ComponentType<any>;
  export const FlyControls: ComponentType<any>;
  export const MapControls: ComponentType<any>;
  export const TrackballControls: ComponentType<any>;
  export const ArcballControls: ComponentType<any>;
  export const FirstPersonControls: ComponentType<any>;
}
