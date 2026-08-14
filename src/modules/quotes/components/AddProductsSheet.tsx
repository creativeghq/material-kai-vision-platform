/**
 * AddProductsSheet Component
 * Slide-out sheet for searching and adding products to a quote.
 * Supports both catalog product search and custom (ad-hoc) product entry.
 */

import { LineIdentityPicker } from '@/components/business/lines/LineIdentityPicker';
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
  DollarSign,
  ImagePlus,
} from 'lucide-react';
import { PriceLookupDrawer } from '@/components/features/pricing/PriceLookupDrawer';
import { supabase } from '@/integrations/supabase/client';

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
import { parseDecimal, parseDecimalOr } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { servicesService, type ServiceItem } from '@/modules/finance/services/servicesService';
import { ordersService } from '@/modules/finance/services/ordersService';
import { quotesService } from '../services/QuotesService';
import {
  getAvailableSizes,
  getAvailableColors,
  getManufacturer,
  getCollection,
  getProductName,
  getProductImageUrl,
} from '@/utils/productMetadata';

interface ProductWithImage {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  metadata?: Record<string, any>;
  image_url?: string;
}

interface SelectedProduct extends ProductWithImage {
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
  /**
   * Every identity field the registry offers for this product, not just size and colour
   * (#347 phase 5.2). size/colour remain as the two projected columns the documents render;
   * this is the whole answer, and it is what reaches `quote_items.selected_attributes`.
   */
  selectedAttributes?: Record<string, string>;
  room?: string;
  dimensions?: string;
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
  room: string;
  dimensions: string;
  installation_requirements: string;
  image_url: string;
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
  room: '',
  dimensions: '',
  installation_requirements: '',
  image_url: '',
};

interface AddProductsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  existingProductIds: string[];
  onProductsAdded: () => void;
  /** B2B customer of the parent quote — passed through to PriceLookupDrawer. */
  customerCompanyId?: string | null;
  /** B2C / private customer of the parent quote — passed through to PriceLookupDrawer. */
  customerContactId?: string | null;
}

