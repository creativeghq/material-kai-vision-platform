/** Shared accessors for product metadata. */

export interface ProductLike {
  id: string;
  name?: string | null;
  metadata?: Record<string, any> | null;
}

/** Use as `.select(\`*, ${PRODUCT_IMAGE_SELECT}\`)`, with `getProductImageUrl()` on the row. */
export const PRODUCT_IMAGE_SELECT = `image_product_associations(
  overall_score,
  document_images(image_url)
)`;

/** The maker / brand name. `factory_name` is canonical — Python `normalize_factory_keys` folds
 *  the aliases below into it on write; they remain only for rows predating that. */
export function getManufacturer(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  const fn = metadata.factory_name;
  return (
    (typeof fn === 'string' ? fn : typeof fn === 'object' && fn ? (fn as any).factory_name || String(fn) : null) ||
    (typeof metadata.manufacturer === 'string' ? metadata.manufacturer : null) ||
    (typeof metadata.brand === 'string' ? metadata.brand : null) ||
    (typeof metadata.supplier === 'string' ? metadata.supplier : null) ||
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
export function getMaterialCategory(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const raw =
    metadata.material_category ??
    metadata.category ??
    metadata.product_type ??
    null;
  if (raw === null || raw === undefined || raw === '') return null;
  // Unwrap {value, confidence} envelope if Stage 0 wrote one.
  if (typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    const inner = (raw as Record<string, unknown>).value;
    return inner == null || inner === '' ? null : String(inner);
  }
  return String(raw);
}

/** Formats a material category slug as Title Case for display. */
const KNOWN_ACRONYMS = new Set(['3D', '2D', 'LED', 'LVT', 'PVC', 'EPDM', 'SBR', 'PEI', 'SGN']);

export function formatMaterialCategory(
  value: string | null | undefined,
  fallback: string = '—',
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
    .join(' ');
}

/** Best image URL for a product row: the highest-scored PRODUCT_IMAGE_SELECT embed, else
 *  metadata.image_url / thumbnail_url, else null. */
export function getProductImageUrl(product: any): string | null {
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
