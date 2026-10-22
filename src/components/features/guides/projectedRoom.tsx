import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { GuideBuild } from '@/lib/installation/guideBuild';
import type { GuideRoom } from '@/lib/installation/guideSchema';
import { cameraOnFrontFace } from '@/lib/installation/photoPlacement';

export interface PhotoSpace {
  texture: THREE.Texture;
  matrix: THREE.Matrix4;
  eye: THREE.Vector3;
  xL: number;
  xR: number;
  left: boolean;
  right: boolean;
  zWall: number;
  zFront: number;
  height: number;
  wall: string;
  floor: string;
  yaw: number;
  pitch: number;
}

const SNAP_M = 0.25;

/** The room the product photo was taken in, rebuilt around the product: the photo's camera, its floor, back wall and corners. */
export function usePhotoSpace(room: GuideRoom | null | undefined, photoUrl: string | null, build: GuideBuild): PhotoSpace | null {
  const url = room?.plate_url ?? photoUrl;
  const front = room?.front ?? null;
  const [space, setSpace] = useState<PhotoSpace | null>(null);
  const key = `${url}|${front?.map((p) => `${p.x},${p.y}`).join(';')}|${room?.corners?.left}|${room?.corners?.right}`;
  useEffect(() => {
    setSpace(null);
    if (!url || !front || !build.hasAssembly) return;
    let live = true;
    let made: THREE.Texture | null = null;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (texture) => {
      if (!live) {
        texture.dispose();
        return;
      }
      const img = texture.image as { width: number; height: number };
      const p = build.product;
      const top = p.center.y + p.size.y / 2;
      const zWall = p.center.z - p.size.z / 2;
      const zFace = p.center.z + p.size.z / 2;
      const cam = cameraOnFrontFace(front, img.width, img.height, p.size.x, top, { x: p.center.x, y: top / 2, z: zFace });
      if (!cam || cam.position[2] <= zFace + 0.3 || cam.position[1] <= 0.05) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      made = texture;
      const photo = new THREE.PerspectiveCamera(cam.fovDeg, img.width / img.height, 0.01, 100);
      photo.position.set(...cam.position);
      photo.quaternion.set(...cam.quaternion);
      photo.updateMatrixWorld();
      const matrix = new THREE.Matrix4().multiplyMatrices(photo.projectionMatrix, photo.matrixWorldInverse);
      const onWall = (u: number, v: number) => {
        const dir = new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5).unproject(photo).sub(photo.position);
        const t = (zWall - photo.position.z) / (dir.z || -1e-6);
        return photo.position.clone().addScaledVector(dir, t);
      };
      const above = Math.max(0, Math.min(...front.map((q) => q.y)) - 0.03);
      const pL = p.center.x - p.size.x / 2;
      const pR = p.center.x + p.size.x / 2;
      const cl = room?.corners?.left;
      const cr = room?.corners?.right;
      const wallL = cl != null ? onWall(cl, above).x : null;
      const wallR = cr != null ? onWall(cr, above).x : null;
      const xL = wallL == null ? pL - 3 : wallL > pL - SNAP_M ? pL - 0.005 : wallL;
      const xR = wallR == null ? pR + 3 : wallR < pR + SNAP_M ? pR + 0.005 : wallR;
      const ceiling = onWall(0.5, 0).y;
      const to = photo.position.clone().sub(new THREE.Vector3(p.center.x, p.center.y, p.center.z));
      setSpace({
        texture,
        matrix,
        eye: photo.position.clone(),
        xL,
        xR,
        left: wallL != null,
        right: wallR != null,
        zWall,
        zFront: photo.position.z + 0.6,
        height: Math.min(3.4, Math.max(2.5, ceiling)),
        wall: room?.wall ?? '#e9e6e1',
        floor: room?.floor ?? '#d9d3c9',
        yaw: Math.atan2(to.x, to.z),
        pitch: Math.asin(Math.max(-1, Math.min(1, to.y / (to.length() || 1)))),
      });
    }, undefined, () => { if (live) setSpace(null); });
    return () => {
      live = false;
      made?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, build.product, build.hasAssembly]);
  return space;
}

const VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = `
uniform sampler2D map;
uniform mat4 photoMatrix;
uniform vec3 fallback;
uniform float opacity;
varying vec3 vWorld;
void main() {
  vec4 p = photoMatrix * vec4(vWorld, 1.0);
  vec3 col = fallback;
  if (p.w > 0.0) {
    vec2 uv = p.xy / p.w * 0.5 + 0.5;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    if (edge > 0.0) col = mix(fallback, texture2D(map, uv).rgb, smoothstep(0.0, 0.03, edge));
  }
  gl_FragColor = vec4(col, opacity);
  #include <colorspace_fragment>
}`;

function projected(space: PhotoSpace, fallback: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: space.texture },
      photoMatrix: { value: space.matrix },
      fallback: { value: new THREE.Color(fallback) },
      opacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

function SideWall({ space, x, turn, depth }: { space: PhotoSpace; x: number; turn: number; depth: number }) {
  const camera = useThree((st) => st.camera);
  const material = useMemo(() => projected(space, space.wall), [space]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, delta) => {
    const inward = turn > 0 ? camera.position.x - x : x - camera.position.x;
    const u = material.uniforms.opacity;
    u.value += ((inward < -0.1 ? 0.1 : 1) - u.value) * (1 - Math.exp(-delta * 8));
    material.transparent = u.value < 0.99;
    material.depthWrite = !material.transparent;
  });
  return (
    <mesh position={[x, space.height / 2, space.zWall + depth / 2]} rotation={[0, turn, 0]} material={material}>
      <planeGeometry args={[depth, space.height]} />
    </mesh>
  );
}

export function ProjectedRoom({ space, build }: { space: PhotoSpace; build: GuideBuild }) {
  const floorMat = useMemo(() => projected(space, space.floor), [space]);
  const wallMat = useMemo(() => projected(space, space.wall), [space]);
  const ceilingMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f3f1ec', side: THREE.BackSide }), []);
  const disposed = useRef([floorMat, wallMat, ceilingMat]);
  disposed.current = [floorMat, wallMat, ceilingMat];
  useEffect(() => () => disposed.current.forEach((m) => m.dispose()), []);

  const kitFront = build.kitBounds.center.z + build.kitBounds.size.z / 2 + 0.6;
  const zFront = Math.max(space.zFront, kitFront);
  const depth = zFront - space.zWall;
  const width = space.xR - space.xL;
  const cx = (space.xL + space.xR) / 2;
  const cz = space.zWall + depth / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} material={floorMat}>
        <planeGeometry args={[width + 6, depth]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, cz]} receiveShadow>
        <planeGeometry args={[width + 6, depth]} />
        <shadowMaterial transparent opacity={0.3} />
      </mesh>
      <mesh position={[cx, space.height / 2, space.zWall]} material={wallMat}>
        <planeGeometry args={[width, space.height]} />
      </mesh>
      <mesh position={[cx, space.height / 2, space.zWall + 0.001]} receiveShadow>
        <planeGeometry args={[width, space.height]} />
        <shadowMaterial transparent opacity={0.18} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, space.height, cz]} material={ceilingMat}>
        <planeGeometry args={[width, depth]} />
      </mesh>
      {space.left && <SideWall space={space} x={space.xL} turn={Math.PI / 2} depth={depth} />}
      {space.right && <SideWall space={space} x={space.xR} turn={-Math.PI / 2} depth={depth} />}
      <pointLight position={[cx, space.height - 0.2, space.zWall + 0.8]} intensity={2.4} distance={8} color="#ffffff" />
      <directionalLight position={[space.eye.x, space.eye.y + 1, space.eye.z]} intensity={1.1} color="#ffffff" />
    </group>
  );
}
