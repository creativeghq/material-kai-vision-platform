/** Category resolution for the product surfaces. */

import {
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_KEYS,
  type CategoryKey,
  categoryKeyForVocab,
} from './categoryVocab.generated';

/**
 * A category key from `material_categories`. Derived from the projection rather than
 * hand-written, so a category added to the DB cannot go missing here.
 */
export type UploadCategory = CategoryKey;

/** Every category key, in DB order. */
export const UPLOAD_CATEGORIES: readonly UploadCategory[] = CATEGORY_KEYS;

const CATEGORY_KEY_SET: ReadonlySet<string> = new Set<string>(CATEGORY_KEYS);

/** The category a product falls back to when nothing else resolves. */
export const DEFAULT_UPLOAD_CATEGORY: UploadCategory = 'general_materials';

/**
 * Resolve an AI-extracted material_category slug (e.g. "floor_tile") to the category key
 * (e.g. "tiles") used by the DB registry.
 */
export function resolveUploadCategory(materialCategory: unknown): UploadCategory {
  // Accept `unknown` because callers often pass raw values straight out of product.metadata
  // (typed as `ProductMetadata` where every field is `unknown` due to wrapper-vs-primitive
  // polymorphism). Coerce in here.
  if (materialCategory === null || materialCategory === undefined || materialCategory === '') {
    return DEFAULT_UPLOAD_CATEGORY;
  }
  // Unwrap a {value, confidence} wrapper if that's what we got.
  let raw: unknown = materialCategory;
  if (typeof raw === 'object' && raw !== null && 'value' in (raw as Record<string, unknown>)) {
    raw = (raw as Record<string, unknown>).value;
    if (raw === null || raw === undefined || raw === '') return DEFAULT_UPLOAD_CATEGORY;
  }
  if (typeof raw !== 'string') {
    raw = String(raw);
  }
  const lower = (raw as string).toLowerCase().trim();

  // Direct match on a category key.
  if (CATEGORY_KEY_SET.has(lower)) return lower as UploadCategory;

  // Canonical vocabulary and aliases, from the DB projection (#347 phase 3.4). The hand-written
  // `controlledVocab` this replaced was a FIFTH copy and had drifted both ways: five canonical
  // values the extractor can emit were missing from it entirely, so a product classified as one
  // of those could not be resolved here and fell through to the default.
  const fromVocab = categoryKeyForVocab(lower);
  if (fromVocab && CATEGORY_KEY_SET.has(fromVocab)) return fromVocab as UploadCategory;

  // Fuzzy fallback for free text that is neither a key nor a registered vocabulary term.
  if (lower.includes('tile') || lower.includes('ceramic') || lower.includes('porcelain')) return 'tiles';
  if (lower.includes('wood') || lower.includes('parquet') || lower.includes('laminate') || lower.includes('vinyl')) return 'wood';
  if (lower.includes('paint') || lower.includes('wallpaper') || lower.includes('coating')) return 'paint_wall_decor';
  if (lower.includes('sofa') || lower.includes('chair') || lower.includes('table') || lower.includes('cabinet') || lower.includes('bed') || lower.includes('desk') || lower.includes('shelf')) return 'furniture';
  if (lower.includes('radiator') || lower.includes('boiler') || lower.includes('heating') || lower.includes('towel_rail') || lower.includes('fireplace')) return 'heating';
  if (lower.includes('sauna') || lower.includes('hammam') || lower.includes('turkish')
    || lower.includes('steam room') || lower.includes('steam_room') || lower.includes('hot tub')
    || lower.includes('hot_tub') || lower.includes('jacuzzi') || lower.includes('infrared')) return 'wellness';
  if (lower.includes('toilet') || lower.includes('basin') || lower.includes('bath') || lower.includes('shower') || lower.includes('tap') || lower.includes('faucet') || lower.includes('bidet')) return 'sanitary';
  if (lower.includes('kitchen') || lower.includes('worktop') || lower.includes('hood')) return 'kitchen';
  if (lower.includes('light') || lower.includes('lamp') || lower.includes('chandelier') || lower.includes('spotlight')) return 'lighting';
  if (lower.includes('rug') || lower.includes('curtain') || lower.includes('cushion') || lower.includes('mirror') || lower.includes('vase') || lower.includes('decor')) return 'decor';
  if (lower.includes('door') || lower.includes('window') || lower.includes('shutter')
    || lower.includes('glazing') || lower.includes('partition')) return 'openings';
  if (lower.includes('cable') || lower.includes('breaker') || lower.includes('socket')
    || lower.includes('switch') || lower.includes('conduit') || lower.includes('trunking')) return 'electrical';
  if (lower.includes('pipe') || lower.includes('valve') || lower.includes('siphon')
    || lower.includes('fitting') || lower.includes('manifold')) return 'plumbing';
  if (lower.includes('plasterboard') || lower.includes('drywall') || lower.includes('gypsum')) return 'drywall';
  if (lower.includes('melamine') || lower.includes('chipboard') || lower.includes('plywood')
    || lower.includes('mdf') || lower.includes('edge tape') || lower.includes('edge_tape')) return 'panel_boards';
  if (lower.includes('insulation') || lower.includes('polystyrene')) return 'insulation';
  if (lower.includes('cement') || lower.includes('mortar') || lower.includes('grout')
    || lower.includes('adhesive') || lower.includes('screed') || lower.includes('aggregate')) return 'building_materials';
  if (lower.includes('hinge') || lower.includes('screw') || lower.includes('runner')
    || lower.includes('bracket') || lower.includes('fixing')) return 'hardware';
  if (lower.includes('washing machine') || lower.includes('dishwasher') || lower.includes('refrigerator')
    || lower.includes('oven') || lower.includes('freezer')) return 'appliances';
  if (lower.includes('ventilation') || lower.includes('air condition') || lower.includes('extract fan')) return 'hvac';
  if (lower.includes('drill') || lower.includes('power tool') || lower.includes('vacuum')) return 'tools';
  if (lower.includes('stone') || lower.includes('marble') || lower.includes('granite') || lower.includes('quartz') || lower.includes('glass') || lower.includes('metal') || lower.includes('composite') || lower.includes('concrete')) return 'general_materials';

  return DEFAULT_UPLOAD_CATEGORY;
}

/** The category a product belongs to, from its metadata / type / category columns. */
export function resolveProductCategory(
  metadata?: Record<string, unknown> | null,
  productType?: string,
  productCategory?: string,
): UploadCategory {
  return resolveUploadCategory(
    metadata?.material_category || productType || productCategory || '',
  );
}

/** Human-readable name for a category key, from material_categories. */
export function categoryDisplayName(key: string): string {
  return CATEGORY_DISPLAY_NAMES[key]
    || key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
