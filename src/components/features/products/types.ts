/**
 * Shared Product Types
 * Used across the application for product display components
 */

import { resolveDisplayCategory } from '@/lib/materialCategories';
import type { CategoryKey } from '@/lib/categoryVocab.generated';

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

/** Shape of the values that live under `products.metadata` (JSONB). */
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
  /**
   * Owning workspace. `products.workspace_id` is `uuid NOT NULL` in the DB, so anything loaded
   * from PostgREST always carries one — it is optional here only because synthetic products that
   * never round-trip the DB (the `src/data/demo/*.json` fixtures, the moodboard-item adapter) are
   * built client-side without a workspace. Those correctly fail the ownership check.
   */
  workspace_id?: string | null;
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
 * Category of a product for templates and theme colours: every DB category key, plus the
 * legacy display-only values the colour maps still use.
 */
export type LegacyDisplayCategory = 'stone' | 'paint' | 'fabric' | 'metal' | 'glass' | 'composite' | 'other';
export type MaterialCategory = CategoryKey | LegacyDisplayCategory;

/**
 * There is ONE category resolver (resolveDisplayCategory). The fuzzy copy that used to live
 * here resolved whirlpool_bath, interior_door and sauna_cabin to 'other', because a
 * hand-written substring ladder cannot see a vocabulary value added after it was written.
 */
export function getMaterialCategory(product: Product | SimpleProduct): MaterialCategory {
  const metadata = product.metadata || {};
  return resolveDisplayCategory(
    metadata.material_category
    || (product as Product).type
    || (product as Product).category,
  ) as MaterialCategory;
}

