/**
 * Shared Product Types
 * Used across the application for product display components
 */

export interface ProductImage {
  url: string;
  alt: string;
  isPrimary?: boolean;
}

export interface ProductPricing {
  retail: number;
  wholesale: number;
  currency: string;
}

export interface ProductStock {
  quantity: number;
  status: string;
  unit: string;
}

export interface ProductVariant {
  name: string;
  sku: string;
}

/**
 * Shape of the values that live under `products.metadata` (JSONB).
 *
 * Most fields can arrive in one of three shapes depending on extraction path:
 *   - raw primitive: `"Matte"`, `"R10"`
 *   - wrapper: `{value: "Matte", confidence: 0.9}` (Stage 0 AI extractor)
 *   - array: `["Matte", "Glossy"]` (when multiple variants exist)
 *
 * Because of this polymorphism we type everything as `unknown` and let the
 * render layer (`extractValue` / `renderValue`) discriminate at use site —
 * a stricter type would force callers to write the same discrimination
 * code anyway, only with `as` casts everywhere.
 *
 * The named sub-containers (`commercial`, `appearance`, etc.) are written
 * by the Stage 4.7 rollup and the Stage 0 AI extractor; the index signature
 * absorbs any other top-level field. Unknown fields land in
 * `_discovered_extra` — see the Additional Properties dynamic-discovery
 * section in ProductDetailModal.
 */
export interface ProductMetadata {
  // Top-level rollup outputs (Stage 4.7)
  material_category?: unknown;
  factory_name?: unknown;
  factory_group_name?: unknown;
  designers?: unknown;
  designer?: unknown;
  collection?: unknown;
  inspiration?: unknown;
  available_colors?: unknown;
  available_sizes?: unknown;
  dimensions?: unknown;
  size?: unknown;
  thickness?: unknown;
  finish?: unknown;
  finishes?: unknown;
  applications?: unknown;
  recommended_use?: unknown;
  room_type?: unknown;
  joint_width?: unknown;
  joint_width_mm?: unknown;
  certifications?: unknown;
  standards?: unknown;
  eco_friendly?: unknown;
  sustainability_rating?: unknown;
  fire_rating?: unknown;
  materials?: unknown;
  textures?: unknown;
  patterns?: unknown;
  detected_text?: unknown;
  vision_confidence?: number | string;
  // Nested category containers
  commercial?: Record<string, unknown>;
  appearance?: Record<string, unknown>;
  material_properties?: Record<string, unknown>;
  application?: Record<string, unknown>;
  design?: Record<string, unknown>;
  performance?: Record<string, unknown>;
  compliance?: Record<string, unknown>;
  packaging?: Record<string, unknown>;
  // Provenance — written by Stage 4.5/4.6/4.7
  _extraction_metadata?: Record<string, { source?: string; confidence?: number }>;
  _discovered_extra?: Record<string, unknown>;
  // Anything else (dynamic-discovery, category-specific fields, legacy)
  [key: string]: unknown;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  type: string;
  status: string;
  images: ProductImage[];
  metadata: ProductMetadata;
  properties?: Record<string, unknown>;
  specifications?: Record<string, unknown>;
  pricing: ProductPricing;
  stock: ProductStock;
  tags: string[];
  variants?: ProductVariant[];
  /** Source PDF document this product was extracted from (when applicable) */
  source_document_id?: string;
  /** Denormalized review aggregates (maintained by the material_reviews trigger). */
  avg_rating?: number | null;
  review_count?: number;
}

/**
 * Simplified product interface for use in quotes and other contexts
 * where full product data may not be available
 */
export interface SimpleProduct {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  image_url?: string;
  metadata?: ProductMetadata;
  /** Per-unit procurement cost (products.cost). Snapshotted to quote_items at acceptance. */
  cost?: number | null;
  cost_currency?: string | null;
}

/**
 * Material category types for category-based templates.
 * Includes both the 10 DB categories and legacy display categories
 * for backwards compatibility with theme colors.
 */
