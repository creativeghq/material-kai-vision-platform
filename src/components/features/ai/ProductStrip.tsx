/**
 * ProductStrip Component
 * Table/list layout for products displayed at the end of agent chat messages
 */

import React, { useEffect, useMemo, useState } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Package, Replace, Pin, Boxes, Video, Box, Wand2, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { tileFormats } from '@/components/features/products/tileFormats';
import { productDetailService, type ProductDetail } from '@/services/productDetailService';
import { Product } from '@/components/features/products/types';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useShowPrices } from '@/hooks/useShowPrices';
import { supabase } from '@/integrations/supabase/client';

import { onEnterOrSpace } from '@/utils/a11y';

interface ProductStripProps {
  products: Product[];
  title?: string;
  /**
   * Per-product actions. All optional; each renders a control only when it is passed, so a
   * surface that cannot do the thing does not offer it.
   */
  onReplaceInImage?: (product: Product) => void;
  /** Attach the product's photo as the material reference for an edit of the user's own room. */
  onTestInRoom?: (product: { id: string; name: string; imageUrl: string }) => void;
  onPinMaterial?: (product: { id: string; name: string; imageUrl?: string }) => void;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  onGenerateVideo?: (imageUrl: string) => void;
  onUseIn3DScene?: (imageUrl: string, productName: string) => void;
}

type ViewerPrice = {
  price: number | null;
  discount_pct: number;
  currency: string;
  /** What the number IS, said by the resolver. Inferring it from `discount_pct > 0` labelled a
   *  sub-account at 0% discount "Retail" when it was their buy price (#405). */
  kind: 'your_price' | 'retail' | 'seller';
  unpriced: boolean;
};

const sym = (c: string) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : `${c} `);

type CardFacts = { maker: string | null; material: string | null; formats: string[]; finish: string | null; colours: string[] };

const firstText = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    const x = Array.isArray(v) ? v[0] : v;
    if (typeof x === 'string' && x.trim()) return x.trim();
  }
  return null;
};
const textList = (...vals: unknown[]): string[] => {
  for (const v of vals) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
    const out = list.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());
    if (out.length) return [...new Set(out)];
  }
  return [];
};
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The tile facts a card shows, read from the sensitivity-gated detail when it has loaded. */
function cardFacts(product: Product, detail: ProductDetail | undefined): CardFacts {
  const md = { ...(product.metadata as Record<string, unknown>), ...((detail?.metadata ?? {}) as Record<string, unknown>) };
  const at = ((detail as { attributes?: Record<string, unknown> } | undefined)?.attributes ?? {}) as Record<string, unknown>;
  const finish = firstText(at.finish, md.finish);
  return {
    maker: firstText(md.factory_name, md.factory_group_name, md.brand),
    material: firstText(at.material, md.material, md.material_type),
    // `available_sizes` is the normalised list; `dimensions` can hold OCR fragments, so it is only the fallback.
    formats: (tileFormats(md.available_sizes).length ? tileFormats(md.available_sizes) : tileFormats(md.dimensions)).map((f) => f.label),
    finish: finish ? titleCase(finish) : null,
    colours: textList(at.color, md.color, md.colors).map(titleCase),
  };
}

