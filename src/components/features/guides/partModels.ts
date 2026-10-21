import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { BuildItem, GuideBuild } from '@/lib/installation/guideBuild';

export type HardwareShape = 'screw' | 'nail' | 'dowel' | 'cam' | 'hinge' | 'plate' | 'bracket' | 'knob' | 'foot' | 'pin';

export function hardwareShape(name: string): HardwareShape {
  const n = name.toLowerCase();
  if (/mounting plate/.test(n)) return 'plate';
  if (/bracket|angle/.test(n)) return 'bracket';
  if (/hinge/.test(n) && !/screw/.test(n)) return 'hinge';
  if (/knob|handle|pull/.test(n)) return 'knob';
  if (/foot|feet|leg|glide/.test(n)) return 'foot';
  if (/\bcam\b|cam lock/.test(n)) return 'cam';
  if (/dowel/.test(n)) return 'dowel';
  if (/nail/.test(n)) return 'nail';
  if (/screw|bolt/.test(n)) return 'screw';
  return 'pin';
}

const WOODEN: HardwareShape[] = ['dowel'];

export function hardwareLook(shape: HardwareShape): { color: string; metalness: number; roughness: number } {
  if (WOODEN.includes(shape)) return { color: '#c8975a', metalness: 0, roughness: 0.75 };
  if (shape === 'foot') return { color: '#3a3b3e', metalness: 0.1, roughness: 0.6 };
  if (shape === 'knob') return { color: '#b8bcc2', metalness: 0.85, roughness: 0.28 };
  return { color: '#aeb4bb', metalness: 0.8, roughness: 0.32 };
}

const HOLE_SCALE: Record<HardwareShape, number> = {
  screw: 0.32, nail: 0.22, dowel: 1, cam: 1, hinge: 0.84, plate: 0.3, bracket: 0.12, knob: 0.3, foot: 0.62, pin: 1,
};

