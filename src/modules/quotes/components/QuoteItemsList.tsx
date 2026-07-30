import React, { useState, useEffect, useRef } from 'react';
import { UNITS } from '@/lib/units';
import { Package, Plus, Eye, Trash2, Minus, Ruler, Loader2, PenLine, Home, Wrench, Truck, ChevronDown, ChevronUp, DollarSign, Send } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { QuoteItemWithProduct } from '../services/QuotesService';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import { MarketIntelCard } from '@/components/business/MarketIntelCard';
import { Product, SimpleProduct } from '@/components/features/products/types';
import {
  getProductImageUrl,
  getProductName,
  getMaterialCategory,
} from '@/utils/productMetadata';
import { PriceLookupDrawer } from '@/components/features/pricing/PriceLookupDrawer';
import { usePermissions } from '@/hooks/usePermissions';
import { parseDecimal } from '@/utils/decimal';
import { masterRequestsService } from '@/services/masterRequestsService';
import { useToast } from '@/hooks/use-toast';

// Helper to extract size from notes (format: "Size: 15×38 cm")
const extractSizeFromNotes = (notes?: string | null): string | null => {
  if (!notes) return null;
  const match = notes.match(/Size:\s*(.+)/i);
  return match ? match[1].trim() : null;
};

const fmtPrice = (v: number | undefined | null) =>
  v != null ? `€${Number(v).toFixed(2)}` : '—';

interface QuoteItemsListProps {
  items: QuoteItemWithProduct[];
  showAddButton?: boolean;
  onAddProducts?: () => void;
  /** Quantity update (customer + admin) */
  onUpdateQuantity?: (itemId: string, quantity: number) => Promise<void>;
  /** Pricing + unit + FF&E update (admin only) */
  onUpdateItem?: (itemId: string, data: { unit_price?: number | null; discounted_price?: number | null; custom_unit?: string; notes?: string; room?: string; dimensions?: string; installation_requirements?: string; delivery_date?: string | null; price_source?: string | null; price_lookup_call_id?: string | null }) => Promise<void>;
  onRemoveItem?: (itemId: string) => Promise<void>;
  /** When true admin pricing fields (price, discounted, unit) are editable */
  editPricing?: boolean;
  /** When false, price/total columns are hidden entirely (e.g. customer view before quote is priced). Defaults to true. */
  showPricing?: boolean;
  /** #227 — when false AND the viewer is a sales rep, the per-line margin is hidden. Defaults to true. */
  salesCanSeeCost?: boolean;
  /** When true, unit column is editable via dropdown (admin only). Defaults to false. */
  editUnits?: boolean;
  emptyMessage?: string;
  emptyButtonText?: string;
  editable?: boolean;
  /** @deprecated use editPricing — kept for backward compat */
  variant?: 'compact' | 'detailed';
  /** B2B customer of the parent quote — passed to PriceLookupDrawer so the AI factors the CRM-managed discount into the proposal. */
  customerCompanyId?: string | null;
  /** B2C / private customer of the parent quote — same role as customerCompanyId. */
  customerContactId?: string | null;
  /** #237 Phase 4.4 — reload the items after an upstream RFQ is sent (lines flip to awaiting_supplier). */
  onRefresh?: () => void | Promise<void>;
}

// Convert quote product to display product format.
//
// SimpleProduct.metadata is typed as ProductMetadata where every field is
// `unknown` (wrapper-or-primitive polymorphism). Coerce each field to its
// destination type before assigning so we get a properly-typed Product
// rather than relying on `any`-style implicit casts.
const asStr = (v: unknown, fallback = ''): string => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const inner = (v as Record<string, unknown>).value;
    return inner == null || inner === '' ? fallback : String(inner);
  }
  return String(v);
};
const asNum = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return asNum((v as Record<string, unknown>).value, fallback);
  }
  return fallback;
};
const asObj = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
};
const asStrArr = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.map(x => (typeof x === 'string' ? x : String(x))).filter(Boolean);
};