export const ProductStrip: React.FC<ProductStripProps> = ({
  products,
  title = 'Related Products',
  onReplaceInImage,
  onTestInRoom,
  onPinMaterial,
  onGenerateVR,
  onGenerateVideo,
  onUseIn3DScene,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { activeWorkspaceId } = useWorkspace();
  const { showPrices } = useShowPrices();
  // Resolve each viewer's OWN price (reseller buy price + discount, end-user retail)
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
        // The resolver reports how many ids it was asked for and how many it answered, so a
        // capped call is a stated fact rather than products that silently read as unpriced.
        const rows = (data as any)?.prices;
        if (cancelled || !Array.isArray(rows)) return;
        const map: Record<string, ViewerPrice> = {};
        for (const r of rows as any[]) {
          map[r.product_id] = {
            price: r.price != null ? Number(r.price) : null,
            discount_pct: Number(r.discount_pct) || 0,
            currency: r.currency || 'EUR',
            kind: r.kind ?? 'retail',
            unpriced: !!r.unpriced,
          };
        }
        setViewerPrices(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId, idsKey]);

  const [details, setDetails] = useState<Map<string, ProductDetail>>(new Map());
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    productDetailService.fetchMany(idsKey.split(','))
      .then((m) => { if (!cancelled) setDetails(m); })
      .catch((e) => console.warn('[ProductStrip] product details unavailable; cards show search fields only:', e));
    return () => { cancelled = true; };
  }, [idsKey]);

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
        <Badge className="bg-primary/10 text-primary border-0 text-xs font-medium">
          {products.length}
        </Badge>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map((product) => {
          const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];
          const facts = cardFacts(product, details.get(product.id));
          const img = primaryImage?.url;
          // The three generate actions need a picture; a product with none would hand the model an empty URL.
          const actions = [
            onReplaceInImage && { label: 'Replace in image', icon: Replace, run: () => onReplaceInImage(product) },
            onTestInRoom && img && { label: 'Test in a room', icon: Wand2, run: () => onTestInRoom({ id: product.id, name: product.name, imageUrl: img }) },
            onPinMaterial && { label: 'Pin to design tray', icon: Pin, run: () => onPinMaterial({ id: product.id, name: product.name, imageUrl: img }) },
            onGenerateVR && img && { label: 'Generate VR', icon: Boxes, run: () => onGenerateVR(img, { prompt: product.name }) },
            onGenerateVideo && img && { label: 'Generate video', icon: Video, run: () => onGenerateVideo(img) },
            onUseIn3DScene && img && { label: 'Use in 3D scene', icon: Box, run: () => onUseIn3DScene(img, product.name) },
          ].filter(Boolean) as Array<{ label: string; icon: React.ComponentType<{ className?: string }>; run: () => void }>;
          const detailLine = [facts.material, facts.finish].filter(Boolean).join(' · ');

          return (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={onEnterOrSpace(() => handleOpenModal(product))}
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
                {actions.length > 0 && (
                  // The card is itself a button, so the menu must not let its clicks reach it.
                  <div className="absolute top-1.5 right-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${product.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-hairline bg-card/95 text-muted-foreground shadow-overlay hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {actions.map((a) => (
                          <DropdownMenuItem key={a.label} onSelect={() => a.run()}>
                            <a.icon className="mr-2 h-4 w-4" />
                            {a.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-sm font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                  {product.name}
                </p>
                {facts.maker && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{facts.maker}</p>
                )}
                {detailLine && (
                  <p className="mt-1 truncate text-xs text-foreground/80">{detailLine}</p>
                )}
                {facts.formats.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {facts.formats.slice(0, 4).map((f) => (
                      <span key={f} className="rounded-sm border border-hairline bg-surface-sunken px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{f}</span>
                    ))}
                    {facts.formats.length > 4 && (
                      <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{facts.formats.length - 4}</span>
                    )}
                  </div>
                )}
                {facts.colours.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground" title={facts.colours.join(', ')}>
                    {facts.colours.length === 1 ? facts.colours[0] : `${facts.colours.length} colours: ${facts.colours.join(', ')}`}
                  </p>
                )}
                {showPrices && (() => {
                  // One price source (#368 PD-4). These are real catalog rows, so the resolver
                  // is the answer: falling back to the embedded retail showed a reseller the
                  // shelf price instead of the discounted one they would actually be charged,
                  // and nothing about a valid number says it came from the wrong place.
                  const vp = viewerPrices[product.id];
                  const price = vp?.price ?? null;
                  if (price == null) return null;
                  const cur = vp?.currency ?? 'EUR';
                  const disc = vp?.discount_pct ?? 0;
                  // The LABEL comes from `kind`, not from whether there is a discount.
                  const label = vp?.kind === 'your_price' ? 'Your Price' : 'Retail';
                  return (
                    <p className="text-sm font-semibold text-foreground mt-1.5">
                      <span className="mr-1 text-[11px] font-normal text-muted-foreground">{label}</span>
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