/** Hardware drawn along +Y with its outer end (head, knob, foot pad) at +Y and the end that goes in at -Y. */
export function hardwareGeometry(shape: HardwareShape, d: number, L: number): THREE.BufferGeometry {
  const at = (g: THREE.BufferGeometry, x: number, y: number, z = 0) => g.translate(x, y, z);
  const bottom = -L / 2;
  const parts: THREE.BufferGeometry[] = [];
  switch (shape) {
    case 'screw': {
      const head = L * 0.14;
      parts.push(at(new THREE.CylinderGeometry(d * 0.17, d * 0.05, L - head, 12), 0, bottom + (L - head) / 2));
      parts.push(at(new THREE.CylinderGeometry(d * 0.5, d * 0.22, head, 16), 0, L / 2 - head / 2));
      break;
    }
    case 'nail': {
      parts.push(at(new THREE.CylinderGeometry(d * 0.12, d * 0.04, L * 0.95, 8), 0, bottom + L * 0.475));
      parts.push(at(new THREE.CylinderGeometry(d * 0.42, d * 0.42, L * 0.05, 14), 0, L / 2 - L * 0.025));
      break;
    }
    case 'dowel': {
      parts.push(new THREE.CylinderGeometry(d / 2, d / 2, L * 0.9, 14));
      parts.push(at(new THREE.CylinderGeometry(d * 0.42, d / 2, L * 0.05, 14), 0, L * 0.475));
      parts.push(at(new THREE.CylinderGeometry(d / 2, d * 0.42, L * 0.05, 14), 0, -L * 0.475));
      break;
    }
    case 'cam': {
      parts.push(new THREE.CylinderGeometry(d / 2, d / 2, L, 20));
      parts.push(at(new THREE.BoxGeometry(d * 0.7, L * 0.12, d * 0.12), 0, L / 2));
      break;
    }
    case 'hinge': {
      const cupH = L * 0.14;
      const armH = L * 0.08;
      parts.push(at(new THREE.CylinderGeometry(d * 0.42, d * 0.42, cupH, 24), 0, bottom + cupH / 2));
      parts.push(at(new THREE.BoxGeometry(L * 0.78, armH, d * 0.55), L * 0.25, bottom + cupH + armH / 2 - L * 0.02));
      parts.push(at(new THREE.CylinderGeometry(d * 0.12, d * 0.12, armH * 1.2, 10), L * 0.5, bottom + cupH + armH));
      break;
    }
    case 'plate': {
      parts.push(at(new THREE.BoxGeometry(d * 1.1, L * 0.12, d * 0.5), 0, bottom + L * 0.06));
      break;
    }
    case 'bracket': {
      const t = d * 0.08;
      parts.push(at(new THREE.BoxGeometry(d, t, d * 0.45), 0, bottom + t / 2));
      parts.push(at(new THREE.BoxGeometry(t, L * 0.9, d * 0.45), -d / 2 + t / 2, bottom + L * 0.45));
      break;
    }
    case 'knob': {
      parts.push(at(new THREE.CylinderGeometry(d * 0.14, d * 0.18, L * 0.55, 14), 0, bottom + L * 0.275));
      const ball = new THREE.SphereGeometry(d * 0.5, 20, 14);
      ball.scale(1, 0.7, 1);
      parts.push(at(ball, 0, bottom + L * 0.55 + d * 0.3));
      break;
    }
    case 'foot': {
      parts.push(at(new THREE.CylinderGeometry(d * 0.3, d * 0.3, L * 0.8, 16), 0, bottom + L * 0.4));
      parts.push(at(new THREE.CylinderGeometry(d * 0.5, d * 0.55, L * 0.2, 20), 0, L / 2 - L * 0.1));
      break;
    }
    default:
      parts.push(new THREE.CylinderGeometry(d / 2, d / 2, L, 12));
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

export interface Hole {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
}

/** Where a panel is drilled: one hole per piece of hardware it hosts, on the face that piece goes into. */
export function panelHoles(build: GuideBuild, panelIndex: number, nameOf: (it: BuildItem) => string): Hole[] {
  const host = build.items[panelIndex];
  const out: Hole[] = [];
  for (const it of build.items) {
    if (it.host !== panelIndex) continue;
    const dir = { x: it.approach.x - it.target.pos.x, y: it.approach.y - it.target.pos.y, z: it.approach.z - it.target.pos.z };
    const axis = (['x', 'y', 'z'] as const).reduce((a, b) => (Math.abs(dir[b]) > Math.abs(dir[a]) ? b : a), 'x' as 'x' | 'y' | 'z');
    const sign = Math.sign(dir[axis]) || 1;
    const pos = new THREE.Vector3(it.target.pos.x, it.target.pos.y, it.target.pos.z);
    pos[axis] = sign * (host.size[axis] / 2 + 0.0006);
    const normal = new THREE.Vector3();
    normal[axis] = sign;
    const radius = (it.size.x / 2) * HOLE_SCALE[hardwareShape(nameOf(it))];
    if (!out.some((h) => h.pos.distanceTo(pos) < radius)) out.push({ pos, normal, radius });
  }
  return out;
}

let woodCache: THREE.CanvasTexture | null = null;

/** A pale laminate grain, drawn once and shared by every panel. */
export function woodTexture(): THREE.CanvasTexture | null {
  if (woodCache || typeof document === 'undefined') return woodCache;
  const size = 512;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#eadfc8';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 140; i++) {
    const y0 = rand() * size;
    const amp = 2 + rand() * 6;
    const freq = 0.004 + rand() * 0.01;
    const phase = rand() * Math.PI * 2;
    ctx.strokeStyle = rand() > 0.5 ? `rgba(160,120,70,${0.05 + rand() * 0.09})` : `rgba(255,250,235,${0.08 + rand() * 0.1})`;
    ctx.lineWidth = 0.6 + rand() * 1.8;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  woodCache = new THREE.CanvasTexture(canvas);
  woodCache.colorSpace = THREE.SRGBColorSpace;
  woodCache.wrapS = THREE.RepeatWrapping;
  woodCache.wrapT = THREE.RepeatWrapping;
  woodCache.anisotropy = 4;
  return woodCache;
}

export function useStudioLight(scene: THREE.Scene, renderer: THREE.WebGLRenderer, intensity: number) {
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [scene, renderer, intensity]);
}

export const EDGE_BANDING = '#d3c3a3';
export const WOOD_TINT = '#f2e4ca';
export const HOLE_COLOR = '#2a2117';

/** The number a part carries everywhere it is shown: its place in the manual's kit list. */
export const partNumber = (partIndex: number) => partIndex + 1;
