/**
 * AddProductsSheet Component
 * Slide-out sheet for searching and adding products to a quote.
 * Supports both catalog product search and custom (ad-hoc) product entry.
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
  PenLine,
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
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
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
    sizes.push(...availableSizes.split(',').map(s => s.trim()).filter(Boolean));
  }

  return sizes;
};

interface SelectedProduct extends ProductWithImage {
  quantity: number;
  selectedSize?: string;
}

interface CustomProductForm {
  name: string;
  sku: string;
  description: string;
  unit: string;
  unit_price: string;
  quantity: number;
  size: string;
  color: string;
}

const EMPTY_CUSTOM: CustomProductForm = {
  name: '',
  sku: '',
  description: '',
  unit: 'pcs',
  unit_price: '',
  quantity: 1,
  size: '',
  color: '',
};

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

  // Selected catalog products
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);

  // Custom product form
  const [customForm, setCustomForm] = useState<CustomProductForm>(EMPTY_CUSTOM);

  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'custom'>('search');

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
        const selectedIds = selectedProducts.map(p => p.id);
        setSearchResults(
          results.filter(p => !existingProductIds.includes(p.id) && !selectedIds.includes(p.id)),
        );
      } catch (error) {
        console.error('Error searching products:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, existingProductIds, selectedProducts]);

  // Add catalog product to selection
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

  const handleQuantityChange = useCallback((productId: string, delta: number) => {
    setSelectedProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p),
    );
  }, []);

  const handleSizeChange = useCallback((productId: string, size: string) => {
    setSelectedProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, selectedSize: size } : p),
    );
  }, []);

  const handleRemoveProduct = useCallback((productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  }, []);

  // Add all selected catalog products to quote
  const handleAddCatalogToQuote = async () => {
    if (selectedProducts.length === 0) return;
    try {
      setAdding(true);
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
      toast({ title: 'Products Added', description: `Added ${selectedProducts.length} product(s) to the quote.` });
      setSelectedProducts([]);
      setSearchQuery('');
      onProductsAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding products:', error);
      toast({ title: 'Error', description: 'Failed to add products to quote', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  // Add custom product to quote
  const handleAddCustomToQuote = async () => {
    if (!customForm.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a product name.', variant: 'destructive' });
      return;
    }
    try {
      setAdding(true);
      const unitPrice = customForm.unit_price ? parseFloat(customForm.unit_price) : undefined;
      await quotesService.addCustomItem({
        quote_id: quoteId,
        custom_product_name: customForm.name.trim(),
        custom_product_description: customForm.description.trim() || undefined,
        custom_sku: customForm.sku.trim() || undefined,
        custom_unit: customForm.unit.trim() || 'pcs',
        unit_price: unitPrice,
        quantity: customForm.quantity,
        selected_size: customForm.size.trim() || undefined,
        selected_color: customForm.color.trim() || undefined,
      });
      toast({ title: 'Custom Product Added', description: `"${customForm.name}" added to the quote.` });
      setCustomForm(EMPTY_CUSTOM);
      onProductsAdded();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding custom product:', error);
      toast({ title: 'Error', description: 'Failed to add custom product', variant: 'destructive' });
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
      setCustomForm(EMPTY_CUSTOM);
      setActiveTab('search');
    }
    onOpenChange(open);
  };

  const setCustomField = (field: keyof CustomProductForm, value: string | number) =>
    setCustomForm(prev => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Add Products to Quote
          </SheetTitle>
          <SheetDescription>
            Search the catalog or add a custom product
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'search' | 'custom')} className="flex-1 flex flex-col min-h-0 mt-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-4">
            <TabsTrigger value="search" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Search className="h-4 w-4" />
              Catalog Search
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <PenLine className="h-4 w-4" />
              Custom Product
            </TabsTrigger>
          </TabsList>

          {/* ── Catalog Search Tab ── */}
          <TabsContent value="search" className="flex-1 flex flex-col gap-4 min-h-0 mt-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, brand, material, color…"
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults([]); }}
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
                              <img src={product.image_url} alt={product.name || 'Product'} className="w-full h-full object-cover" />
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
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{product.sku}</span>
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
                  <div className="py-4 text-center text-muted-foreground text-sm">No products found</div>
                )}
              </div>
            )}

            {/* Selected Products Table */}
            {selectedProducts.length > 0 && (
              <div className="flex-1 min-h-0 flex flex-col border rounded-lg">
                <div className="px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
                  <span className="text-sm font-medium">Selected ({selectedProducts.length})</span>
                  <Badge variant="secondary">{selectedProducts.reduce((s, p) => s + p.quantity, 0)} total</Badge>
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
                                  <img src={product.image_url} alt={product.name || 'Product'} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm truncate max-w-[120px]">{product.name || 'Unnamed'}</p>
                              {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                            </TableCell>
                            <TableCell>
                              {availableSizes.length > 0 ? (
                                <Select value={product.selectedSize || availableSizes[0]} onValueChange={(v) => handleSizeChange(product.id, v)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
                                  <SelectContent>
                                    {availableSizes.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(product.id, -1)}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-6 text-center font-medium text-sm">{product.quantity}</span>
                                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleQuantityChange(product.id, 1)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveProduct(product.id)}>
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

            {selectedProducts.length === 0 && !searchQuery && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm">Search for products above to add them to your quote</p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t pt-4 flex gap-3">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button className="flex-1 rounded-full" onClick={handleAddCatalogToQuote} disabled={selectedProducts.length === 0 || adding}>
                {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding…</> : <><Check className="h-4 w-4 mr-2" />Add {selectedProducts.length} Product{selectedProducts.length !== 1 ? 's' : ''}</>}
              </Button>
            </div>
          </TabsContent>

          {/* ── Custom Product Tab ── */}
          <TabsContent value="custom" className="flex-1 flex flex-col gap-4 min-h-0 mt-0">
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-1">
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Add a product that isn't in the catalog — a one-off item, a special order, or a service charge.
                </div>

                {/* Name + SKU */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="cp-name">Product Name <span className="text-destructive">*</span></Label>
                    <Input id="cp-name" value={customForm.name} onChange={e => setCustomField('name', e.target.value)} placeholder="e.g. Custom Marble Slab" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-sku">SKU / Code</Label>
                    <Input id="cp-sku" value={customForm.sku} onChange={e => setCustomField('sku', e.target.value)} placeholder="e.g. MRB-001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-unit">Unit</Label>
                    <Input id="cp-unit" value={customForm.unit} onChange={e => setCustomField('unit', e.target.value)} placeholder="pcs / m² / kg" />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="cp-desc">Description</Label>
                  <textarea
                    id="cp-desc"
                    value={customForm.description}
                    onChange={e => setCustomField('description', e.target.value)}
                    placeholder="Optional description or notes about this item…"
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                {/* Price + Quantity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-price">Unit Price (€)</Label>
                    <Input id="cp-price" type="number" min="0" step="0.01" value={customForm.unit_price} onChange={e => setCustomField('unit_price', e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-qty">Quantity</Label>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-full flex-shrink-0" onClick={() => setCustomField('quantity', Math.max(1, customForm.quantity - 1))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input id="cp-qty" type="number" min="1" value={customForm.quantity} onChange={e => setCustomField('quantity', parseInt(e.target.value) || 1)} className="text-center" />
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-full flex-shrink-0" onClick={() => setCustomField('quantity', customForm.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Size + Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-size">Size / Dimensions</Label>
                    <Input id="cp-size" value={customForm.size} onChange={e => setCustomField('size', e.target.value)} placeholder="e.g. 60×60 cm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-color">Color / Finish</Label>
                    <Input id="cp-color" value={customForm.color} onChange={e => setCustomField('color', e.target.value)} placeholder="e.g. Carrara White" />
                  </div>
                </div>

                {/* Preview total */}
                {customForm.unit_price && parseFloat(customForm.unit_price) > 0 && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Line Total</span>
                    <span className="font-semibold text-primary">
                      €{(parseFloat(customForm.unit_price) * customForm.quantity).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t pt-4 flex gap-3">
              <Button variant="outline" className="flex-1 rounded-full" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button className="flex-1 rounded-full" onClick={handleAddCustomToQuote} disabled={!customForm.name.trim() || adding}>
                {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding…</> : <><Check className="h-4 w-4 mr-2" />Add Custom Product</>}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default AddProductsSheet;