export type MaterialCategory =
  | 'tiles'
  | 'wood'
  | 'decor'
  | 'furniture'
  | 'general_materials'
  | 'paint_wall_decor'
  | 'heating'
  | 'sanitary'
  | 'kitchen'
  | 'lighting'
  // Legacy display categories (still used for theme colors)
  | 'stone'
  | 'paint'
  | 'fabric'
  | 'metal'
  | 'glass'
  | 'composite'
  | 'other';

/**
 * Get material category from product metadata or type.
 * Delegates to the shared detectCat() which understands all 10 DB categories
 * plus legacy display categories.
 */
export function getMaterialCategory(product: Product | SimpleProduct): MaterialCategory {
  const metadata = product.metadata || {};
  const raw = metadata.material_category ||
              (product as Product).type ||
              (product as Product).category ||
              'other';

  // Use the same detection logic as detectCat() from materialCategories.ts
  // but inline here to avoid a circular import (types.ts is imported everywhere).
  const categoryLower = String(raw).toLowerCase();

  // DB categories (10)
  if (categoryLower.includes('tile') || categoryLower.includes('ceramic') || categoryLower.includes('porcelain')) return 'tiles';
  if (categoryLower === 'wood' || categoryLower.includes('wood_flooring') || categoryLower.includes('parquet') || categoryLower.includes('laminate') || categoryLower.includes('vinyl_flooring')) return 'wood';
  if (categoryLower === 'decor' || categoryLower.includes('rug') || categoryLower.includes('curtain') || categoryLower.includes('cushion') || categoryLower.includes('vase') || categoryLower.includes('mirror')) return 'decor';
  if (categoryLower === 'furniture' || categoryLower.includes('sofa') || categoryLower.includes('chair') || categoryLower.includes('table') || categoryLower.includes('cabinet') || categoryLower.includes('shelving') || categoryLower.includes('bed') || categoryLower.includes('desk') || categoryLower.includes('sideboard')) return 'furniture';
  if (categoryLower === 'paint_wall_decor' || categoryLower.includes('wall_paint') || categoryLower.includes('wallpaper') || categoryLower.includes('coating') || categoryLower.includes('decorative_plaster')) return 'paint_wall_decor';
  if (categoryLower === 'heating' || categoryLower.includes('radiator') || categoryLower.includes('towel_rail') || categoryLower.includes('boiler') || categoryLower.includes('heat_pump') || categoryLower.includes('fireplace') || categoryLower.includes('convector')) return 'heating';
  if (categoryLower === 'sanitary' || categoryLower.includes('toilet') || categoryLower.includes('basin') || categoryLower.includes('bathtub') || categoryLower.includes('shower') || categoryLower.includes('bidet') || categoryLower.includes('faucet') || categoryLower.includes('tap')) return 'sanitary';
  if (categoryLower === 'kitchen' || categoryLower.includes('kitchen_cabinet') || categoryLower.includes('kitchen_worktop') || categoryLower.includes('kitchen_sink') || categoryLower.includes('kitchen_hood')) return 'kitchen';
  if (categoryLower === 'lighting' || categoryLower.includes('pendant') || categoryLower.includes('lamp') || categoryLower.includes('spotlight') || categoryLower.includes('chandelier') || categoryLower.includes('_light')) return 'lighting';

  // Legacy display categories (for themes)
  if (categoryLower.includes('stone') || categoryLower.includes('marble') || categoryLower.includes('granite')) return 'stone';
  if (categoryLower.includes('paint')) return 'paint';
  if (categoryLower.includes('fabric') || categoryLower.includes('textile') || categoryLower.includes('upholstery')) return 'fabric';
  if (categoryLower.includes('metal') || categoryLower.includes('steel') || categoryLower.includes('aluminum')) return 'metal';
  if (categoryLower.includes('glass')) return 'glass';
  if (categoryLower.includes('composite') || categoryLower.includes('engineered')) return 'composite';

  // General materials is the catch-all DB category
  if (categoryLower === 'general_materials' || categoryLower.includes('general')) return 'general_materials';

  return 'other';
}

