/** Colour, relief and gloss for a surface: the product's own image, or the library material its colour, name or part calls for. */
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { linearOfHex, pickMaterial, tintFor, type SceneMaterial } from '@/lib/scene/sceneMaterials';
import { AssetContext } from '@/components/features/scenestudio/assetContext';
import type { Finish } from '@/lib/scene/sceneSurfaces';
import { sceneMaterials } from '@/services/sceneMaterialsService';

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

export interface Look {
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
  /** Linear factor on the map, or the plain colour itself. */
  colour: [number, number, number];
  normalScale: number;
  roughness: number;
  /** Metres one repeat covers, for the colour and gloss and for the relief. */
  tile: [number, number];
  reliefTile: [number, number];
}

const cache = new Map<string, Promise<Look>>();
const loader = new TextureLoader();
const shared = new Map<string, Promise<Texture>>();

function loadTexture(url: string, colour: boolean): Promise<Texture> {
  const hit = shared.get(url);
  if (hit) return hit;
  const job = loader.loadAsync(url).then((t) => {
    t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping;
    t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = 8;
    return t;
  });
  job.catch(() => shared.delete(url));
  shared.set(url, job);
  return job;
}

async function libraryLook(m: SceneMaterial, hex: string | null): Promise<Look> {
  const [map, normalMap, roughnessMap] = await Promise.all([loadTexture(m.albedoUrl, true), loadTexture(m.normalUrl, false), loadTexture(m.roughnessUrl, false)]);
  return {
    map, normalMap, roughnessMap, colour: tintFor(m, hex), normalScale: m.normalScale, roughness: m.roughnessFactor,
    tile: [m.tileM, m.tileM], reliefTile: [m.tileM, m.tileM],
  };
}

const plainLook = (hex: string, roughness: number): Look => ({
  map: null, normalMap: null, roughnessMap: null, colour: linearOfHex(hex), normalScale: 1, roughness, tile: [1, 1], reliefTile: [1, 1],
});

const decors = new Map<string, Promise<Look>>();

/** One colour of a product as its own flat decor; the fine relief and gloss follow its grain. */
function decorLook(url: string, coversM: number): Promise<Look> {
  const hit = decors.get(url);
  if (hit) return hit;
  const job = loadImage(url).then((img): Look => {
    const side = Math.min(1024, img.width);
    const c = document.createElement('canvas'); c.width = side; c.height = side;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, side, side);
    const { normalMap, roughnessMap } = reliefMaps(luminance(g, side, side), null, side, side, { strength: 0.9, rough: 0.5, roughJoint: 0.5 });
    return { map: tex(c, true), normalMap, roughnessMap, colour: [1, 1, 1], normalScale: 1, roughness: 1, tile: [coversM, coversM], reliefTile: [coversM, coversM] };
  });
  job.catch(() => decors.delete(url));
  decors.set(url, job);
  return job;
}

interface Profile { normalMap: Texture; shade: Float32Array }

const profiles = new Map<string, Profile>();

/** Relief that only changes across the width of a board: its flutes, and the joint with the next board. */
function boardProfile(key: string, columns: Float32Array | null, widthM: number): Profile {
  const hit = profiles.get(key);
  if (hit) return hit;
  const w = 1024; const h = 4;
  const height = new Float32Array(w * h).fill(1);
  const joint = Math.max(2, Math.round((0.0025 / widthM) * w));
  for (let x = 0; x < w; x++) {
    let v = 1;
    if (columns) {
      const at = (x / w) * columns.length - 0.5;
      const i = Math.max(0, Math.floor(at)); const j = Math.min(columns.length - 1, i + 1);
      v = columns[i] + (columns[j] - columns[i]) * Math.max(0, at - i);
    } else if (x < joint) v = Math.abs(x - joint / 2) / (joint / 2);
    for (let y = 0; y < h; y++) height[y * w + x] = v;
  }
  const { normalMap, roughnessMap } = reliefMaps(height, null, w, h, { strength: columns ? 9 : 2.4, rough: 1, roughJoint: 1 });
  roughnessMap.dispose();
  const made = { normalMap, shade: height.slice(0, w).map((v) => 0.4 + 0.6 * v) };
  profiles.set(key, made);
  return made;
}

