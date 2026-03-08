import React, { useState } from 'react';
import { Package, Plus, Eye, Trash2, Minus, Ruler, Loader2 } from 'lucide-react';
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

interface QuoteItemsListProps {
  items: QuoteItemWithProduct[];
  showAddButton?: boolean;
  onAddProducts?: () => void;
  onUpdateQuantity?: (itemId: string, quantity: number) => Promise<void>;
  onRemoveItem?: (itemId: string) => Promise<void>;
  variant?: 'compact' | 'detailed';
  emptyMessage?: string;
  emptyButtonText?: string;
  editable?: boolean;
}

// Convert quote product to display product format
const convertToDisplayProduct = (product: SimpleProduct): Product => {
  return {
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
  };
};

export const QuoteItemsList: React.FC<QuoteItemsListProps> = ({
  items,
  showAddButton = false,
  onAddProducts,
  onUpdateQuantity,
  onRemoveItem,
  variant = 'compact',
  emptyMessage = 'No items in this quote yet',
  emptyButtonText = 'Add Your First Product',
  editable = false,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

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
                ? `${items.length} item${items.length !== 1 ? 's' : ''} · Click a row to view product details`
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
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Options</th>
                  {/* Unit price and line total columns — only shown in detailed variant */}
                  {variant === 'detailed' && (
                    <>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Unit Price</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Total</th>
                    </>
                  )}
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Qty</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.map((item) => {
                  const selectedSize = extractSizeFromNotes(item.notes);
                  const isUpdating = updatingItemId === item.id;
                  const isRemoving = removingItemId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/20 transition-colors cursor-pointer group"
                      onClick={() => item.product && handleViewProduct(item.product)}
                    >
                      {/* Product cell */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                            {item.product?.image_url ? (
                              <img
                                src={item.product.image_url}
                                alt={item.product.name || 'Product'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight group-hover:text-primary transition-colors truncate max-w-[200px]">
                              {item.product?.name || 'Unknown Product'}
                            </p>
                            {item.product?.sku && (
                              <p className="text-xs text-muted-foreground mt-0.5">SKU: {item.product.sku}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Options (size / color) */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(item.selected_size || selectedSize) && (
                            <Badge variant="secondary" className="text-xs rounded-full gap-1 font-normal">
                              <Ruler className="h-2.5 w-2.5" />
                              {item.selected_size || selectedSize}
                            </Badge>
                          )}
                          {item.selected_color && (
                            <Badge variant="secondary" className="text-xs rounded-full font-normal">
                              {item.selected_color}
                            </Badge>
                          )}
                          {!item.selected_size && !selectedSize && !item.selected_color && (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </td>

                      {/* Unit price + line total (detailed only) */}
                      {variant === 'detailed' && (
                        <>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm text-muted-foreground">
                              {item.unit_price != null ? `€${Number(item.unit_price).toFixed(2)}` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-medium">
                              {item.line_total != null ? `€${Number(item.line_total).toFixed(2)}` : '—'}
                            </span>
                          </td>
                        </>
                      )}

                      {/* Quantity */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {onUpdateQuantity ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6 rounded-full"
                              disabled={isUpdating || item.quantity <= 1}
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, item.quantity - 1); }}
                            >
                              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                              className="w-12 h-6 text-center text-xs px-1"
                              disabled={isUpdating}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6 rounded-full"
                              disabled={isUpdating}
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, item.quantity + 1); }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <Badge variant="secondary" className="rounded-full text-xs font-normal px-3">
                              {item.quantity}
                            </Badge>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); item.product && handleViewProduct(item.product); }}
                            title="View product"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {onRemoveItem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={isRemoving || !editable}
                              onClick={(e) => editable && handleRemoveItem(e, item.id)}
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

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedProduct(null); }}
      />
    </>
  );
};
