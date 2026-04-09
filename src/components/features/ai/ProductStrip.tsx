/**
 * ProductStrip Component
 * Table/list layout for products displayed at the end of agent chat messages
 */

import React, { useState } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Package } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Product } from '@/components/features/products/types';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';

interface ProductStripProps {
  products: Product[];
  title?: string;
  onReplaceInImage?: (product: Product) => void;
  onPinMaterial?: (product: { id: string; name: string; imageUrl?: string }) => void;
}


export const ProductStrip: React.FC<ProductStripProps> = ({
  products,
  title = 'Related Products',
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!products || products.length === 0) return null;

  const handleOpenModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <Badge className="bg-primary/10 text-primary border-0 rounded-full text-xs font-medium">
          {products.length}
        </Badge>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map((product) => {
          const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];

          return (
            <div
              key={product.id}
              className="group cursor-pointer rounded-xl border border-border bg-card overflow-hidden hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => handleOpenModal(product)}
            >
              {/* Image */}
              <div className="aspect-square bg-muted overflow-hidden relative">
                {primaryImage ? (
                  <img
                    src={getOptimizedImageUrl(primaryImage.url, 'thumbnail')}
                    alt={primaryImage.alt || product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {product.category && (
                  <Badge className="absolute top-2 left-2 text-[10px] px-1.5 py-0 h-5 bg-white/90 text-gray-700 border-0 backdrop-blur-sm shadow-sm">
                    {product.category}
                  </Badge>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-sm font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                  {product.name}
                </p>
                {product.pricing?.retail != null && (
                  <p className="text-sm font-semibold text-foreground mt-1.5">
                    €{Number(product.pricing.retail).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedProduct(null); }}
      />
    </div>
  );
};

export default ProductStrip;
