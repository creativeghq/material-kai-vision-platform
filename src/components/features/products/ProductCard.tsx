/**
 * Product Card Component
 * Displays product/material information in a card format
 * Global component - can be used in agents, search, quotes, etc.
 */

import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { ChevronRight, Sun, Smartphone, Wand2 } from 'lucide-react';
import { buildTestOnRoomUrl } from '@/utils/testOnRoom';
import { AddToQuoteButton } from '@/modules/quotes/components/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import { Product } from './types';
import { trackProductView } from '@/services/manufacturerAnalyticsService';
import { getManufacturer, getProductName } from '@/utils/productMetadata';
import { resolveUploadCategory } from '@/lib/categoryFieldRegistry';
import { useShowPrices } from '@/hooks/useShowPrices';

const sym = (c?: string) => (c === 'USD' ? '$' : c === 'GBP' ? '£' : c && c !== 'EUR' ? `${c} ` : '€');

// Coerce a metadata field (typed as `unknown` because ProductMetadata
// fields are wrapper-or-primitive polymorphic) into a plain string for
// downstream APIs that expect string | undefined.
const asMetaString = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const inner = (v as Record<string, unknown>).value;
    return inner == null || inner === '' ? undefined : String(inner);
  }
  return String(v);
};

const LightingPreviewModal = lazy(() => import('@/components/features/lighting/LightingPreviewModal').catch(() => ({ default: () => null })));
const ARPreviewModal = lazy(() => import('@/components/features/ar/ARPreviewModal').then(m => ({ default: m.ARPreviewModal })).catch(() => ({ default: () => null })));

interface ProductCardProps {
  product: Product;
  onViewDetails: (product: Product) => void;
  categoryColor?: string;
  showActions?: boolean;
  /** The viewer's own resolved price (reseller buy price + discount, or retail).
   *  Supplied by the parent grid via the bulk catalog-price RPC to avoid an N+1.
   *  `kind` ('your_price' | 'retail' | 'seller') drives the label authoritatively. */
  viewerPrice?: { price: number | null; discount_pct: number; currency: string; kind?: string } | null;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onViewDetails,
  categoryColor = '#3b82f6',
  showActions = true,
  viewerPrice = null,
}) => {
  const { showPrices } = useShowPrices();
  const navigate = useNavigate();
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
          const mfg = getManufacturer(product.metadata) || '';
          const matCat = asMetaString(product.metadata?.material_category);
          trackProductView(product.id, mfg, window.location.pathname, undefined, resolveUploadCategory(matCat), matCat);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product.id, product.metadata]);

  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const displayName = getProductName(product);
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
                {displayName}
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

        {/* Pricing — #227: per-viewer price (reseller buy price + discount, or retail) gated on the
            Show Prices toggle. NEVER the procurement cost (the old "Wholesale" column leaked products.cost). */}
        {showPrices && (() => {
          const price = viewerPrice?.price ?? (product.pricing.retail > 0 ? product.pricing.retail : null);
          if (price == null) return null;
          const disc = viewerPrice?.discount_pct ?? 0;
          const cur = viewerPrice?.currency ?? product.pricing.currency;
          // Label off the resolved kind when present; fall back to discount magnitude otherwise.
          const isYourPrice = viewerPrice?.kind === 'your_price' || (viewerPrice?.kind == null && disc > 0);
          return (
            <div className="mb-3 pb-3 border-b border-gray-200">
              <p className="text-xs text-gray-600 mb-0.5">
                {isYourPrice ? 'Your price' : 'Retail'} <span className="text-gray-400">(excl. VAT)</span>
              </p>
              <p className="font-semibold text-gray-900">
                {sym(cur)}{price.toFixed(2)}
                {disc > 0 && <span className="text-xs font-normal text-primary ml-1">({disc}% off)</span>}
              </p>
            </div>
          );
        })()}

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
                category={resolveUploadCategory(product.metadata?.material_category)}
                materialType={asMetaString(product.metadata?.material_category)}
              />
              <AddToMoodboardButton
                productId={product.id}
                productName={product.name}
                productImage={primaryImage?.url}
                variant="outline"
                size="sm"
                showText={false}
                category={resolveUploadCategory(product.metadata?.material_category)}
                materialType={asMetaString(product.metadata?.material_category)}
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
                AR view
              </Button>
            </div>

            {/* Test on a room — hands off to the Interior Designer agent with
                this material pre-pinned; the agent asks for a room photo. */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                navigate(buildTestOnRoomUrl({ productId: product.id, productName: displayName, productImage: primaryImage?.url }));
              }}
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              title="See this material applied on a photo of your room"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Test on a room
            </Button>

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

