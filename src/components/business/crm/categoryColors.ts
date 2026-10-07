import type { CSSProperties } from 'react';

/** Preset swatches for CRM categories. Stored as hex on `crm_categories.color_hex`. */
export const CATEGORY_COLORS: readonly string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#78716c', '#64748b',
];

export const DEFAULT_CATEGORY_COLOR = '#3b82f6';

const HEX = /^#[0-9a-f]{6}$/i;

export function isCategoryColor(value: string | null | undefined): value is string {
  return !!value && HEX.test(value);
}

/** Tinted chip style from a category colour; text stays the theme foreground so it reads in all four themes. */
export function categoryChipStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!isCategoryColor(hex)) return undefined;
  return { backgroundColor: `${hex}1f`, borderColor: `${hex}80` };
}
