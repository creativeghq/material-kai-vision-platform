// JSX namespace extensions for React Three Fiber
// This file extends the global JSX namespace to include Three.js elements

import * as React from 'react';

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