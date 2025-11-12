/**
 * Product Detail Modal
 * Displays full product/material details with image slider and metadata
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ShoppingCart, Package, Factory } from 'lucide-react';
import { Product } from './ProductCard';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  categoryColor?: string;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
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

  // Extract key metadata
  const factory = product.metadata?.factory || 'Unknown Factory';
  const origin = product.metadata?.origin || '';
  const collection = product.metadata?.collection || '';
  const size = product.metadata?.size || 'N/A';
  const thickness = product.metadata?.thickness || 'N/A';
  const finish = product.metadata?.finish || 'N/A';
  const material = product.metadata?.material_type || product.type;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        {/* Header with Factory/Brand Info */}
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Factory/Brand */}
              <div className="flex items-center gap-2 mb-2">
                <Factory className="h-5 w-5 text-gray-600" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{factory}</span>
                  {origin && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-600">{origin}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Product Name */}
              <DialogTitle className="text-3xl font-bold text-gray-900 mb-1">
                {product.name}
              </DialogTitle>

              {/* Collection & SKU */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {collection && (
                  <span className="font-medium">{collection}</span>
                )}
                <span className="text-gray-400">•</span>
                <span>SKU: {product.sku}</span>
              </div>
            </div>

            {/* Status Badge */}
            <Badge
              className="text-sm px-3 py-1"
              style={{
                backgroundColor: `${categoryColor}20`,
                color: categoryColor,
                borderColor: categoryColor,
                border: '1px solid',
              }}
            >
              {product.status}
            </Badge>
          </div>

          <DialogDescription className="text-base text-gray-700 mt-3">
            {product.description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
          {/* Left Column: Image Slider (3/5 width) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="relative aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    onClick={handleNextImage}
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              {/* Image Counter */}
              <div className="absolute bottom-3 right-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                {currentImageIndex + 1} / {product.images.length}
              </div>
            </div>

            {/* Thumbnail Strip */}
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-24 h-24 rounded-lg border-2 overflow-hidden transition-all ${
                      index === currentImageIndex
                        ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2'
                        : 'border-gray-200 hover:border-gray-400'
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

          {/* Right Column: Technical Details (2/5 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Key Specifications Card */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-gray-900">Key Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Material Type */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Material</span>
                  <span className="text-sm font-semibold text-gray-900">{material}</span>
                </div>

                {/* Size */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Size</span>
                  <span className="text-sm font-semibold text-gray-900">{size}</span>
                </div>

                {/* Thickness */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Thickness</span>
                  <span className="text-sm font-semibold text-gray-900">{thickness}</span>
                </div>

                {/* Finish */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-gray-600">Finish</span>
                  <span className="text-sm font-semibold text-gray-900">{finish}</span>
                </div>
              </CardContent>
            </Card>

            {/* Available Sizes (Variants) */}
            {product.variants && product.variants.length > 0 && (
              <Card className="bg-white border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-gray-900">Available Sizes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2">
                    {product.variants.map((variant, index) => (
                      <button
                        key={index}
                        className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg hover:border-gray-900 hover:bg-gray-50 transition-all text-left"
                      >
                        <span className="font-medium text-sm text-gray-900">{variant.name}</span>
                        <span className="text-xs text-gray-500">{variant.sku}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pricing & Stock */}
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-gray-900">Pricing & Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Retail Price</p>
                    <p className="text-xl font-bold text-gray-900">
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.retail.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Wholesale</p>
                    <p className="text-xl font-bold text-gray-900">
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.wholesale.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">In Stock:</span>
                    <Badge
                      className={`text-sm px-3 py-1 ${
                        product.stock.status === 'High'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : product.stock.status === 'Medium'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                      }`}
                    >
                      {product.stock.quantity} {product.stock.unit}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add to Quote Button */}
            <Button
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
              size="lg"
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              Add to Quote
            </Button>
          </div>
        </div>

        {/* Technical Specifications Section */}
        <Card className="mt-6 bg-white border-gray-200">
          <CardHeader className="bg-gray-50 border-b border-gray-200">
            <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Factory className="h-5 w-5 text-gray-700" />
              Technical Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(product.metadata)
                .filter(([key]) => !['factory', 'origin', 'collection'].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {key.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Tags Section */}
        <Card className="mt-4 bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-base font-bold text-gray-900">Product Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-sm capitalize px-3 py-1 bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;

