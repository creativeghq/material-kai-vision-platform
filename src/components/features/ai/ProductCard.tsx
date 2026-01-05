/**
 * Product Card Component
 * Re-exports from global Products components for backwards compatibility
 * @deprecated Import from '@/components/Products' instead
 */

// Re-export types and components from the global Products folder
export type { Product, ProductImage, ProductPricing, ProductStock, ProductVariant } from '@/components/features/products/types';
export { ProductCard } from '@/components/features/products/ProductCard';
export { ProductDetailModal } from '@/components/features/products/ProductDetailModal';

// Legacy default export for backwards compatibility
import { ProductCard as GlobalProductCard } from '@/components/features/products/ProductCard';
export default GlobalProductCard;
