/**
 * Product Card Component
 * Re-exports from global Products components for backwards compatibility
 * @deprecated Import from '@/components/Products' instead
 */

// Re-export types and components from the global Products folder
export type { Product, ProductImage, ProductPricing, ProductStock, ProductVariant } from '@/components/Products/types';
export { ProductCard } from '@/components/Products/ProductCard';
export { ProductDetailModal } from '@/components/Products/ProductDetailModal';

// Legacy default export for backwards compatibility
import { ProductCard as GlobalProductCard } from '@/components/Products/ProductCard';
export default GlobalProductCard;