const convertToDisplayProduct = (product: SimpleProduct): Product => {
  const displayName = getProductName(product);
  const imageUrl = getProductImageUrl(product);
  const md = product.metadata || {};
  return {
    id: product.id,
    sku: product.sku || '',
    name: displayName,
    description: product.description || '',
    category: getMaterialCategory(md) || 'other',
    type: asStr(md.type),
    status: 'Active',
    images: imageUrl ? [{ url: imageUrl, alt: displayName, isPrimary: true }] : [],
    metadata: md,
    properties: asObj(md.properties),
    specifications: asObj(md.specifications),
    pricing: {
      retail: asNum(md.price),
      wholesale: 0, // #227 — never carry procurement cost into a display product (was leaking products.cost)
      currency: product.cost_currency || 'EUR',
    },
    stock: {
      quantity: asNum(md.stock_quantity),
      status: 'Available',
      unit: asStr(md.unit, 'pcs'),
    },
    tags: asStrArr(md.tags),
    variants: [],
  };
};

/** Inline editable price cell — shows text when not editable, input when editable */
const PriceCell: React.FC<{
  value: number | null | undefined;
  editable: boolean;
  placeholder?: string;
  onSave: (v: number | null) => void;
  highlight?: boolean;
}> = ({ value, editable, placeholder = '—', onSave, highlight }) => {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when external value changes (e.g. after save)
  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  if (!editable) {
    return (
      <span className={`text-sm ${highlight ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
        {fmtPrice(value)}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={local}
          placeholder="0.00"
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            onSave(parseDecimal(local));
          }}
          onKeyDown={e => { if (e.key === 'Enter') inputRef.current?.blur(); }}
          className={`h-7 w-24 text-right text-xs pl-5 pr-1 ${highlight ? 'border-primary/40 focus-visible:ring-primary/30' : ''}`}
        />
      </div>
    </div>
  );
};

export const QuoteItemsList: React.FC<QuoteItemsListProps> = ({
  items,
  showAddButton = false,
  onAddProducts,
  onUpdateQuantity,
  onUpdateItem,
  onRemoveItem,
  editPricing = false,
  showPricing = true,
  salesCanSeeCost = true,
  editUnits = false,
  emptyMessage = 'No items in this quote yet',
  emptyButtonText = 'Add Your First Product',
  editable = false,
  customerCompanyId,
  customerContactId,
  onRefresh,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  // Price lookup drawer state — one instance, reused for any row the admin clicks.
  const [lookupItem, setLookupItem] = useState<QuoteItemWithProduct | null>(null);
  // #227 — hide the per-line margin from a sales rep when sales_can_see_cost is off.
  const { isSalesRep, can } = usePermissions();
  const { toast } = useToast();
  const [rfqBusy, setRfqBusy] = useState(false);
  // #237 Phase 4.4 — catalog lines still needing a price that we can route upstream.
  const callForPriceItems = items.filter(
    (i) => ((i as any).pricing_status ?? 'priced') === 'call_for_price' && i.product_id,
  );
  const quoteIdForRfq = items[0]?.quote_id ?? null;

  const handleRequestSupplierPrices = async () => {
    if (!quoteIdForRfq || callForPriceItems.length === 0) return;
    setRfqBusy(true);
    try {
      await masterRequestsService.submitLineRfq(
        quoteIdForRfq,
        callForPriceItems.map((i) => i.id),
      );
      // The supplier is notified server-side by the _notify_rfq_lifecycle DB trigger
      // (master_requests → 'in_review'); no client-side emit needed.
      toast({
        title: `Requested prices for ${callForPriceItems.length} line(s)`,
        description: 'Your supplier will price them and send them back.',
      });
      await onRefresh?.();
    } catch (err: any) {
      toast({ title: 'Could not send request', description: err?.message, variant: 'destructive' });
    } finally {
      setRfqBusy(false);
    }
  };

  // A sales MANAGER owns the team's numbers, so the per-rep cost blind is not theirs to wear.
  const showMargin = can('sales.team.view') || !(isSalesRep && !salesCanSeeCost);
  // #227 — per-line margin (cost → price spread) is internal-only: pricing managers/admins,
  // and even then hidden from a sales rep who isn't cleared to see cost.
  const canSeeLineMargin = can('pricing.manage') && showMargin;

  const handleViewProduct = (product: SimpleProduct) => {
    setSelectedProduct(convertToDisplayProduct(product));
    setIsModalOpen(true);
  };

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (!onUpdateQuantity || newQuantity < 1) return;
    try {
      setUpdatingItemId(itemId);
      await onUpdateQuantity(itemId, newQuantity);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handlePriceSave = async (
    itemId: string,
    field: 'unit_price' | 'discounted_price',
    value: number | null,
  ) => {
    if (!onUpdateItem) return;
    try {
      setSavingPriceId(itemId);
      await onUpdateItem(itemId, { [field]: value });
    } finally {
      setSavingPriceId(null);
    }
  };

  const handleUnitSave = async (itemId: string, unit: string) => {
    if (!onUpdateItem) return;
    await onUpdateItem(itemId, { custom_unit: unit });
  };

  const handleFFESave = async (itemId: string, field: 'room' | 'dimensions' | 'installation_requirements' | 'delivery_date', value: string | null) => {
    if (!onUpdateItem) return;
    await onUpdateItem(itemId, { [field]: value || undefined });
  };

  const handleRemoveItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!onRemoveItem) return;
    try {
      setRemovingItemId(itemId);
      await onRemoveItem(itemId);
    } finally {
      setRemovingItemId(null);
    }
  };

  return (
    <>
      <div className="dashboard-card rounded-2xl border-0 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Package className="h-4 w-4" />
              Quote Items
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {items.length > 0
                ? `${items.length} item${items.length !== 1 ? 's' : ''}${!editPricing ? ' · Click a row to view product details' : ''}`
                : 'Materials included in this quote'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* #237 Phase 4.4 — route all unpriced catalog lines to the supplier for pricing. */}
            {can('pricing.manage') && callForPriceItems.length > 0 && (
              <Button
                onClick={handleRequestSupplierPrices}
                disabled={rfqBusy}
                size="sm"
                variant="outline"
                className="rounded-full gap-1.5"
                title="Ask the supplier to price the call-for-price lines"
              >
                {rfqBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Request supplier prices ({callForPriceItems.length})
              </Button>
            )}
            {showAddButton && onAddProducts && (
              <Button onClick={onAddProducts} size="sm" className="rounded-full gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add products
              </Button>
            )}
          </div>
        </div>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3 min-w-[220px]">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-28">Room</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-20">Unit</th>
                  {showPricing && (
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-36">
                      Price
                      {editPricing && <span className="block text-[10px] font-normal opacity-60">click to edit</span>}
                    </th>
                  )}
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 w-28">Qty</th>
                  {showPricing && (
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-28">Total</th>
                  )}
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.map((item) => {
                  const selectedSize = extractSizeFromNotes(item.notes);
                  const isUpdating = updatingItemId === item.id;
                  const isRemoving = removingItemId === item.id;
                  const isSavingPrice = savingPriceId === item.id;
                  const isCustom = !item.product_id;
                  const isExpanded = expandedItemId === item.id;

                  const unit = isCustom
                    ? (item.custom_unit || 'pcs')
                    : (item.product?.metadata?.unit || 'pcs');

                  // Effective total for display
                  const effectivePrice = (item as any).discounted_price ?? item.unit_price;
                  const displayTotal = effectivePrice != null
                    ? Number(effectivePrice) * item.quantity
                    : item.line_total;

                  const hasDiscount = (item as any).discounted_price != null &&
                    (item as any).discounted_price !== item.unit_price;

                  // #237 Phase 4: unpriced line — "call for price" (needs pricing) or
                  // "awaiting supplier" (RFQ sent upstream). Rendered in place of a price.
                  const pricingStatus = ((item as any).pricing_status ?? 'priced') as string;
                  const callForPrice = pricingStatus !== 'priced';
                  const awaitingSupplier = pricingStatus === 'awaiting_supplier';

                  const productName = isCustom ? (item.custom_product_name || 'Custom Item') : (item.product?.name || 'Unknown Product');
                  const displayName = item.dimensions ? `${productName}, ${item.dimensions}` : productName;

                  const hasDetails = item.notes || item.installation_requirements || item.delivery_date;

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`hover:bg-muted/20 transition-colors group ${isCustom || editPricing ? 'cursor-default' : 'cursor-pointer'}`}
                        onClick={() => !isCustom && !editPricing && item.product && handleViewProduct(item.product)}
                      >
                        {/* Product + Dimensions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                              {isCustom && item.custom_image_url ? (
                                <img src={item.custom_image_url} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                              ) : isCustom ? (
                                <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                  <PenLine className="h-4 w-4 text-primary/60" />
                                </div>
                              ) : item.product && getProductImageUrl(item.product) ? (
                                <img src={getProductImageUrl(item.product) || ''} alt={getProductName(item.product)} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground/50" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`text-sm font-medium leading-tight truncate max-w-[200px] ${!isCustom && !editPricing ? 'group-hover:text-primary transition-colors' : ''}`}>
                                  {displayName}
                                </p>
                                {isCustom && (
                                  <span className="text-[10px] text-primary/70 capitalize flex-shrink-0">Custom</span>
                                )}
                              </div>
                              {(isCustom ? item.custom_sku : item.product?.sku) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  SKU: {isCustom ? item.custom_sku : item.product?.sku}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(item.selected_size || selectedSize) && (
                                  <Badge variant="secondary" className="text-[10px] rounded-full gap-1 font-normal px-1.5 py-0">
                                    <Ruler className="h-2 w-2" />
                                    {item.selected_size || selectedSize}
                                  </Badge>
                                )}
                                {item.selected_color && (
                                  <Badge variant="secondary" className="text-[10px] rounded-full font-normal px-1.5 py-0">
                                    {item.selected_color}
                                  </Badge>
                                )}
                                {hasDetails && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedItemId(isExpanded ? null : item.id); }}
                                    className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary transition-colors"
                                  >
                                    {isExpanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                                    Details
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Room — editable by customer on draft quotes */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {editable && onUpdateItem ? (
                            <FFETextCell
                              value={item.room || ''}
                              placeholder="Room"
                              onSave={v => handleFFESave(item.id, 'room', v)}
                              icon={<Home className="h-3 w-3 text-muted-foreground" />}
                            />
                          ) : item.room ? (
                            <span className="text-xs text-foreground flex items-center gap-1">
                              <Home className="h-3 w-3 text-muted-foreground" />
                              {item.room}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Unit */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {editUnits && onUpdateItem ? (
                            <UnitCell
                              value={unit}
                              onSave={(v) => handleUnitSave(item.id, v)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{unit}</span>
                          )}
                        </td>

                        {/* Price (merged: original + discounted) */}
                        {showPricing && (
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            {isSavingPrice ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto text-muted-foreground" />
                            ) : callForPrice && !editPricing ? (
                              <span
                                className={`text-[10px] whitespace-nowrap ${awaitingSupplier ? 'text-amber-600' : 'text-primary/80'}`}
                              >
                                {awaitingSupplier ? 'Awaiting supplier' : 'Call for price'}
                              </span>
                            ) : editPricing ? (
                              <div className="space-y-1">
                                <PriceCell
                                  value={item.unit_price}
                                  editable
                                  onSave={v => handlePriceSave(item.id, 'unit_price', v)}
                                />
                                <PriceCell
                                  value={(item as any).discounted_price}
                                  editable
                                  placeholder="Disc."
                                  onSave={v => handlePriceSave(item.id, 'discounted_price', v)}
                                  highlight={hasDiscount}
                                />
                              </div>
                            ) : hasDiscount ? (
                              <div>
                                <span className="text-xs text-muted-foreground line-through">{fmtPrice(item.unit_price)}</span>
                                <div className="text-sm font-semibold text-primary">{fmtPrice((item as any).discounted_price)}</div>
                              </div>
                            ) : (
                              <span className="text-sm">{fmtPrice(item.unit_price)}</span>
                            )}
                            {/* #227 — seller-only breakdown: retail anchor, discount off retail, margin (ex-VAT). */}
                            {editPricing && (() => {
                              const retail = (item as any).retail_price != null ? Number((item as any).retail_price) : null;
                              const cost = (item as any).cost_snapshot != null ? Number((item as any).cost_snapshot)
                                : (item.product as any)?.cost != null ? Number((item.product as any).cost) : null;
                              const final = effectivePrice != null ? Number(effectivePrice) : null;
                              const off = retail != null && final != null && retail > 0 ? Math.round((1 - final / retail) * 100) : null;
                              const marginPct = cost != null && final != null && cost > 0 ? Math.round(((final - cost) / cost) * 100) : null;
                              const parts: string[] = [];
                              if (retail != null && off != null && off > 0) parts.push(`Retail ${fmtPrice(retail)} · ${off}% off`);
                              if (showMargin && marginPct != null) parts.push(`margin ${marginPct}%`);
                              if (parts.length === 0) return null;
                              return (
                                <div className={`mt-1 text-[10px] ${marginPct != null && marginPct < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {parts.join(' · ')}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Quantity */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {onUpdateQuantity ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline" size="icon" className="h-6 w-6 rounded-full"
                                disabled={isUpdating || item.quantity <= 1}
                                onClick={e => { e.stopPropagation(); handleQuantityChange(item.id, item.quantity - 1); }}
                              >
                                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
                              </Button>
                              <Input
                                type="number" min={1} value={item.quantity}
                                onChange={e => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                className="w-12 h-6 text-center text-xs px-1"
                                disabled={isUpdating}
                              />
                              <Button
                                variant="outline" size="icon" className="h-6 w-6 rounded-full"
                                disabled={isUpdating}
                                onClick={e => { e.stopPropagation(); handleQuantityChange(item.id, item.quantity + 1); }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-center">
                              <Badge variant="secondary" className="rounded-full text-xs font-normal px-3">{item.quantity}</Badge>
                            </div>
                          )}
                        </td>

                        {/* Total */}
                        {showPricing && (
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold">
                              {callForPrice ? '—' : fmtPrice(displayTotal)}
                            </span>
                            {hasDiscount && item.unit_price != null && (
                              <div className="text-xs text-muted-foreground line-through">
                                {fmtPrice(Number(item.unit_price) * item.quantity)}
                              </div>
                            )}
                            {/* #227 — internal-only per-line margin: (price − cost) × qty. */}
                            {canSeeLineMargin && (() => {
                              const cost = (item as any).cost_snapshot != null ? Number((item as any).cost_snapshot) : null;
                              const finalUnit = effectivePrice != null ? Number(effectivePrice) : null;
                              if (cost == null || finalUnit == null) return null;
                              const marginValue = (finalUnit - cost) * item.quantity;
                              const marginPct = cost > 0 ? Math.round(((finalUnit - cost) / cost) * 100) : null;
                              const below = marginValue < 0;
                              return (
                                <div className={`mt-0.5 text-[10px] ${below ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {below ? 'below cost ' : 'margin '}{fmtPrice(marginValue)}{marginPct != null ? ` · ${marginPct}%` : ''}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Actions */}
                        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {(hasDetails || editable) && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={e => { e.stopPropagation(); setExpandedItemId(isExpanded ? null : item.id); }}
                                title="Toggle details"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {!isCustom && !editPricing && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={e => { e.stopPropagation(); item.product && handleViewProduct(item.product); }}
                                title="View product"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {editPricing && onUpdateItem && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={e => { e.stopPropagation(); setLookupItem(item); }}
                                title="Get price from Knowledge Base"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {onRemoveItem && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={isRemoving || !editable}
                                onClick={e => editable && handleRemoveItem(e, item.id)}
                                title="Remove item"
                              >
                                {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Details Row — Notes, Installation, Delivery */}
                      {isExpanded && (
                        <tr className="bg-muted/10">
                          <td colSpan={99} className="px-5 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-[52px]">
                              {/* Notes */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                  <Package className="h-3 w-3" /> Notes
                                </label>
                                {editable && onUpdateItem ? (
                                  <textarea
                                    defaultValue={item.notes || ''}
                                    placeholder="General notes..."
                                    rows={2}
                                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                    onBlur={e => onUpdateItem(item.id, { notes: e.target.value })}
                                  />
                                ) : (
                                  <p className="text-xs text-foreground">{item.notes || <span className="text-muted-foreground">—</span>}</p>
                                )}
                              </div>

                              {/* Installation Requirements */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                  <Wrench className="h-3 w-3" /> Installation Requirements
                                </label>
                                {editable && onUpdateItem ? (
                                  <FFETextAreaCell
                                    value={item.installation_requirements || ''}
                                    placeholder="e.g. Requires electrical outlet, wall mounting brackets..."
                                    onSave={v => handleFFESave(item.id, 'installation_requirements', v)}
                                  />
                                ) : (
                                  <p className="text-xs text-foreground">{item.installation_requirements || <span className="text-muted-foreground">—</span>}</p>
                                )}
                              </div>

                              {/* Delivery Date — editable via the always-on `editable` path (like room /
                                  installation) OR the pricing tab; customers see it read-only once quoted. */}
                              {(editable || editPricing || (showPricing && item.delivery_date)) && (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                    <Truck className="h-3 w-3" /> Expected Delivery
                                  </label>
                                  {(editable || editPricing) && onUpdateItem ? (
                                    <Input
                                      type="date"
                                      defaultValue={item.delivery_date || ''}
                                      className="h-7 text-xs"
                                      onChange={e => handleFFESave(item.id, 'delivery_date', e.target.value || null)}
                                    />
                                  ) : (
                                    <p className="text-xs text-foreground flex items-center gap-1">
                                      <Truck className="h-3 w-3 text-muted-foreground" />
                                      {new Date(item.delivery_date!).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {item.product_id && (
                              <div className="pl-[52px] mt-3">
                                <MarketIntelCard productId={item.product_id} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-14">
            <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{emptyMessage}</p>
            {showAddButton && onAddProducts && (
              <Button onClick={onAddProducts} variant="outline" className="rounded-full gap-1.5">
                <Plus className="h-4 w-4" />
                {emptyButtonText}
              </Button>
            )}
          </div>
        )}
      </div>

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedProduct(null); }}
      />

      {lookupItem && (
        <PriceLookupDrawer
          open={!!lookupItem}
          onOpenChange={(v) => { if (!v) setLookupItem(null); }}
          productId={lookupItem.product?.id}
          productName={
            lookupItem.custom_product_name ||
            lookupItem.product?.name ||
            'Unknown product'
          }
          sku={lookupItem.product?.sku || lookupItem.custom_sku || undefined}
          manufacturer={(lookupItem.product?.metadata as any)?.factory?.factory_name}
          quantity={lookupItem.quantity}
          unit={lookupItem.custom_unit || undefined}
          customerCompanyId={customerCompanyId}
          customerContactId={customerContactId}
          onConfirm={async (payload) => {
            if (!onUpdateItem) return;
            await onUpdateItem(lookupItem.id, {
              unit_price: payload.unit_price,
              discounted_price: payload.discount_price ?? null,
              notes: payload.notes ?? lookupItem.notes ?? undefined,
              price_source: payload.price_source ?? null,
              price_lookup_call_id: payload.price_lookup_call_id ?? null,
            });
            setLookupItem(null);
          }}
        />
      )}
    </>
  );
};

/** Inline editable text cell for FF&E fields */
const FFETextCell: React.FC<{
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  icon?: React.ReactNode;
}> = ({ value, placeholder, onSave, icon }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-1">
      {icon}
      <Input
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="h-7 w-24 text-xs px-2"
        placeholder={placeholder}
      />
    </div>
  );
};

/** Inline editable textarea for FF&E detail fields */
const FFETextAreaCell: React.FC<{
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}> = ({ value, placeholder, onSave }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <textarea
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      placeholder={placeholder}
      rows={2}
      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
    />
  );
};

/** Inline editable unit cell for custom items */
// Canonical units — was a bespoke list whose 'sqm'/'liters'/'boxes' did not match the
// order lines ('m2'/'lt'/'box') the same product ends up on.
const UNIT_OPTIONS = UNITS.map((u) => u.key);

const UnitCell: React.FC<{ value: string; onSave: (v: string) => void }> = ({ value, onSave }) => (
  <Select value={value} onValueChange={v => { if (v !== value) onSave(v); }}>
    <SelectTrigger className="h-7 w-20 text-xs px-2">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {UNIT_OPTIONS.map(u => (
        <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);