export const AddProductsSheet: React.FC<AddProductsSheetProps> = ({
  open,
  onOpenChange,
  quoteId,
  existingProductIds,
  onProductsAdded,
  customerCompanyId,
  customerContactId,
}) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  // Sellable services (item_type='service') for the quick-add picker.
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [addingService, setAddingService] = useState(false);
  useEffect(() => {
    if (!open || !activeWorkspaceId) return;
    servicesService.list(activeWorkspaceId).then(setServices).catch(() => setServices([]));
  }, [open, activeWorkspaceId]);

  const addServiceToQuote = async (serviceId: string) => {
    setAddingService(true);
    try {
      await quotesService.addItem({ quote_id: quoteId, product_id: serviceId, quantity: 1, added_from: 'manual' });
      toast({ title: 'Service added' });
      onProductsAdded();
    } catch (err: any) {
      toast({ title: 'Failed to add service', description: err?.message, variant: 'destructive' });
    } finally { setAddingService(false); }
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithImage[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // On-hand per product for the search results (only products that are warehoused appear).
  const [availStock, setAvailStock] = useState<Map<string, number>>(new Map());

  // Selected catalog products
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);

  // Custom product form
  const [customForm, setCustomForm] = useState<CustomProductForm>(EMPTY_CUSTOM);

  // Price lookup drawer (admin) — used to fetch a price for the custom product form
  const [customPriceLookupOpen, setCustomPriceLookupOpen] = useState(false);

  const [adding, setAdding] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
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

  // Warehouse on-hand for the current results, so we can flag low/out-of-stock before adding.
  useEffect(() => {
    if (!activeWorkspaceId || searchResults.length === 0) { setAvailStock(new Map()); return; }
    let cancelled = false;
    void ordersService.getAvailableStock(searchResults.map((p) => p.id), activeWorkspaceId)
      .then((m) => { if (!cancelled) setAvailStock(m); })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [searchResults, activeWorkspaceId]);

  // Add catalog product to selection
  const handleSelectProduct = useCallback((product: ProductWithImage) => {
    const sizes = getAvailableSizes(product.metadata);
    const colors = getAvailableColors(product.metadata);
    setSelectedProducts(prev => [...prev, {
      ...product,
      quantity: 1,
      selectedSize: sizes.length > 0 ? sizes[0] : undefined,
      selectedColor: colors.length > 0 ? colors[0] : undefined,
    }]);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  /**
   * The picker hands back the full map and both projected columns together — they are derived
   * from one another, so writing them in one update is what stops a line labelled 600x600 whose
   * attributes say 300x300.
   */
  const handleIdentityChange = useCallback((productId: string, next: {
    selected_attributes: Record<string, string>; selected_size: string | null; selected_color: string | null;
  }) => {
    setSelectedProducts(prev => prev.map(p => p.id === productId ? {
      ...p,
      selectedAttributes: next.selected_attributes,
      selectedSize: next.selected_size ?? undefined,
      selectedColor: next.selected_color ?? undefined,
    } : p));
  }, []);

  const handleQuantityChange = useCallback((productId: string, delta: number) => {
    setSelectedProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p),
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
        const variantBits = [product.selectedSize && `Size: ${product.selectedSize}`, product.selectedColor && `Colour: ${product.selectedColor}`].filter(Boolean);
        await quotesService.addItem({
          quote_id: quoteId,
          product_id: product.id,
          quantity: product.quantity,
          added_from: 'manual',
          notes: variantBits.length ? variantBits.join(' · ') : undefined,
          selected_size: product.selectedSize || undefined,
          selected_color: product.selectedColor || undefined,
          // The registry's own field names, not a re-keyed {size, color} pair. Re-keying was a
          // translation, and a translation is where a fifth vocabulary for "which one" comes
          // from — `available_sizes` and `finish` are what the registry calls these, and what
          // the warehouse will match on in phase 6.
          selected_attributes: product.selectedAttributes ?? {},
          room: product.room || undefined,
          dimensions: product.dimensions || undefined,
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
  const handleCustomImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Not an image', description: 'Please choose an image file.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 10 MB.', variant: 'destructive' });
      return;
    }
    try {
      setUploadingImage(true);
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `quote-custom/${quoteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('generation-images')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error('Could not resolve the uploaded image URL.');
      setCustomField('image_url', pub.publicUrl);
    } catch (err) {
      console.error('Custom image upload failed:', err);
      toast({ title: 'Upload failed', description: 'The image could not be uploaded. Please try again.', variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddCustomToQuote = async () => {
    if (!customForm.name.trim()) {
      toast({ title: 'Name required', description: 'Please enter a product name.', variant: 'destructive' });
      return;
    }
    try {
      setAdding(true);
      const unitPrice = customForm.unit_price ? parseDecimal(customForm.unit_price) ?? undefined : undefined;
      await quotesService.addCustomItem({
        quote_id: quoteId,
        custom_product_name: customForm.name.trim(),
        custom_product_description: customForm.description.trim() || undefined,
        custom_sku: customForm.sku.trim() || undefined,
        custom_unit: customForm.unit.trim() || 'pcs',
        custom_image_url: customForm.image_url || undefined,
        unit_price: unitPrice,
        quantity: customForm.quantity,
        selected_size: customForm.size.trim() || undefined,
        selected_color: customForm.color.trim() || undefined,
        room: customForm.room.trim() || undefined,
        dimensions: customForm.dimensions.trim() || undefined,
        installation_requirements: customForm.installation_requirements.trim() || undefined,
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
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Catalog Search
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Custom Product
            </TabsTrigger>
          </TabsList>

          {/* ── Catalog Search Tab ── */}
          <TabsContent value="search" className="flex-1 flex flex-col gap-4 min-h-0 mt-0">
            {/* Quick-add a service */}
            {services.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value="" onValueChange={addServiceToQuote} disabled={addingService}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="+ Add a service…" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.list_price != null ? ` — ${s.list_price} ${s.currency}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                      const manufacturer = getManufacturer(metadata);
                      const collection = getCollection(metadata);
                      const availableSizes = getAvailableSizes(metadata);
                      const displayName = getProductName(product);
                      const imageUrl = getProductImageUrl(product);
                      return (
                        <button
                          key={product.id}
                          onClick={() => handleSelectProduct(product)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                        >
                          <div className="w-14 h-14 rounded bg-muted flex-shrink-0 overflow-hidden">
                            {imageUrl ? (
                              <img src={imageUrl} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{displayName}</p>
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
                              {/* On-hand flag — only for warehoused products. */}
                              {availStock.has(product.id) && (
                                (availStock.get(product.id) ?? 0) > 0
                                  ? <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded">{availStock.get(product.id)} in stock</span>
                                  : <span className="text-xs text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">Out of stock</span>
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
                        <TableHead className="w-28">Room</TableHead>
                        <TableHead className="w-36">Size</TableHead>
                        <TableHead className="w-28 text-center">Qty</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((product) => {
                        return (
                          <TableRow key={product.id}>
                            <TableCell>
                              <div className="w-12 h-12 rounded bg-muted overflow-hidden">
                                {(() => {
                                  const imgUrl = getProductImageUrl(product);
                                  return imgUrl ? (
                                    <img src={imgUrl} alt={getProductName(product)} className="w-full h-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm truncate max-w-[120px]">{getProductName(product)}</p>
                              {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={product.room || ''}
                                onChange={e => setSelectedProducts(prev => prev.map(p => p.id === product.id ? { ...p, room: e.target.value } : p))}
                                placeholder="Room"
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              {/* #347 phase 5.2 — the same picker the order line uses. It used to
                                  be a hardcoded size select plus a colour select, which is why a
                                  quote could never record a finish, a wood type or a bowl shape:
                                  the registry has 22 identity fields for tiles alone. The
                                  resolver withholds any field the product can only be one of, so
                                  this shows the real choices and nothing else. */}
                              <LineIdentityPicker
                                productId={product.id}
                                value={product.selectedAttributes ?? {}}
                                onChange={(next) => handleIdentityChange(product.id, next)}
                              />
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

                {/* Image */}
                <div className="space-y-1.5">
                  <Label>Image</Label>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-lg border border-border/60 bg-muted/30 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {customForm.image_url ? (
                        <img src={customForm.image_url} alt="Custom product" className="w-full h-full object-cover" />
                      ) : (
                        <ImagePlus className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="cp-image" className="cursor-pointer">
                        <div className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors">
                          {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                          {uploadingImage ? 'Uploading…' : customForm.image_url ? 'Replace image' : 'Upload image'}
                        </div>
                        <input id="cp-image" type="file" accept="image/*" className="hidden" onChange={handleCustomImageUpload} disabled={uploadingImage} />
                      </label>
                      {customForm.image_url && (
                        <button
                          type="button"
                          onClick={() => setCustomField('image_url', '')}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors text-left"
                        >
                          Remove image
                        </button>
                      )}
                    </div>
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
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="cp-price">Unit Price (€)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setCustomPriceLookupOpen(true)}
                        disabled={!customForm.name.trim()}
                        title={!customForm.name.trim() ? 'Enter a name first' : 'Get price from Knowledge Base'}
                      >
                        <DollarSign className="h-3 w-3 mr-0.5" />
                        Get price
                      </Button>
                    </div>
                    <Input id="cp-price" type="text" inputMode="decimal" value={customForm.unit_price} onChange={e => setCustomField('unit_price', e.target.value)} placeholder="0.00" />
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
                    <Label htmlFor="cp-size">Size / Variant</Label>
                    <Input id="cp-size" value={customForm.size} onChange={e => setCustomField('size', e.target.value)} placeholder="e.g. 60×60 cm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-color">Color / Finish</Label>
                    <Input id="cp-color" value={customForm.color} onChange={e => setCustomField('color', e.target.value)} placeholder="e.g. Carrara White" />
                  </div>
                </div>

                {/* FF&E Fields */}
                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">FF&E Specification</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-room">Room / Area</Label>
                      <Input id="cp-room" value={customForm.room} onChange={e => setCustomField('room', e.target.value)} placeholder="e.g. Living Room" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cp-dims">Dimensions (W×H×D)</Label>
                      <Input id="cp-dims" value={customForm.dimensions} onChange={e => setCustomField('dimensions', e.target.value)} placeholder="e.g. 120×60×45" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cp-install">Installation Requirements</Label>
                    <textarea
                      id="cp-install"
                      value={customForm.installation_requirements}
                      onChange={e => setCustomField('installation_requirements', e.target.value)}
                      placeholder="e.g. Requires wall anchoring, electrical outlet within 1m..."
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                </div>

                {/* Preview total */}
                {customForm.unit_price && parseDecimalOr(customForm.unit_price, 0) > 0 && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Line Total</span>
                    <span className="font-semibold text-primary">
                      €{(parseDecimalOr(customForm.unit_price, 0) * customForm.quantity).toFixed(2)}
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

      <PriceLookupDrawer
        open={customPriceLookupOpen}
        onOpenChange={setCustomPriceLookupOpen}
        productName={customForm.name.trim() || 'Custom product'}
        sku={customForm.sku.trim() || undefined}
        quantity={customForm.quantity}
        unit={customForm.unit || undefined}
        customerCompanyId={customerCompanyId}
        customerContactId={customerContactId}
        onConfirm={async (payload) => {
          setCustomForm((prev) => ({
            ...prev,
            unit_price: String(payload.unit_price),
          }));
          setCustomPriceLookupOpen(false);
        }}
      />
    </Sheet>
  );
};

export default AddProductsSheet;
