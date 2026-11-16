import type { SceneProduct, SceneSurface } from '@/services/sceneStudioService';
import { tileFormatM } from '@/components/features/roomplanner/surfaceFormat';

export type SurfaceTarget =
  | { roomId: string; surface: 'floor' | 'ceiling' | 'walls' }
  | { roomId: string; surface: 'wall'; wallId: string }
  | { roomId: string; surface: 'splash'; wallId: string; fromMm: number; toMm: number };

export const DEFAULT_SPLASH = { fromMm: 900, toMm: 1500 } as const;

export const surfaceKey = (s: { room_id: string; surface: string; wall_id?: string | null }) =>
  `${s.room_id}:${s.surface}:${s.wall_id ?? ''}`;

export const targetKey = (t: SurfaceTarget) =>
  surfaceKey({ room_id: t.roomId, surface: t.surface, wall_id: 'wallId' in t ? t.wallId : null });

export function indexSurfaces(surfaces: SceneSurface[]): Map<string, SceneSurface> {
  return new Map(surfaces.map((s) => [surfaceKey(s), s]));
}

export function wallFaceFinish(index: Map<string, SceneSurface>, roomId: string | null, wallId: string): SceneSurface | null {
  if (!roomId) return null;
  return index.get(surfaceKey({ room_id: roomId, surface: 'wall', wall_id: wallId }))
    ?? index.get(surfaceKey({ room_id: roomId, surface: 'walls' }))
    ?? null;
}

export function splashFinish(index: Map<string, SceneSurface>, roomId: string | null, wallId: string): SceneSurface | null {
  if (!roomId) return null;
  return index.get(surfaceKey({ room_id: roomId, surface: 'splash', wall_id: wallId })) ?? null;
}

export interface ColourOption { hex: string; name: string; swatch_url: string | null }

export function colourOptions(product: SceneProduct | undefined): ColourOption[] {
  const raw = (product?.metadata as Record<string, unknown> | null)?.colour_options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) => {
    const r = o as Record<string, unknown>;
    return typeof r.hex === 'string' && /^#[0-9a-f]{6}$/i.test(r.hex)
      ? [{ hex: r.hex.toLowerCase(), name: typeof r.name === 'string' ? r.name : r.hex, swatch_url: typeof r.swatch_url === 'string' ? r.swatch_url : null }]
      : [];
  });
}

export interface Finish {
  imageUrl: string | null;
  hex: string | null;
  tileW: number;
  tileL: number;
  jointed: boolean;
  label: string | null;
}

export function resolveFinish(surface: SceneSurface | null, product: SceneProduct | undefined): Finish | null {
  if (!surface) return null;
  if (!product) return surface.colour_hex ? { imageUrl: null, hex: surface.colour_hex, tileW: 1, tileL: 1, jointed: false, label: null } : null;
  const fmt = tileFormatM(product);
  const option = surface.colour_hex ? colourOptions(product).find((o) => o.hex === surface.colour_hex.toLowerCase()) : undefined;
  const recorded = fmt.formatSource === 'recorded';
  const jointed = recorded && fmt.tileWidthM <= 1.6 && fmt.tileLengthM <= 3.2;
  if (option) {
    return {
      imageUrl: option.swatch_url, hex: option.hex, tileW: fmt.tileWidthM, tileL: fmt.tileLengthM, jointed,
      label: `${product.name} — ${option.name}`,
    };
  }
  return { imageUrl: product.albedoUrl ?? product.imageUrl, hex: surface.colour_hex, tileW: fmt.tileWidthM, tileL: fmt.tileLengthM, jointed, label: product.name };
}

export function describeTarget(t: { surface: string }, roomName: string, wallLabel?: string): string {
  switch (t.surface) {
    case 'floor': return `Floor of ${roomName}`;
    case 'ceiling': return `Ceiling of ${roomName}`;
    case 'walls': return `Walls of ${roomName}`;
    case 'wall': return `${wallLabel ?? 'One wall'} of ${roomName}`;
    default: return `Backsplash on ${wallLabel ?? 'one wall'} of ${roomName}`;
  }
}
