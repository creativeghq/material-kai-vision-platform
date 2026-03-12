/**
 * ProductRecommendationsPanel
 * Renders a horizontal scrollable strip of recommended products.
 * Used for both "Similar Products" and "Works Well With" tabs in ProductDetailModal.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Layers, Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { productRecommendationsService, RecommendedProduct } from '@/services/productRecommendationsService';

interface ProductRecommendationsPanelProps {
  productId: string;
  mode: 'similar' | 'complementary';
  /** Called when user clicks a result card — parent opens that product's modal */
  onProductClick: (productId: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  vector:           'AI match',
  same_collection:  'Same collection',
  fallback:         'Other products',
  multi_signal:     'Strong match',
  category_rule:    'Recommended pairing',
  cross_collection: 'From another collection',
};

export const ProductRecommendationsPanel: React.FC<ProductRecommendationsPanelProps> = ({
  productId,
  mode,
  onProductClick,
}) => {
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(false);
    try {
      const results = mode === 'similar'
        ? await productRecommendationsService.getSimilar(productId, 10)
        : await productRecommendationsService.getComplementary(productId, 10);
      setProducts(results);
    } catch (e) {
      console.error('[ProductRecommendationsPanel] load error:', e);
      setError(true);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [productId, mode]);

  // Lazy load — only fires when the component first mounts (i.e. tab is opened)
  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Finding recommendations…</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <p className="text-sm">Could not load recommendations.</p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs underline hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (loaded && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
        <Sparkles className="h-8 w-8 opacity-30" />
        <p className="text-sm">
          {mode === 'similar'
            ? 'No similar products found yet.'
            : 'No complementary products found yet.'}
        </p>
        <p className="text-xs opacity-70">Results improve as more products are catalogued.</p>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {products.length} {mode === 'similar' ? 'similar products' : 'complementary products'} found
      </p>

      {/* Horizontal scroll strip */}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onProductClick(product.id)}
            className="
              snap-start shrink-0 w-36 flex flex-col rounded-xl overflow-hidden
              border border-border bg-card
              hover:border-primary/40 hover:shadow-md
              transition-all duration-200 text-left group
            "
          >
            {/* Thumbnail */}
            <div className="relative w-full aspect-square bg-muted overflow-hidden">
              {product.thumbnail_url ? (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Layers className="h-7 w-7 text-muted-foreground/30" />
                </div>
              )}

              {/* Relationship label badge (complementary mode) */}
              {product.relationship_label && (
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
                  <span className="text-[9px] text-white font-medium leading-tight line-clamp-1">
                    {product.relationship_label}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-2 space-y-1 flex-1">
              <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
                {product.name}
              </p>
              {product.category && (
                <p className="text-[10px] text-muted-foreground line-clamp-1 capitalize">
                  {product.category}
                </p>
              )}
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30 mt-1"
              >
                {SOURCE_LABEL[product.match_source] ?? product.match_source}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
