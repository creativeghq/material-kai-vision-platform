import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Trash2,
  Plus,
  Minus,
  Loader2,
  Package,
  Search,
  Edit,
  Clock,
  AlertCircle,
  FileText,
  X,
  Eye,
  Calendar,
  Timer,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteItemWithProduct, Product } from '@/services/quotes/QuotesService';
import { ProductDetailModal } from '@/components/Admin/PDFProcessingData/ProductDetailModal';

interface QuoteBuilderViewProps {
  quote: QuoteWithItems;
  onUpdate: () => void;
  onClose: () => void;
}

export const QuoteBuilderView: React.FC<QuoteBuilderViewProps> = ({
  quote,
  onUpdate,
  onClose,
}) => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [notes, setNotes] = useState('');
  const [customRequestText, setCustomRequestText] = useState(quote.custom_request_text || '');
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(Product & { image_url?: string })[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [quoteType, setQuoteType] = useState<'products' | 'custom'>(
    quote.custom_request_text ? 'custom' : 'products',
  );
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const items = (quote.items || []) as QuoteItemWithProduct[];

  // Helper to extract sizes/colors from product metadata
  const getProductVariants = (product: Product | undefined) => {
    if (!product?.metadata) return { sizes: [], colors: [] };

    const metadata = product.metadata;
    let sizes: string[] = [];
    let colors: string[] = [];

    // Extract sizes from dimensions or explicit size field
    if (metadata.dimensions) {
      const dims = metadata.dimensions;
      if (typeof dims === 'object' && dims.available_sizes) {
        sizes = Array.isArray(dims.available_sizes) ? dims.available_sizes : [dims.available_sizes];
      } else if (typeof dims === 'string') {
        sizes = [dims];
      }
    }
    if (metadata.size) {
      sizes = Array.isArray(metadata.size) ? metadata.size : [metadata.size];
    }
    if (metadata.sizes) {
      sizes = Array.isArray(metadata.sizes) ? metadata.sizes : [metadata.sizes];
    }

    // Extract colors from appearance or explicit color field
    if (metadata.appearance?.colors) {
      const appColors = metadata.appearance.colors;
      colors = Array.isArray(appColors) ? appColors : [appColors];
    }
    if (metadata.color) {
      colors = Array.isArray(metadata.color) ? metadata.color : [metadata.color];
    }
    if (metadata.colors) {
      colors = Array.isArray(metadata.colors) ? metadata.colors : [metadata.colors];
    }

    return { sizes, colors };
  };

  // Debounced product search - uses MIVAA API for semantic search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await quotesService.searchProductsWithImages(searchQuery, 10);
        // Filter out products already in the quote
        const existingProductIds = items.map(item => item.product_id);
        const filteredResults = results.filter(p => !existingProductIds.includes(p.id));
        setSearchResults(filteredResults);
      } catch (error) {
        console.error('Error searching products:', error);
        toast({
          title: 'Error',
          description: 'Failed to search products',
          variant: 'destructive',
        });
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, items, toast]);

  // Handle adding product to quote
  const handleAddProduct = async (product: Product) => {
    try {
      setAddingProductId(product.id);
      await quotesService.addItem(quote.id, product.id, 1, undefined, 'search');
      toast({
        title: 'Success',
        description: `${product.name || 'Product'} added to quote`,
      });
      setSearchQuery('');
      setSearchResults([]);
      onUpdate();
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        title: 'Error',
        description: 'Failed to add product to quote',
        variant: 'destructive',
      });
    } finally {
      setAddingProductId(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Remove this material from the quote?')) return;

    try {
      await quotesService.removeItem(itemId);
      toast({
        title: 'Success',
        description: 'Material removed from quote',
      });
      onUpdate();
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove material',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    try {
      await quotesService.updateItem(itemId, { quantity: newQuantity });
      toast({
        title: 'Success',
        description: 'Quantity updated',
      });
      onUpdate();
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast({
        title: 'Error',
        description: 'Failed to update quantity',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCustomRequest = async () => {
    if (!customRequestText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your custom request',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      await quotesService.updateQuote(quote.id, {
        custom_request_text: customRequestText,
      });
      toast({
        title: 'Success',
        description: 'Custom request saved',
      });
      onUpdate();
    } catch (error) {
      console.error('Error saving custom request:', error);
      toast({
        title: 'Error',
        description: 'Failed to save custom request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendRequest = async () => {
    // Validate based on quote type
    if (quoteType === 'products' && items.length === 0) {
      toast({
        title: 'Error',
        description: 'Add at least one material to send quote request',
        variant: 'destructive',
      });
      return;
    }

    if (quoteType === 'custom' && !customRequestText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your custom request',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Send this quote request? You will not be able to edit it after sending.')) {
      return;
    }

    try {
      setProcessing(true);

      // Save custom request if in custom mode
      if (quoteType === 'custom') {
        await quotesService.updateQuote(quote.id, {
          custom_request_text: customRequestText,
        });
      }

      // Submit quote (creates quote_request and updates status)
      await quotesService.submitQuote(quote.id, notes || undefined);

      toast({
        title: 'Success',
        description: 'Quote request sent successfully! You will be notified when we prepare your proposal.',
      });

      onClose();
    } catch (error) {
      console.error('Error sending quote request:', error);
      toast({
        title: 'Error',
        description: 'Failed to send quote request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const getExpirationStatus = () => {
    if (!quote.expires_at) return null;

    const now = new Date();
    const expiration = new Date(quote.expires_at);
    const daysUntilExpiration = Math.ceil(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilExpiration < 0) {
      return { status: 'expired', days: 0, color: 'text-red-400', bgColor: 'bg-red-500/10' };
    } else if (daysUntilExpiration <= 7) {
      return { status: 'expiring-soon', days: daysUntilExpiration, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' };
    } else {
      return { status: 'active', days: daysUntilExpiration, color: 'text-green-400', bgColor: 'bg-green-500/10' };
    }
  };

  const expirationStatus = getExpirationStatus();

  return (
    <div className="space-y-6">
      {/* Quote Summary */}
      <div className="dashboard-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {quote.name || `Quote #${quote.id.substring(0, 8)}`}
          </h3>
          <Badge variant="secondary" className="rounded-full capitalize">{quote.status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {quoteType === 'products'
            ? `${items.length} material${items.length !== 1 ? 's' : ''}`
            : 'Custom request'
          }
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Created {new Date(quote.created_at).toLocaleDateString()}
          </span>
          {quote.expires_at && (
            <span className={`flex items-center gap-1 ${expirationStatus?.status === 'expired' ? 'text-red-500' : expirationStatus?.status === 'expiring-soon' ? 'text-yellow-600' : ''}`}>
              <Timer className="h-3.5 w-3.5" />
              Expires {new Date(quote.expires_at).toLocaleDateString()}
              {expirationStatus && expirationStatus.status !== 'active' && (
                <span className="ml-1">
                  {expirationStatus.status === 'expired' ? '(expired)' : `(${expirationStatus.days}d left)`}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Quote Type Tabs */}
      <Tabs value={quoteType} onValueChange={(value) => setQuoteType(value as 'products' | 'custom')}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="products" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4" />
            Custom Request
          </TabsTrigger>
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="mt-4">
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Materials</h3>
              <Button
                onClick={() => setShowAddMaterial(!showAddMaterial)}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Material
              </Button>
            </div>

            {showAddMaterial && (
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search materials to add..."
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Search Results */}
                {searchLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {searchResults.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 bg-background rounded-lg border hover:border-primary transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center flex-shrink-0">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{product.name || 'Unnamed Product'}</p>
                            {product.sku && (
                              <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                            )}
                            {product.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-xs">
                                {product.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleAddProduct(product)}
                          disabled={addingProductId === product.id}
                          size="sm"
                          className="ml-2 flex-shrink-0"
                        >
                          {addingProductId === product.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No products found matching "{searchQuery}"</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm mt-2">
                    Type to search for materials from your catalog
                  </p>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-900 mb-2">No materials added yet</p>
                <p className="text-gray-600 text-sm">
                  Use the "Add to Quote" button on product pages or search above
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Image</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const { sizes, colors } = getProductVariants(item.product);
                      return (
                        <TableRow key={item.id}>
                          {/* Image Column */}
                          <TableCell>
                            <div
                              className="w-14 h-14 rounded bg-gray-100 overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-green-500 transition-all"
                              onClick={() => item.product && setSelectedProduct(item.product)}
                            >
                              {item.product?.image_url ? (
                                <img
                                  src={item.product.image_url}
                                  alt={item.product.name || 'Product'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="h-5 w-5 text-gray-400" />
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Material Name Column */}
                          <TableCell>
                            <div className="space-y-1">
                              <button
                                onClick={() => item.product && setSelectedProduct(item.product)}
                                className="font-medium text-gray-900 hover:text-green-600 hover:underline text-left"
                              >
                                {item.product?.name || 'Unknown Material'}
                              </button>
                              {item.product?.sku && (
                                <div className="text-xs text-gray-600">SKU: {item.product.sku}</div>
                              )}
                            </div>
                          </TableCell>

                          {/* Size Selector */}
                          <TableCell>
                            {sizes.length > 0 ? (
                              <Select
                                value={item.selected_size || ''}
                                onValueChange={(value) =>
                                  quotesService.updateItem(item.id, { selected_size: value }).then(onUpdate)
                                }
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {sizes.map((size) => (
                                    <SelectItem key={size} value={size}>
                                      {size}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </TableCell>

                          {/* Color Selector */}
                          <TableCell>
                            {colors.length > 0 ? (
                              <Select
                                value={item.selected_color || ''}
                                onValueChange={(value) =>
                                  quotesService.updateItem(item.id, { selected_color: value }).then(onUpdate)
                                }
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {colors.map((color) => (
                                    <SelectItem key={color} value={color}>
                                      {color}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </TableCell>

                          {/* Quantity with +/- Buttons */}
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                                disabled={item.quantity <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                                className="w-14 text-center h-8"
                              />
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                onClick={() => item.product && setSelectedProduct(item.product)}
                                variant="ghost"
                                size="sm"
                                className="text-gray-600 hover:text-gray-900"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={() => handleRemoveItem(item.id)}
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Custom Request Tab */}
        <TabsContent value="custom" className="mt-4">
          <div className="dashboard-card">
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Custom Request</h3>
              <p className="text-muted-foreground text-sm">
                Describe the materials you need and we'll help you find the perfect match
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Request Details *</Label>
                <Textarea
                  value={customRequestText}
                  onChange={(e) => setCustomRequestText(e.target.value)}
                  placeholder="Describe the materials you're looking for, including specifications, quantities, and any special requirements..."
                  className="mt-1"
                  rows={10}
                />
                <p className="text-muted-foreground text-xs mt-1">
                  Be as detailed as possible to help us provide accurate recommendations
                </p>
              </div>

              <Button
                onClick={handleSaveCustomRequest}
                disabled={processing || !customRequestText.trim()}
                variant="outline"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Custom Request'
                )}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Notes */}
      <div className="dashboard-card">
        <Label className="mb-2 block">Additional Notes (Optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any special requirements, delivery instructions, or questions..."
          rows={4}
        />
      </div>

      {/* Send Request Button */}
      <div className="sticky bottom-0 bg-background pt-4" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}>
        <Button
          onClick={handleSendRequest}
          disabled={processing || (quoteType === 'products' && items.length === 0) || (quoteType === 'custom' && !customRequestText.trim())}
          className="w-full py-6 text-lg"
          style={{
            backgroundColor: 'hsl(var(--primary))',
            color: 'white',
          }}
        >
          {processing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Sending Request...
            </>
          ) : (
            <>
              <Send className="h-5 w-5 mr-2" />
              Send Quote Request
              {quoteType === 'products' && ` (${items.length} material${items.length !== 1 ? 's' : ''})`}
            </>
          )}
        </Button>
        <p className="text-muted-foreground text-sm text-center mt-2">
          We'll review your request and send you a detailed proposal with pricing
        </p>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
};

