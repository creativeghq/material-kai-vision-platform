/**
 * Shared material category utilities.
 * Single source of truth for category detection, colors, and professional type labels.
 * Used across DiscoverPage, LatestWidgets, ProfileModal, PublicProfilePage, ProfileTab, etc.
 *
 * The 10 DB categories (material_categories table):
 * tiles, wood, decor, furniture, general_materials, paint_wall_decor,
 * heating, sanitary, kitchen, lighting
 *
 * Legacy display-only categories (stone, paint, fabric, metal, glass, composite)
 * are kept for backwards compatibility in theme colors and existing UI.
 */
import { formatLabel } from '@/lib/labelUtils';
import { resolveUploadCategory, type UploadCategory } from '@/lib/categoryFieldRegistry';

/** Legacy display categories — kept for theme colors across existing components. */
export const MATERIAL_CATS = [
  'tiles', 'wood', 'stone', 'paint', 'fabric', 'metal', 'glass', 'composite',
] as const;

export type MaterialCategory = typeof MATERIAL_CATS[number] | 'other' | string;

/** All 10 DB categories. */
export const DB_CATEGORIES: UploadCategory[] = [
  'tiles', 'wood', 'decor', 'furniture', 'general_materials',
  'paint_wall_decor', 'heating', 'sanitary', 'kitchen', 'lighting',
];

export const CAT_COLORS: Record<string, string> = {
  // Legacy display categories
  tiles:     '#3b82f6',
  wood:      '#92400e',
  stone:     '#6b7280',
  paint:     '#10b981',
  fabric:    '#8b5cf6',
  metal:     '#6366f1',
  glass:     '#06b6d4',
  composite: '#f59e0b',
  other:     '#3E192A',
  // DB categories (added so all 10 have a color)
  decor:             '#8b5cf6',
  furniture:         '#d97706',
  general_materials: '#6b7280',
  paint_wall_decor:  '#10b981',
  heating:           '#ef4444',
  sanitary:          '#06b6d4',
  kitchen:           '#f59e0b',
  lighting:          '#eab308',
};

export const PROFESSIONAL_TYPE_LABELS: Record<string, string> = {
  architect_designer: 'Architect / Interior Designer',
  supplier:           'Supplier',
  sourcing_agent:     'Sourcing Agent',
  consultant:         'Consultant',
  other:              'Other',
};

/**
 * Detects a normalised material category string from a product's metadata.
 * Returns one of the 10 DB categories when possible, or a legacy display
 * category for backwards compatibility.
 */
export function detectCat(meta: Record<string, any>): string {
  const raw = (meta?.material_category || '').toLowerCase();
  if (!raw) return 'other';

  // Try the canonical resolver from the category field registry first
  const resolved = resolveUploadCategory(raw);
  if (resolved !== 'general_materials' || raw.includes('general') || raw.includes('stone') || raw.includes('marble') || raw.includes('granite') || raw.includes('quartz') || raw.includes('composite') || raw.includes('concrete') || raw.includes('metal') || raw.includes('glass')) {
    // For legacy display consumers that expect 'stone', 'metal', 'glass', 'fabric',
    // 'composite' — keep those when the resolved category is general_materials
    // but the raw value is more specific.
    if (resolved === 'general_materials') {
      if (raw.includes('stone') || raw.includes('marble') || raw.includes('granite')) return 'stone';
      if (raw.includes('metal') || raw.includes('steel') || raw.includes('aluminum')) return 'metal';
      if (raw.includes('glass')) return 'glass';
      if (raw.includes('composite') || raw.includes('engineered')) return 'composite';
    }
    return resolved;
  }

  // Legacy fabric detection (not a DB category but used in display themes)
  if (raw.includes('fabric') || raw.includes('textile') || raw.includes('upholstery')) return 'fabric';

  return 'other';
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
