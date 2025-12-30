/**
 * Admin Product Detail Modal
 * Re-exports the unified ProductDetailModal from Products component
 * This ensures both Admin and regular product views use the same modal
 */

import React from 'react';
import { ProductDetailModal as UnifiedProductDetailModal } from '@/components/Products/ProductDetailModal';

interface ProductDetailModalProps {
  product: any;
  onClose: () => void;
}

/**
 * Admin wrapper for ProductDetailModal
 * Converts admin product format to unified Product format
 */
export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
}) => {
  // Convert admin product to unified Product format
  const unifiedProduct = {
    id: product.id,
    name: product.name,
    description: product.description || '',
    category: product.metadata?.material_category || 'Uncategorized',
    type: product.metadata?.material_category || 'other',
    status: 'active',
    sku: product.id.substring(0, 8),
    metadata: product.metadata || {},
    properties: {},
    specifications: {},
    images: [], // Will be loaded by the unified modal
    tags: [],
    pricing: {
      retail: 0,
      wholesale: 0,
      currency: 'EUR'
    },
    stock: {
      quantity: 0,
      status: 'Unknown',
      unit: 'pcs'
    },
  };

  return (
    <UnifiedProductDetailModal
      product={unifiedProduct}
      isOpen={true}
      onClose={onClose}
    />
  );
};