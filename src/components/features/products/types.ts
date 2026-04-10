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

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  type: string;
  status: string;
  images: ProductImage[];
  metadata: Record<string, any>;
  properties?: Record<string, any>;
  specifications?: Record<string, any>;
  pricing: ProductPricing;
  stock: ProductStock;
  tags: string[];
  variants?: ProductVariant[];
  /** Source PDF document this product was extracted from (when applicable) */
  source_document_id?: string;
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
  metadata?: Record<string, any>;
}

/**
 * Material category types for category-based templates
 */
export type MaterialCategory =
  | 'tiles'
  | 'wood'
  | 'stone'
  | 'paint'
  | 'fabric'
  | 'metal'
  | 'glass'
  | 'composite'
  | 'other';

/**
 * Get material category from product metadata or type
 */
export function getMaterialCategory(product: Product | SimpleProduct): MaterialCategory {
  const metadata = product.metadata || {};
  const category = metadata.material_category ||
                   (product as Product).type ||
                   (product as Product).category ||
                   'other';

  const categoryLower = String(category).toLowerCase();

  if (categoryLower.includes('tile') || categoryLower.includes('ceramic') || categoryLower.includes('porcelain')) {
    return 'tiles';
  }
  if (categoryLower.includes('wood') || categoryLower.includes('parquet') || categoryLower.includes('laminate')) {
    return 'wood';
  }
  if (categoryLower.includes('stone') || categoryLower.includes('marble') || categoryLower.includes('granite')) {
    return 'stone';
  }
  if (categoryLower.includes('paint') || categoryLower.includes('coating')) {
    return 'paint';
  }
  if (categoryLower.includes('fabric') || categoryLower.includes('textile') || categoryLower.includes('upholstery')) {
    return 'fabric';
  }
  if (categoryLower.includes('metal') || categoryLower.includes('steel') || categoryLower.includes('aluminum')) {
    return 'metal';
  }
  if (categoryLower.includes('glass')) {
    return 'glass';
  }
  if (categoryLower.includes('composite') || categoryLower.includes('engineered')) {
    return 'composite';
  }

  return 'other';
}

