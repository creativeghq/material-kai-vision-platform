/**
 * Product Card Component
 * Displays product/material information in a card format
 * Global component - can be used in agents, search, quotes, etc.
 */

import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { ChevronRight, Sun, Smartphone } from 'lucide-react';
import { AddToQuoteButton } from '@/components/business/quotes/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import { Product } from './types';
import { trackProductView } from '@/services/manufacturerAnalyticsService';

const LightingPreviewModal = lazy(() => import('@/components/features/lighting/LightingPreviewModal').then(m => ({ default: m.LightingPreviewModal })).catch(() => ({ default: () => null })));
const ARPreviewModal = lazy(() => import('@/components/features/ar/ARPreviewModal').then(m => ({ default: m.ARPreviewModal })).catch(() => ({ default: () => null })));

interface ProductCardProps {
  product: Product;
  onViewDetails: (product: Product) => void;
  categoryColor?: string;
  showActions?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onViewDetails,
  categoryColor = '#3b82f6',
  showActions = true,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const trackedRef = useRef(false);
  const [showLighting, setShowLighting] = useState(false);
  const [showAR, setShowAR] = useState(false);

  // Track product view when card becomes visible (IntersectionObserver)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !trackedRef.current) {
          trackedRef.current = true;
          const mfg = product.metadata?.factory_name || product.metadata?.manufacturer || product.metadata?.brand || '';
          trackProductView(product.id, String(mfg), window.location.pathname);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product.id]);

  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const stockStatusColor =
    product.stock.status === 'High'
      ? 'bg-green-100 text-green-800 border-green-300'
      : product.stock.status === 'Medium'
        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
        : 'bg-red-100 text-red-800 border-red-300';

  return (
    <Card ref={cardRef} className="overflow-hidden hover:shadow-xl transition-shadow duration-200 bg-white border border-gray-200">
      {/* Product Image */}
      <div className="relative h-48 bg-gray-100">
        {primaryImage && (
          <img
            src={getOptimizedImageUrl(primaryImage.url, 'preview')}
            alt={primaryImage.alt}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        )}
      </div>

      <CardContent className="p-4">
        {/* Product Header */}
        <div className="mb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-base line-clamp-1">
                {product.name}
              </h3>
              <p className="text-sm text-gray-600 mt-0.5">SKU {product.sku}</p>
            </div>
            <Badge
              className="ml-2"
              style={{
                backgroundColor: `${categoryColor}20`,
                color: categoryColor,
                borderColor: categoryColor,
              }}
            >
              {product.status}
            </Badge>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {product.tags.slice(0, 3).map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs capitalize bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
              >
                {tag}
              </Badge>
            ))}
            {product.tags.length > 3 && (
              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-300">
                +{product.tags.length - 3}
              </Badge>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-600 mb-0.5">Retail</p>
            <p className="font-semibold text-gray-900">
              {product.pricing.currency === 'EUR' ? '€' : '$'}
              {product.pricing.retail.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-0.5">Wholesale</p>
            <p className="font-semibold text-gray-900">
              {product.pricing.currency === 'EUR' ? '€' : '$'}
              {product.pricing.wholesale.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Stock Status */}
        <div className="mb-3">
          <div className={`px-3 py-2 rounded-md border ${stockStatusColor}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {product.stock.quantity} {product.stock.unit}
              </span>
              <span className="text-xs font-semibold">{product.stock.status} stock</span>
            </div>
          </div>
        </div>

        {/* Variants */}
        {product.variants && product.variants.length > 0 && (
          <div className="mb-3 text-xs text-gray-600">
            <span className="font-medium">Variants ({product.variants.length}):</span>{' '}
            {product.variants.map((v) => v.name).join(', ')}
          </div>
        )}

        {/* Action Buttons */}
        {showActions && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <AddToQuoteButton
                productId={product.id}
                productName={product.name}
                productImage={primaryImage?.url}
                variant="outline"
                size="sm"
                showText={false}
              />
              <AddToMoodboardButton
                productId={product.id}
                productName={product.name}
                productImage={primaryImage?.url}
                variant="outline"
                size="sm"
                showText={false}
              />
            </div>

            {/* Lighting + AR row */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={(e) => { e.stopPropagation(); setShowLighting(true); }}
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                title="Preview material under different lighting"
              >
                <Sun className="h-3.5 w-3.5" />
                Lighting
              </Button>
              <Button
                onClick={(e) => { e.stopPropagation(); setShowAR(true); }}
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                title="View material in AR"
              >
                <Smartphone className="h-3.5 w-3.5" />
                AR View
              </Button>
            </div>

            {/* View Details Button */}
            <Button
              onClick={() => onViewDetails(product)}
              variant="outline"
              className="w-full justify-between hover:bg-gray-50 border-gray-300 text-gray-900"
              size="sm"
            >
              <span>View Details</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Lighting Preview Modal (lazy-loaded) */}
        <Suspense fallback={null}>
          {showLighting && (
            <LightingPreviewModal
              isOpen={showLighting}
              onClose={() => setShowLighting(false)}
              productImage={primaryImage?.url || ''}
              productName={product.name}
              productCategory={product.category}
              pbrMaps={product.metadata?.pbr_maps}
            />
          )}
          {showAR && (
            <ARPreviewModal
              isOpen={showAR}
              onClose={() => setShowAR(false)}
              productId={product.id}
              productName={product.name}
              productImage={primaryImage?.url || ''}
              pbrMaps={product.metadata?.pbr_maps}
            />
          )}
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default ProductCard;