const shaded = new Map<string, Texture>();
const BOARDS = 8;

/** The finish across eight boards with their grooves shaded in, so they read however the room is lit. */
function shadedBoards(key: string, base: Look, shade: Float32Array, widthM: number): Texture {
  const hit = shaded.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const img = base.map?.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (img) {
    const px = (base.tile[0] / (widthM * BOARDS)) * c.width;
    for (let x = 0; x < c.width; x += px) g.drawImage(img, x, 0, px, c.height);
  }
  g.globalCompositeOperation = 'multiply';
  for (let x = 0; x < c.width; x++) {
    const v = Math.round(255 * shade[Math.floor((((x / c.width) * BOARDS) % 1) * shade.length)]);
    g.fillStyle = `rgb(${v}, ${v}, ${v})`;
    g.fillRect(x, 0, 1, c.height);
  }
  const made = tex(c, true);
  shaded.set(key, made);
  return made;
}

const SWATCH_MIN_PX = 256;

interface Swatch { img: HTMLImageElement; small: boolean; columns: Float32Array | null; spread: number }

/** What a catalogue swatch can tell: how big it is, how much it varies, and whether it only varies from side to side (flutes). */
async function readSwatch(url: string): Promise<Swatch> {
  const img = await loadImage(url);
  const w = Math.min(img.width, 128); const h = Math.min(img.height, 128);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const lum = luminance(g, w, h);
  const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
  const spread = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / lum.length);
  const cols = new Float32Array(w);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) cols[x] += lum[y * w + x]; cols[x] /= h; }
  const across = Math.sqrt(cols.reduce((s, v) => s + (v - mean) ** 2, 0) / w);
  const lo = Math.min(...cols); const hi = Math.max(...cols);
  const striped = spread > 0.04 && across / spread > 0.75;
  return { img, small: Math.min(img.width, img.height) < SWATCH_MIN_PX, spread, columns: striped ? cols.map((v) => (v - lo) / Math.max(0.01, hi - lo)) : null };
}

const swatches = new Map<string, Promise<Swatch>>();
const readOnce = (url: string) => {
  const hit = swatches.get(url);
  if (hit) return hit;
  const job = readSwatch(url);
  job.catch(() => swatches.delete(url));
  swatches.set(url, job);
  return job;
};

