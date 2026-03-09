import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Eye, Trash2, Minus, Ruler, Loader2, PenLine } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { QuoteItemWithProduct } from '@/services/quotes/QuotesService';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import { Product, SimpleProduct } from '@/components/features/products/types';

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
  /** Pricing + unit update (admin only) */
  onUpdateItem?: (itemId: string, data: { unit_price?: number | null; discounted_price?: number | null; custom_unit?: string }) => Promise<void>;
  onRemoveItem?: (itemId: string) => Promise<void>;
  /** When true admin pricing fields (price, discounted, unit) are editable */
  editPricing?: boolean;
  emptyMessage?: string;
  emptyButtonText?: string;
  editable?: boolean;
  /** @deprecated use editPricing — kept for backward compat */
  variant?: 'compact' | 'detailed';
}

// Convert quote product to display product format
const convertToDisplayProduct = (product: SimpleProduct): Product => ({
  id: product.id,
  sku: product.sku || '',
  name: product.name || 'Unknown Product',
  description: product.description || '',
  category: product.metadata?.material_category || 'other',
  type: product.metadata?.type || '',
  status: 'Active',
  images: product.image_url ? [{ url: product.image_url, alt: product.name || 'Product', isPrimary: true }] : [],
  metadata: product.metadata || {},
  properties: product.metadata?.properties || {},
  specifications: product.metadata?.specifications || {},
  pricing: {
    retail: product.metadata?.price || 0,
    wholesale: product.metadata?.wholesale_price || 0,
    currency: 'EUR',
  },
  stock: {
    quantity: product.metadata?.stock_quantity || 0,
    status: 'Available',
    unit: product.metadata?.unit || 'pcs',
  },
  tags: product.metadata?.tags || [],
  variants: [],
});

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
          type="number"
          min={0}
          step="0.01"
          value={local}
          placeholder="0.00"
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            const num = parseFloat(local);
            onSave(isNaN(num) ? null : num);
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
  emptyMessage = 'No items in this quote yet',
  emptyButtonText = 'Add Your First Product',
  editable = false,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);

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
          {showAddButton && onAddProducts && (
            <Button onClick={onAddProducts} size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Products
            </Button>
          )}
        </div>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3 min-w-[180px]">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-20">Unit</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-28">Price</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-32">
                    Disc. Price
                    {editPricing && <span className="block text-[10px] font-normal opacity-60">optional</span>}
                  </th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 w-28">Qty</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-28">Total</th>
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

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/20 transition-colors group ${isCustom || editPricing ? 'cursor-default' : 'cursor-pointer'}`}
                      onClick={() => !isCustom && !editPricing && item.product && handleViewProduct(item.product)}
                    >
                      {/* Product */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                            {isCustom ? (
                              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                <PenLine className="h-4 w-4 text-primary/60" />
                              </div>
                            ) : item.product?.image_url ? (
                              <img src={item.product.image_url} alt={item.product.name || 'Product'} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`text-sm font-medium leading-tight truncate max-w-[160px] ${!isCustom && !editPricing ? 'group-hover:text-primary transition-colors' : ''}`}>
                                {isCustom ? (item.custom_product_name || 'Custom Item') : (item.product?.name || 'Unknown Product')}
                              </p>
                              {isCustom && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary/70 flex-shrink-0">Custom</Badge>
                              )}
                            </div>
                            {(isCustom ? item.custom_sku : item.product?.sku) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                SKU: {isCustom ? item.custom_sku : item.product?.sku}
                              </p>
                            )}
                            {(item.selected_size || selectedSize || item.selected_color) && (
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
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {editPricing && isCustom ? (
                          <UnitCell
                            value={unit}
                            onSave={(v) => handleUnitSave(item.id, v)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{unit}</span>
                        )}
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {isSavingPrice ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto text-muted-foreground" />
                        ) : (
                          <PriceCell
                            value={item.unit_price}
                            editable={editPricing}
                            onSave={v => handlePriceSave(item.id, 'unit_price', v)}
                          />
                        )}
                      </td>

                      {/* Discounted Price */}
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {isSavingPrice ? (
                          <span />
                        ) : (
                          <PriceCell
                            value={(item as any).discounted_price}
                            editable={editPricing}
                            placeholder="—"
                            onSave={v => handlePriceSave(item.id, 'discounted_price', v)}
                            highlight={hasDiscount}
                          />
                        )}
                      </td>

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
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold">
                          {fmtPrice(displayTotal)}
                        </span>
                        {hasDiscount && item.unit_price != null && (
                          <div className="text-xs text-muted-foreground line-through">
                            {fmtPrice(Number(item.unit_price) * item.quantity)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!isCustom && !editPricing && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={e => { e.stopPropagation(); item.product && handleViewProduct(item.product); }}
                              title="View product"
                            >
                              <Eye className="h-3.5 w-3.5" />
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
    </>
  );
};

/** Inline editable unit cell for custom items */
const UnitCell: React.FC<{ value: string; onSave: (v: string) => void }> = ({ value, onSave }) => {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="h-7 w-16 text-xs px-2"
      placeholder="pcs"
    />
  );
};
