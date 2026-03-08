/**
 * ProductStrip Component
 * Table/list layout for products displayed at the end of agent chat messages
 */

import React, { useState } from 'react';
import { Star, Package, Paintbrush, Pin } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { AddToQuoteButton } from '@/components/business/quotes/AddToQuoteButton';
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
  onReplaceInImage,
  onPinMaterial,
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
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <Badge className="bg-primary/10 text-primary border-0 rounded-full text-xs font-medium">
          {products.length}
        </Badge>
      </div>

      {/* Column headers */}
      <div
        className="grid px-3 py-1.5 bg-muted/40 rounded-t-lg text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border border-b-0"
        style={{ gridTemplateColumns: '1fr 110px 90px' }}
      >
        <span>Product Details</span>
        <span>Category</span>
        <span className="text-right">Actions</span>
      </div>

      {/* Product Rows */}
      <div className="divide-y divide-border border border-border rounded-b-lg overflow-hidden">
        {products.map((product) => {
          const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];
          const rating = (product as any).metadata?.rating ?? 4.2;
          const ratingInt = Math.round(rating);

          return (
            <div
              key={product.id}
              className="grid items-center px-3 py-2.5 bg-card hover:bg-muted/30 transition-colors cursor-pointer group"
              style={{ gridTemplateColumns: '1fr 110px 90px' }}
              onClick={() => handleOpenModal(product)}
            >
              {/* Thumbnail + name */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                  {primaryImage ? (
                    <img
                      src={primaryImage.url}
                      alt={primaryImage.alt || product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`h-2.5 w-2.5 ${star <= ratingInt ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30 fill-muted-foreground/30'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="flex flex-wrap gap-1">
                {product.category && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded font-normal">
                    {product.category}
                  </Badge>
                )}
                {product.type && product.type !== product.category && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded font-normal">
                    {product.type}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {onPinMaterial && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => onPinMaterial({ id: product.id, name: product.name, imageUrl: primaryImage?.url })}
                    title="Pin to design tray"
                  >
                    <Pin className="h-3 w-3" />
                  </Button>
                )}
                {onReplaceInImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                    onClick={() => onReplaceInImage(product)}
                    title="Replace in image"
                  >
                    <Paintbrush className="h-3 w-3" />
                  </Button>
                )}
                <AddToQuoteButton
                  productId={product.id}
                  productName={product.name}
                  productImage={primaryImage?.url}
                  variant="ghost"
                  size="sm"
                  showText={false}
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleOpenModal(product)}
                >
                  View
                </Button>
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
