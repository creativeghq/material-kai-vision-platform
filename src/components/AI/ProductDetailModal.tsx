/**
 * Demo Product Detail Modal
 * Displays full product details with image slider and metadata
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ShoppingCart, Package, Factory } from 'lucide-react';
import { DemoProduct } from './DemoProductCard';

interface DemoProductDetailModalProps {
  product: DemoProduct | null;
  isOpen: boolean;
  onClose: () => void;
  categoryColor?: string;
}

export const DemoProductDetailModal: React.FC<DemoProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  categoryColor = '#3b82f6',
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!product) return null;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? product.images.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === product.images.length - 1 ? 0 : prev + 1
    );
  };

  const currentImage = product.images[currentImageIndex];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6" style={{ color: categoryColor }} />
              <div>
                <h2 className="text-2xl font-bold">{product.name}</h2>
                <p className="text-sm text-muted-foreground font-normal">
                  SKU: {product.sku}
                </p>
              </div>
            </div>
            <Badge
              style={{
                backgroundColor: `${categoryColor}20`,
                color: categoryColor,
                borderColor: categoryColor,
              }}
            >
              {product.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Image Slider */}
          <div className="space-y-4">
            <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
              {currentImage && (
                <img
                  src={currentImage.url}
                  alt={currentImage.alt}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}

              {/* Navigation Arrows */}
              {product.images.length > 1 && (
                <>
                  <Button
                    onClick={handlePrevImage}
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleNextImage}
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* Image Counter */}
              <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                {currentImageIndex + 1} / {product.images.length}
              </div>
            </div>

            {/* Thumbnail Strip */}
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded border-2 overflow-hidden ${
                      index === currentImageIndex
                        ? 'border-blue-500'
                        : 'border-gray-200'
                    }`}
                  >
                    <img
                      src={image.url}
                      alt={image.alt}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-4">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">{product.description}</p>
              </CardContent>
            </Card>

            {/* Pricing & Stock */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pricing & Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Retail Price</p>
                    <p className="text-lg font-bold" style={{ color: categoryColor }}>
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.retail.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Wholesale Price</p>
                    <p className="text-lg font-bold text-gray-700">
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.wholesale.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Stock:</span>
                    <Badge
                      variant={
                        product.stock.status === 'High'
                          ? 'default'
                          : product.stock.status === 'Medium'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {product.stock.quantity} {product.stock.unit} - {product.stock.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Categories & Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categories & Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Category</p>
                    <Badge
                      style={{
                        backgroundColor: `${categoryColor}20`,
                        color: categoryColor,
                        borderColor: categoryColor,
                      }}
                    >
                      {product.category}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {product.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add to Quote Button */}
            <Button
              className="w-full"
              size="lg"
              style={{ backgroundColor: categoryColor }}
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              Add to Quote
            </Button>
          </div>
        </div>

        {/* Metadata Section */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Product Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(product.metadata).map(([key, value]) => (
                <div key={key} className="border rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Variants */}
        {product.variants && product.variants.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Available Variants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {product.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-3 hover:border-blue-500 cursor-pointer transition-colors"
                  >
                    <p className="font-medium text-sm">{variant.name}</p>
                    <p className="text-xs text-gray-500">SKU: {variant.sku}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DemoProductDetailModal;

