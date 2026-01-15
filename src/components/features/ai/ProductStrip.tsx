/**
 * ProductStrip Component
 * Horizontal scrollable product cards displayed at the end of agent chat messages
 * Clean Notion-like design with click to open modal
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Product } from '@/components/features/products/types';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';

interface ProductStripProps {
  products: Product[];
  title?: string;
}

export const ProductStrip: React.FC<ProductStripProps> = ({
  products,
  title = 'Related Products',
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);

  if (!products || products.length === 0) return null;

  const handleOpenModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  const scrollContainer = (direction: 'left' | 'right') => {
    const container = document.getElementById('product-strip-container');
    if (container) {
      const scrollAmount = 320;
      const newPosition = direction === 'left'
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;
      container.scrollTo({ left: newPosition, behavior: 'smooth' });
      setScrollPosition(newPosition);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollContainer('left')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollContainer('right')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Product Cards */}
      <div
        id="product-strip-container"
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        style={{ scrollbarWidth: 'thin' }}
      >
        {products.map((product) => {
          const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];

          return (
            <div
              key={product.id}
              className="flex-shrink-0 w-[280px] bg-card border border-border rounded-lg p-3 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => handleOpenModal(product)}
            >
              <div className="flex gap-3">
                {/* Product Image */}
                <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                  {primaryImage ? (
                    <img
                      src={primaryImage.url}
                      alt={primaryImage.alt || product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {product.name}
                  </h5>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {product.metadata?.factory_name || product.metadata?.manufacturer || 'Unknown Factory'}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-foreground">
                      {product.pricing?.currency === 'EUR' ? '€' : '$'}
                      {product.pricing?.retail?.toFixed(2) || 'N/A'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(product);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default ProductStrip;

