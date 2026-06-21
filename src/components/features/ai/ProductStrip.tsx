/**
 * ProductStrip Component
 * Table/list layout for products displayed at the end of agent chat messages
 */

import React, { useEffect, useMemo, useState } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Package } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Product } from '@/components/features/products/types';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useShowPrices } from '@/hooks/useShowPrices';
import { supabase } from '@/integrations/supabase/client';

interface ProductStripProps {
  products: Product[];
  title?: string;
  onReplaceInImage?: (product: Product) => void;
  onPinMaterial?: (product: { id: string; name: string; imageUrl?: string }) => void;
}

type ViewerPrice = { price: number | null; discount_pct: number; currency: string };

const sym = (c: string) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : `${c} `);

export const ProductStrip: React.FC<ProductStripProps> = ({
  products,
  title = 'Related Products',
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { activeWorkspaceId } = useWorkspace();
  const { showPrices } = useShowPrices();
  // #227 — resolve each viewer's OWN price (reseller buy price + discount, end-user retail)
  // in one bulk call rather than the raw catalog retail shown to everyone.
  const [viewerPrices, setViewerPrices] = useState<Record<string, ViewerPrice>>({});
  // Stable key so the fetch fires on the actual product set, not on every parent re-render
  // (agent message lists are rebuilt inline each render).
  const idsKey = useMemo(() => (products ?? []).map((p) => p.id).filter(Boolean).join(','), [products]);

  useEffect(() => {
    if (!activeWorkspaceId || !idsKey) return;
    let cancelled = false;
    const ids = idsKey.split(',');
    supabase
      .rpc('get_catalog_prices_for_workspace', { p_workspace_id: activeWorkspaceId, p_product_ids: ids })
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, ViewerPrice> = {};
        for (const r of data as any[]) {
          map[r.product_id] = {
            price: r.price != null ? Number(r.price) : null,
            discount_pct: Number(r.discount_pct) || 0,
            currency: r.currency || 'EUR',
          };
        }
        setViewerPrices(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId, idsKey]);

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
                {showPrices && (() => {
                  const vp = viewerPrices[product.id];
                  const price = vp?.price ?? (product.pricing?.retail != null ? Number(product.pricing.retail) : null);
                  if (price == null) return null;
                  const cur = vp?.currency ?? 'EUR';
                  const disc = vp?.discount_pct ?? 0;
                  return (
                    <p className="text-sm font-semibold text-foreground mt-1.5">
                      {sym(cur)}{price.toFixed(2)}
                      {disc > 0 && (
                        <span className="text-xs font-normal text-primary ml-1">({disc}% off)</span>
                      )}
                    </p>
                  );
                })()}
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
