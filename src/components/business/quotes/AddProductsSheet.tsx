/**
 * AddProductsSheet Component
 * Slide-out sheet for searching and adding products to a quote
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  Package,
  X,
  ShoppingCart,
  Check,
  Ruler,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/core/ui/sheet';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { ScrollArea } from '@/components/core/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { quotesService } from '@/services/quotes/QuotesService';

interface ProductWithImage {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  metadata?: Record<string, any>;
  image_url?: string;
}

// Helper to extract available sizes from product metadata
const getAvailableSizes = (metadata?: Record<string, any>): string[] => {
  if (!metadata) return [];

  const sizes: string[] = [];
  const availableSizes = metadata.available_sizes || metadata.dimensions || [];

  if (Array.isArray(availableSizes)) {
    availableSizes.forEach((d: unknown) => {
      if (typeof d === 'object' && d !== null) {
        const dim = d as Record<string, unknown>;
        if (dim.width && dim.height) {
          const unit = dim.unit || 'cm';
          sizes.push(`${dim.width}×${dim.height}${dim.depth ? `×${dim.depth}` : ''} ${unit}`);
        }
      } else if (typeof d === 'string') {
        sizes.push(d);
      }
    });
  } else if (typeof availableSizes === 'string') {
    // Split comma-separated sizes
    sizes.push(...availableSizes.split(',').map(s => s.trim()).filter(Boolean));
  }

  return sizes;
};

interface SelectedProduct extends ProductWithImage {
  quantity: number;
  selectedSize?: string; // Selected tile size
}

interface AddProductsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  existingProductIds: string[];
  onProductsAdded: () => void;
}

export const AddProductsSheet: React.FC<AddProductsSheetProps> = ({
  open,
  onOpenChange,
  quoteId,
  existingProductIds,
  onProductsAdded,
}) => {
  const { toast } = useToast();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithImage[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Selected products state
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [adding, setAdding] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await quotesService.searchProductsWithImages(searchQuery, 15);
        // Filter out products already in quote or already selected
        const selectedIds = selectedProducts.map(p => p.id);
        const filteredResults = results.filter(
          p => !existingProductIds.includes(p.id) && !selectedIds.includes(p.id),
        );
        setSearchResults(filteredResults);
      } catch (error) {
        console.error('Error searching products:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, existingProductIds, selectedProducts]);

  // Add product to selection
  const handleSelectProduct = useCallback((product: ProductWithImage) => {
    const sizes = getAvailableSizes(product.metadata);
    setSelectedProducts(prev => [...prev, {
      ...product,
      quantity: 1,
      selectedSize: sizes.length > 0 ? sizes[0] : undefined,
    }]);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // Update quantity
  const handleQuantityChange = useCallback((productId: string, delta: number) => {
    setSelectedProducts(prev =>
      prev.map(p =>
        p.id === productId
          ? { ...p, quantity: Math.max(1, p.quantity + delta) }
          : p,
      ),
    );
  }, []);

  // Update selected size
  const handleSizeChange = useCallback((productId: string, size: string) => {
    setSelectedProducts(prev =>
      prev.map(p =>
        p.id === productId
          ? { ...p, selectedSize: size }
          : p,
      ),
    );
  }, []);

  // Remove from selection
  const handleRemoveProduct = useCallback((productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  }, []);

  // Add all selected products to quote
  const handleAddToQuote = async () => {
    if (selectedProducts.length === 0) return;

    try {
      setAdding(true);

      // Add each product to the quote with size info in notes
      for (const product of selectedProducts) {
        const notes = product.selectedSize ? `Size: ${product.selectedSize}` : undefined;
        await quotesService.addItem({
          quote_id: quoteId,
          product_id: product.id,
          quantity: product.quantity,
          added_from: 'manual',
          notes,
        });
      }

      toast({
        title: 'Products Added',
        description: `Successfully added ${selectedProducts.length} product(s) to your quote`,
      });

      // Reset and close
      setSelectedProducts([]);
      setSearchQuery('');
      onProductsAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding products:', error);
      toast({
        title: 'Error',
        description: 'Failed to add products to quote',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  // Reset on close
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedProducts([]);
      setSearchQuery('');
      setSearchResults([]);
    }
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Add Products to Quote
          </SheetTitle>
          <SheetDescription>
            Search and select products to add to your quote
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 mt-4 min-h-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name, brand, material, color..."
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="border rounded-lg bg-background shadow-lg max-h-64 overflow-auto">
              {searchLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="divide-y">
                  {searchResults.map((product) => {
                    // Extract useful metadata for display
                    const metadata = product.metadata || {};
                    const manufacturer = metadata.manufacturer || metadata.brand || metadata.factory;
                    const collection = metadata.collection || metadata.series;
                    const availableSizes = getAvailableSizes(metadata);

                    return (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                      >
                        <div className="w-14 h-14 rounded bg-muted flex-shrink-0 overflow-hidden">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name || 'Product'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{product.name || 'Unnamed Product'}</p>
                          {manufacturer && (
                            <p className="text-xs text-muted-foreground truncate">
                              by {manufacturer}{collection ? ` • ${collection}` : ''}
                            </p>
                          )}
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            {product.sku && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {product.sku}
                              </span>
                            )}
                            {availableSizes.length > 0 && (
                              <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Ruler className="h-3 w-3" />
                                {availableSizes.length} size{availableSizes.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-muted-foreground text-sm">
                  No products found
                </div>
              )}
            </div>
          )}

          {/* Selected Products Table */}
          {selectedProducts.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col border rounded-lg">
              <div className="px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
                <span className="text-sm font-medium">
                  Selected Products ({selectedProducts.length})
                </span>
                <Badge variant="secondary">
                  {selectedProducts.reduce((sum, p) => sum + p.quantity, 0)} total items
                </Badge>
              </div>
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Image</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-36">Size</TableHead>
                      <TableHead className="w-28 text-center">Qty</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map((product) => {
                      const availableSizes = getAvailableSizes(product.metadata);
                      return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="w-12 h-12 rounded bg-muted overflow-hidden">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name || 'Product'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm truncate max-w-[120px]">
                            {product.name || 'Unnamed Product'}
                          </p>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {availableSizes.length > 0 ? (
                            <Select
                              value={product.selectedSize || availableSizes[0]}
                              onValueChange={(value) => handleSizeChange(product.id, value)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableSizes.map((size) => (
                                  <SelectItem key={size} value={size} className="text-xs">
                                    {size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(product.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-medium text-sm">{product.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleQuantityChange(product.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          {/* Empty State */}
          {selectedProducts.length === 0 && !searchQuery && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Search for products above to add them to your quote
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t pt-4 mt-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleAddToQuote}
            disabled={selectedProducts.length === 0 || adding}
          >
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Add {selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddProductsSheet;

