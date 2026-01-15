import React, { useState } from 'react';
import { Package, Plus, Eye, ChevronRight, Trash2, Minus, Ruler } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
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
  editable?: boolean; // Allow editing quantities and removing items
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
    const displayProduct = convertToDisplayProduct(product);
    setSelectedProduct(displayProduct);
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

  const renderCompactItem = (item: QuoteItemWithProduct) => {
    const selectedSize = extractSizeFromNotes(item.notes);
    return (
    <div
      key={item.id}
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group"
      style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}
      onClick={() => item.product && handleViewProduct(item.product)}
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded bg-muted overflow-hidden flex-shrink-0">
          {item.product?.image_url ? (
            <img
              src={item.product.image_url}
              alt={item.product.name || 'Product'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium">{item.product?.name || 'Unknown Product'}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {item.product?.sku && (
              <span className="text-xs text-muted-foreground">SKU: {item.product.sku}</span>
            )}
            {selectedSize && (
              <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                {selectedSize}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {editable && onUpdateQuantity ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={updatingItemId === item.id || item.quantity <= 1}
              onClick={(e) => {
                e.stopPropagation();
                handleQuantityChange(item.id, item.quantity - 1);
              }}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
              className="w-14 h-7 text-center text-sm"
              disabled={updatingItemId === item.id}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={updatingItemId === item.id}
              onClick={(e) => {
                e.stopPropagation();
                handleQuantityChange(item.id, item.quantity + 1);
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Badge variant="secondary" className="text-sm">
            Qty: {item.quantity}
          </Badge>
        )}
        {editable && onRemoveItem && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={removingItemId === item.id}
            onClick={(e) => handleRemoveItem(e, item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
    );
  };

  const renderDetailedItem = (item: QuoteItemWithProduct, index: number) => {
    const selectedSize = extractSizeFromNotes(item.notes);
    return (
    <div
      key={item.id}
      className="flex items-start gap-4 p-4 border rounded-lg bg-card hover:shadow-md transition-all cursor-pointer group"
      style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}
      onClick={() => item.product && handleViewProduct(item.product)}
    >
      {/* Item Image */}
      <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden flex-shrink-0">
        {item.product?.image_url ? (
          <img
            src={item.product.image_url}
            alt={item.product.name || 'Product'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-semibold truncate group-hover:text-primary transition-colors">
              {item.product?.name || `Item ${index + 1}`}
            </h4>
            {item.product?.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.product.description}</p>
            )}
            {item.product?.sku && (
              <p className="text-xs text-muted-foreground mt-1">SKU: {item.product.sku}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {editable && onUpdateQuantity ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={updatingItemId === item.id || item.quantity <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.id, item.quantity - 1);
                  }}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                  className="w-16 h-8 text-center text-sm"
                  disabled={updatingItemId === item.id}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={updatingItemId === item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuantityChange(item.id, item.quantity + 1);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Badge variant="secondary">Qty: {item.quantity}</Badge>
            )}
            {editable && onRemoveItem && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={removingItemId === item.id}
                onClick={(e) => handleRemoveItem(e, item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                item.product && handleViewProduct(item.product);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Item Notes - show size badge instead of raw notes */}
        {selectedSize && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Size: {selectedSize}
            </span>
          </div>
        )}
      </div>
    </div>
    );
  };

  return (
    <>
      <Card style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Quote Items</CardTitle>
            <CardDescription>
              {items.length > 0 ? `${items.length} item${items.length !== 1 ? 's' : ''} in this quote - Click to view details` : 'Materials included in this quote'}
            </CardDescription>
          </div>
          {showAddButton && onAddProducts && (
            <Button onClick={onAddProducts} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Products
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item, index) =>
                variant === 'compact' ? renderCompactItem(item) : renderDetailedItem(item, index),
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{emptyMessage}</p>
              {showAddButton && onAddProducts && (
                <Button onClick={onAddProducts} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  {emptyButtonText}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProduct(null);
        }}
      />
    </>
  );
};

