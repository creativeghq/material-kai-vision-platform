/**
 * Shared accessors for product metadata.
 *
 * Different ingestion paths (PDF extraction, manual entry, MIVAA, web import)
 * store the same conceptual fields under different keys. These helpers check
 * every known key so consumers don't have to hard-code one source of truth
 * and silently miss data.
 *
 * Add a new key to the relevant helper as soon as you find another source
 * using a different name — never branch on metadata keys at the call site.
 */

export interface ProductLike {
  id: string;
  name?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Supabase SELECT fragment that embeds the highest-scored product image.
 * Use as: `.select(\`*, ${PRODUCT_IMAGE_SELECT}\`)`
 *
 * Pair with `getProductImageUrl()` on the result row.
 */
export const PRODUCT_IMAGE_SELECT = `image_product_associations(
  overall_score,
  document_images(image_url)
)`;

/**
 * Returns the maker / brand name. The canonical schema stores this as
 * `factory_name`; ingestion-side normalization (Python `normalize_factory_keys`)
 * folds legacy aliases (manufacturer / brand / supplier / factory) into it
 * before write. The legacy aliases below are kept as a defensive fallback for
 * any older rows that haven't been backfilled yet — they can be removed once
 * the backfill is run platform-wide.
 *
 * IMPORTANT: this is the function to use anywhere you group, filter, or
 * display "who makes this product". Do NOT read a single key directly.
 */
export function getManufacturer(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  return (
    // Canonical
    metadata.factory_name ||
    // Legacy fallbacks (will be backfilled away — kept for safety until then)
    metadata.manufacturer ||
    metadata.brand ||
    metadata.supplier ||
    (typeof metadata.factory === 'string' ? metadata.factory : null) ||
    null
  );
}

/**
 * Returns the parent group name when meaningfully different from `factory_name`.
 * Canonical key is `factory_group_name`. Returns null when not present.
 */
export function getFactoryGroup(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  return (
    metadata.factory_group_name ||
    // Legacy fallback
    metadata.factory_group ||
    null
  );
}

/**
 * Returns the collection / series / product line name.
 */
export function getCollection(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  return (
    metadata.collection ||
    metadata.series ||
    metadata.product_line ||
    metadata?.design?.collection?.value ||
    null
  );
}

/**
 * Returns a display-friendly product name with metadata fallbacks.
 * Only returns 'Unnamed Product' as a last resort — most rows have a real name.
 */
export function getProductName(product: ProductLike): string {
  return (
    product.name ||
    product.metadata?.product_name ||
    product.metadata?.model ||
    product.metadata?.title ||
    'Unnamed Product'
  );
}

/**
 * Returns the material category slug (wall_tile, floor_tile, fabric, etc.)
 * as-is. Use `formatMaterialCategory()` for a display-friendly version.
 */
export function getMaterialCategory(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  return (
    metadata.material_category ||
    metadata.category ||
    metadata.product_type ||
    null
  );
}

/**
 * Formats a material category slug as Title Case for display.
 *
 *   "ceramic_tile"    → "Ceramic Tile"
 *   "wood_flooring"   → "Wood Flooring"
 *   "natural_stone"   → "Natural Stone"
 *   "wall_tile"       → "Wall Tile"
 *   "bathroom_tile"   → "Bathroom Tile"
 *   "3d_wall_panel"   → "3D Wall Panel"
 *   null / empty      → "—"
 *
 * Also handles free-text values like "ceramic tile" (returns "Ceramic Tile"),
 * controlled vocabulary slugs, and the handful of acronyms we know about.
 */
const KNOWN_ACRONYMS = new Set(["3D", "2D", "LED", "LVT", "PVC", "EPDM", "SBR", "PEI", "SGN"]);

export function formatMaterialCategory(
  value: string | null | undefined,
  fallback: string = "—",
): string {
  if (!value) return fallback;
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  // Split on underscores, hyphens, or whitespace
  const parts = normalized
    .split(/[_\-\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .map((p) => {
      const upper = p.toUpperCase();
      if (KNOWN_ACRONYMS.has(upper)) return upper;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Picks the best image URL for a product. Accepts a row that may have
 * `image_product_associations` embedded via PRODUCT_IMAGE_SELECT.
 *
 * Resolution order:
 *   1. Highest-scored image_product_associations join
 *   2. metadata.image_url / metadata.thumbnail_url (legacy / rare)
 *
 * Returns null when no image is available.
 */
export function getProductImageUrl(product: any): string | null {
  // 1. Embedded relationship (preferred)
  const ipa = product?.image_product_associations;
  if (Array.isArray(ipa) && ipa.length > 0) {
    const sorted = [...ipa].sort(
      (a, b) => (b?.overall_score ?? 0) - (a?.overall_score ?? 0),
    );
    for (const rel of sorted) {
      const url = rel?.document_images?.image_url;
      if (url) return url;
    }
  }

  // 2. Legacy metadata fallbacks
  return (
    product?.metadata?.image_url ||
    product?.metadata?.thumbnail_url ||
    product?.image_url ||
    null
  );
}

/**
 * Extracts an array of human-readable size strings from product metadata.
 * Handles both structured ({width, height, depth, unit}) and string formats.
 */
export function getAvailableSizes(metadata?: Record<string, any> | null): string[] {
  if (!metadata) return [];

  const sizes: string[] = [];
  const raw = metadata.available_sizes ?? metadata.dimensions ?? [];

  if (Array.isArray(raw)) {
    raw.forEach((d: unknown) => {
      if (typeof d === 'object' && d !== null) {
        const dim = d as Record<string, unknown>;
        if (dim.width && dim.height) {
          const unit = dim.unit || 'cm';
          sizes.push(`${dim.width}×${dim.height}${dim.depth ? `×${dim.depth}` : ''} ${unit}`);
        }
      } else if (typeof d === 'string' && d.trim()) {
        sizes.push(d);
      }
    });
  } else if (typeof raw === 'string') {
    sizes.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
  }

  return sizes;
}

/**
 * Returns available colors as a string array. Handles both string arrays
 * and object arrays ({name, hex}).
 */
export function getAvailableColors(metadata?: Record<string, any> | null): string[] {
  if (!metadata) return [];
  const raw = metadata.available_colors ?? metadata.colors ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: unknown) => {
      if (typeof c === 'string') return c;
      if (typeof c === 'object' && c !== null) {
        return (c as any).name || (c as any).label || (c as any).value || '';
      }
      return '';
    })
    .filter((c): c is string => !!c);
}
