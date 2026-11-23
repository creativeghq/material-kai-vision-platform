/** Colour, relief and gloss for a surface finish, derived in the browser from the product image (joints recessed, glaze from tone). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { Finish } from '@/lib/scene/sceneSurfaces';

export interface FinishMaps { map: Texture | null; normalMap: Texture; roughnessMap: Texture }

const cache = new Map<string, Promise<FinishMaps>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

const tex = (c: HTMLCanvasElement, colour: boolean): Texture => {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping;
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Normal and roughness from a height field; `joint` marks recessed pixels. Edges wrap so the result tiles. */
export function reliefMaps(height: Float32Array, joint: Uint8Array | null, w: number, h: number, opts: { strength: number; rough: number; roughJoint: number }) {
  const normal = document.createElement('canvas'); normal.width = w; normal.height = h;
  const rough = document.createElement('canvas'); rough.width = w; rough.height = h;
  const n = normal.getContext('2d')!.createImageData(w, h);
  const r = rough.getContext('2d')!.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * opts.strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * opts.strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      n.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      n.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      n.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      n.data[i + 3] = 255;
      const g = joint?.[y * w + x] ? opts.roughJoint : opts.rough + (0.5 - at(x, y)) * 0.12;
      r.data[i] = r.data[i + 1] = r.data[i + 2] = Math.max(0, Math.min(1, g)) * 255;
      r.data[i + 3] = 255;
    }
  }
  normal.getContext('2d')!.putImageData(n, 0, 0);
  rough.getContext('2d')!.putImageData(r, 0, 0);
  return { normalMap: tex(normal, false), roughnessMap: tex(rough, false) };
}

function luminance(g: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const d = g.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return out;
}

let plaster: Promise<FinishMaps> | null = null;

/** Painted plaster: a soft trowelled relief, no colour of its own. */
export function plasterMaps(): Promise<FinishMaps> {
  if (plaster) return plaster;
  const w = 256; const h = 256;
  const height = new Float32Array(w * h);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 900; k++) {
    const cx = rnd() * w; const cy = rnd() * h; const rad = 4 + rnd() * 18; const amp = (rnd() - 0.5) * 0.25;
    for (let y = Math.floor(cy - rad); y < cy + rad; y++) {
      for (let x = Math.floor(cx - rad); x < cx + rad; x++) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d < 1) height[((y + h) % h) * w + ((x + w) % w)] += amp * (1 - d * d);
      }
    }
  }
  for (let i = 0; i < height.length; i++) height[i] = 0.5 + height[i] + (rnd() - 0.5) * 0.04;
  plaster = Promise.resolve({ map: null, ...reliefMaps(height, null, w, h, { strength: 1.6, rough: 0.92, roughJoint: 0.92 }) });
  return plaster;
}

/** Oak boards: grain from the albedo, board joints recessed. */
export function canvasRelief(source: HTMLCanvasElement, strength: number, rough: number): FinishMaps {
  const w = 512; const h = Math.round(512 * (source.height / source.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0, w, h);
  return { map: null, ...reliefMaps(luminance(g, w, h), null, w, h, { strength, rough, roughJoint: 0.9 }) };
}

function buildFinish(f: Finish): Promise<FinishMaps> {
  if (!f.imageUrl) return plasterMaps();
  const key = `${f.imageUrl}|${f.jointed ? `${f.tileW}x${f.tileL}` : 'c'}|${f.normalUrl ?? ''}|${f.roughnessUrl ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = loadImage(f.imageUrl).then(async (img) => {
    const aspect = f.jointed ? f.tileL / f.tileW : img.height / img.width;
    const w = 512; const h = Math.max(64, Math.min(2048, Math.round(512 * aspect)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const scale = Math.max(w / img.width, h / img.height);
    g.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
    let joint: Uint8Array | null = null;
    if (f.jointed) {
      const px = Math.max(2, Math.round((0.003 / f.tileW) * w));
      g.fillStyle = 'rgba(200, 195, 186, 0.92)';
      g.fillRect(0, 0, w, px); g.fillRect(0, 0, px, h);
      joint = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < px || y < px) joint[y * w + x] = 1;
    }
    const height = luminance(g, w, h);
    if (joint) for (let i = 0; i < height.length; i++) if (joint[i]) height[i] = 0;
    const relief = reliefMaps(height, joint, w, h, { strength: f.jointed ? 2.2 : 1.2, rough: f.jointed ? 0.32 : 0.75, roughJoint: 0.95 });
    const stored = async (url: string | null | undefined, fallback: Texture) => {
      if (!url) return fallback;
      const im = await loadImage(url).catch(() => null);
      if (!im) return fallback;
      const sc = document.createElement('canvas'); sc.width = w; sc.height = h;
      sc.getContext('2d')!.drawImage(im, 0, 0, w, h);
      fallback.dispose();
      return tex(sc, false);
    };
    const [normalMap, roughnessMap] = await Promise.all([stored(f.normalUrl, relief.normalMap), stored(f.roughnessUrl, relief.roughnessMap)]);
    return { map: tex(c, true), normalMap, roughnessMap };
  });
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  return job;
}

/** This mesh's own copies of the finish maps, laid at the finish's real size over `widthM` × `heightM`. */
export function useFinishMaps(finish: Finish | null, widthM: number, heightM: number, offsetX = 0, offsetY = 0): FinishMaps | null {
  const [base, setBase] = useState<FinishMaps | null>(null);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const key = finish ? `${finish.imageUrl}|${finish.jointed}|${finish.tileW}|${finish.tileL}|${finish.normalUrl ?? ''}|${finish.roughnessUrl ?? ''}` : 'plaster';
  useEffect(() => {
    let live = true;
    const f = finishRef.current;
    const job = f ? buildFinish(f) : plasterMaps();
    job.then((m) => { if (live) setBase(m); }).catch(() => { void plasterMaps().then((m) => { if (live) setBase(m); }); });
    return () => { live = false; };
  }, [key]);
  const tileW = finish?.imageUrl ? finish.tileW : 0.8;
  const tileL = finish?.imageUrl ? finish.tileL : 0.8;
  const own = useMemo(() => {
    if (!base) return null;
    const place = (t: Texture) => {
      const c = t.clone();
      c.repeat.set(widthM / tileW, heightM / tileL);
      c.offset.set(offsetX / tileW, offsetY / tileL);
      c.needsUpdate = true;
      return c;
    };
    return { map: base.map ? place(base.map) : null, normalMap: place(base.normalMap), roughnessMap: place(base.roughnessMap) };
  }, [base, widthM, heightM, tileW, tileL, offsetX, offsetY]);
  useEffect(() => () => { own?.map?.dispose(); own?.normalMap.dispose(); own?.roughnessMap.dispose(); }, [own]);
  return own;
}

const tones = new Map<string, Promise<[number, number, number]>>();

export function finishTone(f: Finish): Promise<[number, number, number]> {
  if (f.hex && !f.imageUrl) {
    const n = Number.parseInt(f.hex.slice(1), 16);
    return Promise.resolve([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
  }
  const url = f.imageUrl!;
  const hit = tones.get(url);
  if (hit) return hit;
  const job = loadImage(url).then((img) => {
    const c = document.createElement('canvas'); c.width = 24; c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    let r = 0; let gr = 0; let b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
    const k = (d.length / 4) * 255;
    return [r / k, gr / k, b / k] as [number, number, number];
  });
  job.catch(() => tones.delete(url));
  tones.set(url, job);
  return job;
}
