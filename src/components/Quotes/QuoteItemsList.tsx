import React from 'react';
import { Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { QuoteItemWithProduct } from '@/services/quotes/QuotesService';

interface QuoteItemsListProps {
  items: QuoteItemWithProduct[];
  showAddButton?: boolean;
  onAddProducts?: () => void;
  variant?: 'compact' | 'detailed';
  emptyMessage?: string;
  emptyButtonText?: string;
}

export const QuoteItemsList: React.FC<QuoteItemsListProps> = ({
  items,
  showAddButton = false,
  onAddProducts,
  variant = 'compact',
  emptyMessage = 'No items in this quote yet',
  emptyButtonText = 'Add Your First Product',
}) => {
  const renderCompactItem = (item: QuoteItemWithProduct) => (
    <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
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
          {item.product?.sku && (
            <p className="text-xs text-muted-foreground">SKU: {item.product.sku}</p>
          )}
        </div>
      </div>
      <Badge variant="secondary" className="text-sm">
        Qty: {item.quantity}
      </Badge>
    </div>
  );

  const renderDetailedItem = (item: QuoteItemWithProduct, index: number) => (
    <div
      key={item.id}
      className="flex items-start gap-4 p-4 border rounded-lg bg-muted/30"
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
            <h4 className="font-semibold truncate">
              {item.product?.name || `Item ${index + 1}`}
            </h4>
            {item.product?.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.product.description}</p>
            )}
            {item.product?.sku && (
              <p className="text-xs text-muted-foreground mt-1">SKU: {item.product.sku}</p>
            )}
          </div>
          <Badge variant="secondary" className="flex-shrink-0">Qty: {item.quantity}</Badge>
        </div>

        {/* Item Notes */}
        {item.notes && (
          <div className="mt-3 p-3 bg-background rounded border">
            <p className="text-sm text-muted-foreground">{item.notes}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Quote Items</CardTitle>
          <CardDescription>
            {items.length > 0 ? `${items.length} item${items.length !== 1 ? 's' : ''} in this quote` : 'Materials included in this quote'}
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
              variant === 'compact' ? renderCompactItem(item) : renderDetailedItem(item, index)
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
  );
};