function imageLook(f: Finish, img: HTMLImageElement, wood: boolean): Promise<Look> {
  const key = `${f.imageUrl}|${f.jointed ? `${f.tileW}x${f.tileL}` : 'c'}|${wood ? 'w' : ''}|${f.normalUrl ?? ''}|${f.roughnessUrl ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (async (): Promise<Look> => {
    const aspect = f.jointed ? f.tileL / f.tileW : img.height / img.width;
    const w = Math.min(1024, Math.max(512, img.width)); const h = Math.max(64, Math.min(2048, Math.round(w * aspect)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const scale = Math.max(w / img.width, h / img.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
    let joint: Uint8Array | null = null;
    if (f.jointed) {
      const px = Math.max(1, Math.round(((wood ? 0.001 : 0.0025) / f.tileW) * w));
      g.fillStyle = wood ? 'rgba(58, 40, 26, 0.75)' : 'rgba(176, 171, 163, 0.9)';
      g.fillRect(0, 0, w, px); g.fillRect(0, 0, px, h);
      joint = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < px || y < px) joint[y * w + x] = 1;
    }
    const height = luminance(g, w, h);
    if (joint) for (let i = 0; i < height.length; i++) if (joint[i]) height[i] = 0;
    const relief = reliefMaps(height, joint, w, h, { strength: f.jointed ? 1.4 : 0.8, rough: f.jointed && !wood ? 0.36 : 0.6, roughJoint: 0.95 });
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
    return { map: tex(c, true), normalMap, roughnessMap, colour: [1, 1, 1], normalScale: 1, roughness: 1, tile: [f.tileW, f.tileL], reliefTile: [f.tileW, f.tileL] };
  })();
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  return job;
}

/** Boards thinner than this are flat; a striped swatch of one shows another board's flutes. */
const FLUTED_MIN_MM = 10;

export interface LookWant { role: string | null; fallback: string; rough?: number }

export async function buildLook(f: Finish | null, want: LookWant): Promise<Look> {
  const library = await sceneMaterials().catch(() => []);
  const hex = f?.hex ?? null;
  const text = f?.label ?? null;
  if (!f?.imageUrl) {
    const colour = hex ?? want.fallback;
    const m = pickMaterial(library, { role: want.role, text, hex: colour });
    return m ? libraryLook(m, m.kind === 'wood' && !hex ? null : colour) : plainLook(colour, want.rough ?? 0.6);
  }
  const named = pickMaterial(library, { role: null, text, hex });
  const swatch = await readOnce(f.imageUrl);
  if (!f.colourTexture && (!swatch.small || !hex)) return imageLook(f, swatch.img, named?.kind === 'wood');
  if (!f.colourTexture && !named && swatch.spread > 0.05 && !swatch.columns) return imageLook(f, swatch.img, false);
  const base = f.colourTexture ? await decorLook(f.colourTexture.url, f.colourTexture.coversM)
    : named ? await libraryLook(named, hex) : plainLook(hex ?? want.fallback, want.rough ?? 0.42);
  const onWall = want.role?.startsWith('surface:') ?? false;
  const fluted = swatch.columns && (f.thicknessMm ?? 0) >= FLUTED_MIN_MM ? swatch.columns : null;
  if (!fluted && !(onWall && f.jointed)) return base;
  const key = `${fluted ? f.imageUrl : 'flat'}|${f.tileW}`;
  const p = boardProfile(key, fluted, f.tileW);
  const map = shadedBoards(`${key}|${base.map?.uuid ?? ''}`, base, p.shade, f.tileW);
  return { ...base, map, roughnessMap: null, normalMap: p.normalMap, roughness: 0.5, normalScale: 1, tile: [f.tileW * BOARDS, base.tile[1]], reliefTile: [f.tileW, 1] };
}

/** This mesh's own copies of the finish's textures, laid at their real size over `widthM` × `heightM`. */
export function useLook(finish: Finish | null, want: LookWant, widthM: number, heightM: number, offsetX = 0, offsetY = 0): Look | null {
  const [base, setBase] = useState<Look | null>(null);
  const track = useContext(AssetContext);
  const id = useId();
  const latest = useRef({ finish, want });
  latest.current = { finish, want };
  const key = `${want.role}|${want.fallback}|${want.rough ?? ''}|${finish ? `${finish.imageUrl}|${finish.hex}|${finish.label}|${finish.jointed}|${finish.tileW}|${finish.tileL}|${finish.thicknessMm ?? ''}|${finish.colourTexture?.url ?? ''}|${finish.normalUrl ?? ''}|${finish.roughnessUrl ?? ''}` : ''}`;
  useEffect(() => {
    let live = true;
    const { finish: f, want: n } = latest.current;
    track(id, true);
    buildLook(f, n).then((m) => { if (live) setBase(m); })
      .catch(() => { if (live) setBase(plainLook(f?.hex ?? n.fallback, n.rough ?? 0.6)); })
      .finally(() => { if (live) track(id, false); });
    return () => { live = false; track(id, false); };
  }, [key, id, track]);
  const own = useMemo(() => {
    if (!base) return null;
    const place = (t: Texture | null, [tw, tl]: [number, number]) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(widthM / tw, heightM / tl);
      c.offset.set(offsetX / tw, offsetY / tl);
      c.needsUpdate = true;
      return c;
    };
    return { ...base, map: place(base.map, base.tile), roughnessMap: place(base.roughnessMap, base.tile), normalMap: place(base.normalMap, base.reliefTile) };
  }, [base, widthM, heightM, offsetX, offsetY]);
  useEffect(() => () => { own?.map?.dispose(); own?.normalMap?.dispose(); own?.roughnessMap?.dispose(); }, [own]);
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
