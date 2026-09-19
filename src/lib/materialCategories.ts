/**
 * Shared material category utilities.
 * Single source of truth for category detection, colors, and professional type labels.
 * Used across DiscoverPage, LatestWidgets, ProfileModal, PublicProfilePage, ProfileTab, etc.
 */
import { formatLabel } from '@/lib/labelUtils';
import { UPLOAD_CATEGORIES, resolveUploadCategory, type UploadCategory } from '@/lib/categoryFieldRegistry';

/** Legacy display categories — kept for theme colors across existing components. */
export const MATERIAL_CATS = [
  'tiles', 'wood', 'stone', 'paint', 'fabric', 'metal', 'glass', 'composite',
] as const;

export type MaterialCategory = typeof MATERIAL_CATS[number] | 'other' | string;

/**
 * Every DB category, from the projection of `material_categories`. Hand-listing them here
 * was a copy that had already gone stale — it named ten and the DB has had eleven since
 * `building_materials` was added (#368 PD-5).
 */
export const DB_CATEGORIES: readonly UploadCategory[] = UPLOAD_CATEGORIES;

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
  // DB categories
  building_materials: '#64748b',
  wellness:           '#14b8a6',
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
 * Resolves any loose category string onto a display category. Canonical values and aliases
 * come from the generated vocabulary; the legacy branches below only refine the
 * general_materials catch-all, so a real DB category always wins.
 */
export function resolveDisplayCategory(rawInput: unknown): string {
  const raw = String(rawInput ?? '').toLowerCase().trim();
  if (!raw) return 'other';

  const resolved = resolveUploadCategory(raw);
  const looksGeneral = ['general', 'stone', 'marble', 'granite', 'quartz', 'composite', 'concrete', 'metal', 'glass']
    .some((t) => raw.includes(t));

  if (resolved !== 'general_materials' || looksGeneral) {
    if (resolved === 'general_materials') {
      if (raw.includes('stone') || raw.includes('marble') || raw.includes('granite')) return 'stone';
      if (raw.includes('metal') || raw.includes('steel') || raw.includes('aluminum')) return 'metal';
      if (raw.includes('glass')) return 'glass';
      if (raw.includes('composite') || raw.includes('engineered')) return 'composite';
    }
    return resolved;
  }

  if (raw.includes('fabric') || raw.includes('textile') || raw.includes('upholstery')) return 'fabric';
  return 'other';
}

/** Detects a display category from a product's metadata. */
export function detectCat(meta: Record<string, any>): string {
  return resolveDisplayCategory(meta?.material_category);
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
