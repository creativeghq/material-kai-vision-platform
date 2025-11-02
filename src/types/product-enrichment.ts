/**
 * Product Enrichment Types
 * TypeScript interfaces for product enrichment database schema
 *
 * Tables:
 * - product_enrichments: Product metadata and enrichment results
 */

/**
 * Product Enrichment Status Types
 */
export type ProductEnrichmentStatus =
  | 'pending'
  | 'enriched'
  | 'failed'
  | 'needs_review';

/**
 * Product Category
 */
export type ProductCategory =
  | 'electronics'
  | 'furniture'
  | 'clothing'
  | 'food'
  | 'books'
  | 'tools'
  | 'home'
  | 'sports'
  | 'other';

/**
 * Product Metadata
 */
export interface ProductMetadata {
  sku?: string;
  upc?: string;
  brand?: string;
  manufacturer?: string;
  model?: string;
  color?: string;
  size?: string;
  weight?: string;
  dimensions?: string;
  material?: string;
  warranty?: string;
  price_range?: string;
}

/**
 * Product Specification
 */
export interface ProductSpecification {
  name: string;
  value: string;
  unit?: string;
  category?: string;
}

/**
 * Product Image Reference
 */
export interface ProductImageReference {
  image_id: string;
  image_url?: string;
  caption?: string;
  is_primary?: boolean;
  relevance_score?: number;
}

/**
 * Product Enrichment Result
 */
export interface ProductEnrichment {
  id: string;
  chunk_id: string;
  workspace_id?: string;
  enrichment_status: ProductEnrichmentStatus;
  product_name?: string;
  product_category?: ProductCategory;
  product_description?: string;
  long_description?: string;
  short_description?: string;
  metadata?: ProductMetadata;
  specifications?: ProductSpecification[];
  related_products?: string[];
  image_references?: ProductImageReference[];
  confidence_score?: number; // 0-1
  enrichment_score?: number; // 0-1
  issues?: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  recommendations?: Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  enriched_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Product Enrichment Insert
 */
export interface ProductEnrichmentInsert {
  chunk_id: string;
  workspace_id?: string;
  enrichment_status?: ProductEnrichmentStatus;
  product_name?: string;
  product_category?: ProductCategory;
  product_description?: string;
  long_description?: string;
  short_description?: string;
  metadata?: ProductMetadata;
  specifications?: ProductSpecification[];
  related_products?: string[];
  image_references?: ProductImageReference[];
  confidence_score?: number;
  enrichment_score?: number;
  issues?: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  recommendations?: Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  enriched_at?: string;
}

/**
 * Product Enrichment Update
 */
export interface ProductEnrichmentUpdate {
  enrichment_status?: ProductEnrichmentStatus;
  product_name?: string;
  product_category?: ProductCategory;
  product_description?: string;
  long_description?: string;
  short_description?: string;
  metadata?: ProductMetadata;
  specifications?: ProductSpecification[];
  related_products?: string[];
  image_references?: ProductImageReference[];
  confidence_score?: number;
  enrichment_score?: number;
  issues?: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  recommendations?: Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  enriched_at?: string;
}

/**
 * Product Enrichment Request
 */
export interface ProductEnrichmentRequest {
  chunk_id: string;
  workspace_id: string;
  chunk_content: string;
  related_images?: string[];
  enrichment_rules?: {
    extract_metadata?: boolean;
    extract_specifications?: boolean;
    find_related_products?: boolean;
    link_images?: boolean;
    generate_descriptions?: boolean;
  };
}

/**
 * Product Enrichment Response
 */
export interface ProductEnrichmentResponse {
  enrichment: ProductEnrichment;
  success: boolean;
  issues: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  recommendations: Array<{
    type: string;
    description: string;
    priority: string;
  }>;
}

/**
 * Batch Product Enrichment Request
 */
export interface BatchProductEnrichmentRequest {
  chunk_ids: string[];
  workspace_id: string;
  enrichment_rules?: {
    extract_metadata?: boolean;
    extract_specifications?: boolean;
    find_related_products?: boolean;
    link_images?: boolean;
    generate_descriptions?: boolean;
  };
}

/**
 * Batch Product Enrichment Response
 */
export interface BatchProductEnrichmentResponse {
  results: ProductEnrichment[];
  total: number;
  enriched: number;
  failed: number;
  needs_review: number;
}

/**
 * Product Enrichment Statistics
 */
export interface ProductEnrichmentStats {
  total_enrichments: number;
  enriched_count: number;
  failed_count: number;
  needs_review_count: number;
  avg_confidence_score: number;
  avg_enrichment_score: number;
  categories_distribution: Record<string, number>;
  common_issues: Array<{
    type: string;
    count: number;
    severity: string;
  }>;
}

/**
 * Product Enrichment Configuration
 */
export interface ProductEnrichmentConfig {
  extract_metadata: boolean;
  extract_specifications: boolean;
  find_related_products: boolean;
  link_images: boolean;
  generate_descriptions: boolean;
  min_confidence_score: number;
  max_related_products: number;
  max_specifications: number;
  max_images_per_product: number;
}

/**
 * Combined Phase 2.2 Database Types
 */
export interface Phase22Database {
  product_enrichments: {
    Row: ProductEnrichment;
    Insert: ProductEnrichmentInsert;
    Update: ProductEnrichmentUpdate;
  };
}
