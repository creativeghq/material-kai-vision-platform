/**
 * Shared material category utilities.
 * Single source of truth for category detection, colors, and professional type labels.
 * Used across DiscoverPage, LatestWidgets, ProfileModal, PublicProfilePage, ProfileTab, etc.
 */
import { formatLabel } from '@/lib/labelUtils';

export const MATERIAL_CATS = [
  'tiles', 'wood', 'stone', 'paint', 'fabric', 'metal', 'glass', 'composite',
] as const;

export type MaterialCategory = typeof MATERIAL_CATS[number] | 'other' | string;

export const CAT_COLORS: Record<string, string> = {
  tiles:     '#3b82f6',
  wood:      '#92400e',
  stone:     '#6b7280',
  paint:     '#10b981',
  fabric:    '#8b5cf6',
  metal:     '#6366f1',
  glass:     '#06b6d4',
  composite: '#f59e0b',
  other:     '#3E192A',
};

export const PROFESSIONAL_TYPE_LABELS: Record<string, string> = {
  designer:          'Designer',
  interior_designer: 'Interior Designer',
  architect:         'Architect',
  manufacturer:      'Manufacturer',
  brand:             'Brand',
  supplier:          'Supplier',
  sourcing_agent:    'Sourcing Agent',
  consultant:        'Consultant',
  other:             'Other',
};

/**
 * Detects a normalised material category string from a product's metadata.
 * Uses the most complete rule set (wall_tile, floor_tile, upholstery included).
 */
export function detectCat(meta: Record<string, any>): string {
  const raw = (meta?.material_category || '').toLowerCase();
  if (
    raw.includes('tile') || raw.includes('ceramic') || raw.includes('porcelain') ||
    raw === 'wall_tile' || raw === 'floor_tile'
  ) return 'tiles';
  if (raw.includes('wood') || raw.includes('parquet') || raw.includes('laminate')) return 'wood';
  if (raw.includes('stone') || raw.includes('marble') || raw.includes('granite')) return 'stone';
  if (raw.includes('paint') || raw.includes('coating')) return 'paint';
  if (raw.includes('fabric') || raw.includes('textile') || raw.includes('upholstery')) return 'fabric';
  if (raw.includes('metal') || raw.includes('steel') || raw.includes('aluminum')) return 'metal';
  if (raw.includes('glass')) return 'glass';
  if (raw.includes('composite') || raw.includes('engineered')) return 'composite';
  return raw || 'other';
}

/** Returns a human-readable category label, e.g. "wall_tile" → "Wall Tile". */
export function catLabel(c: string): string {
  return formatLabel(c);
}

/** Returns up to 2 uppercase initials from a display name. */
export function initials(name?: string): string {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}
