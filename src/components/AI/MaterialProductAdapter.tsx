/**
 * Material Product Adapter
 * Converts real database materials/products to DemoProduct format
 * for use with existing DemoProductCard and DemoProductDetailModal components
 */

import React, { useState } from 'react';
import { DemoProductCard, DemoProduct } from './DemoProductCard';
import { DemoProductDetailModal } from './DemoProductDetailModal';
import { Badge } from '@/components/ui/badge';

interface DatabaseProduct {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
  source_document_id?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface DatabaseImage {
  id: string;
  url: string;
  description?: string;
  page_number?: number;
  metadata?: Record<string, any>;
}

interface MaterialProductAdapterProps {
  products: DatabaseProduct[];
  images?: Record<string, DatabaseImage[]>; // Keyed by product_id
  title?: string;
  categoryColors?: Record<string, string>;
  onProductSelect?: (productId: string) => void;
}

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  tile: '#3b82f6',
  tiles: '#3b82f6',
  wood: '#16a34a',
  hvac: '#dc2626',
  carpet: '#9333ea',
  textile: '#ea580c',
  cement_tile: '#6366f1',
  ceramic: '#8b5cf6',
  stone: '#78716c',
  metal: '#71717a',
  glass: '#06b6d4',
  fabric: '#f59e0b',
  default: '#6366f1',
};

/**
 * Converts database product to DemoProduct format
 */
const convertToDemoProduct = (
  product: DatabaseProduct,
  productImages: DatabaseImage[] = []
): DemoProduct => {
  const metadata = product.metadata || {};
  
  // Extract category from metadata or default
  const category = metadata.category || metadata.type || 'material';
  
  // Generate SKU from metadata or ID
  const sku = metadata.sku || metadata.product_code || `MAT-${product.id.slice(0, 8).toUpperCase()}`;
  
  // Extract pricing from metadata
  const pricing = {
    retail: metadata.price_retail || metadata.retail_price || metadata.price || 0,
    wholesale: metadata.price_wholesale || metadata.wholesale_price || (metadata.price ? metadata.price * 0.7 : 0),
    currency: metadata.currency || 'EUR',
  };
  
  // Extract stock information
  const stockQuantity = metadata.stock_quantity || metadata.stock || 0;
  const stockStatus = 
    stockQuantity > 50 ? 'High' :
    stockQuantity > 20 ? 'Medium' :
    stockQuantity > 0 ? 'Low' : 'Out of Stock';
  
  const stock = {
    quantity: stockQuantity,
    status: stockStatus,
    unit: metadata.unit || metadata.stock_unit || 'm²',
  };
  
  // Convert images
  const images = productImages.map((img, index) => ({
    url: img.url,
    alt: img.description || `${product.name} - Image ${index + 1}`,
    isPrimary: index === 0,
  }));
  
  // If no images, add a placeholder
  if (images.length === 0) {
    images.push({
      url: '/placeholder-material.jpg',
      alt: product.name,
      isPrimary: true,
    });
  }
  
  // Extract tags from metadata
  const tags: string[] = [];
  if (metadata.color) tags.push(metadata.color);
  if (metadata.finish) tags.push(metadata.finish);
  if (metadata.material) tags.push(metadata.material);
  if (metadata.designer) tags.push(metadata.designer);
  if (metadata.tags && Array.isArray(metadata.tags)) {
    tags.push(...metadata.tags);
  }
  
  // Extract variants
  const variants = metadata.variants?.map((v: any, index: number) => ({
    name: v.name || v.value || `Variant ${index + 1}`,
    sku: v.sku || `${sku}-V${index + 1}`,
  })) || [];
  
  // Determine status
  const status = metadata.status || (stockQuantity > 0 ? 'Available' : 'Out of Stock');
  
  return {
    id: product.id,
    sku,
    name: product.name,
    description: product.description || metadata.description || 'No description available',
    category,
    type: metadata.type || category,
    status,
    images,
    metadata: {
      ...metadata,
      // Ensure common fields are present
      factory: metadata.factory || metadata.manufacturer || 'Unknown',
      country_of_origin: metadata.country_of_origin || metadata.origin || 'Unknown',
    },
    pricing,
    stock,
    tags: [...new Set(tags)], // Remove duplicates
    variants: variants.length > 0 ? variants : undefined,
  };
};

export const MaterialProductAdapter: React.FC<MaterialProductAdapterProps> = ({
  products,
  images = {},
  title = 'Material Results',
  categoryColors = DEFAULT_CATEGORY_COLORS,
  onProductSelect,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<DemoProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewDetails = (product: DemoProduct) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
    if (onProductSelect) {
      onProductSelect(product.id);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  // Convert all products to DemoProduct format
  const demoProducts = products.map((product) => {
    const productImages = images[product.id] || [];
    return convertToDemoProduct(product, productImages);
  });

  if (demoProducts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No materials found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          {title}
        </h3>
        <Badge 
          variant="secondary"
          style={{
            background: 'var(--mocha-color)',
            color: 'var(--foreground-dark)',
          }}
        >
          {demoProducts.length} {demoProducts.length === 1 ? 'material' : 'materials'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {demoProducts.map((product) => (
          <DemoProductCard
            key={product.id}
            product={product}
            onViewDetails={handleViewDetails}
            categoryColor={
              categoryColors[product.category.toLowerCase()] ||
              categoryColors[product.type.toLowerCase()] ||
              categoryColors.default
            }
          />
        ))}
      </div>

      <DemoProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        categoryColor={
          selectedProduct
            ? categoryColors[selectedProduct.category.toLowerCase()] ||
              categoryColors[selectedProduct.type.toLowerCase()] ||
              categoryColors.default
            : undefined
        }
      />
    </div>
  );
};

export default MaterialProductAdapter;

