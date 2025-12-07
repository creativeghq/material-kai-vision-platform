import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Trash2,
  Plus,
  Loader2,
  Package,
  Search,
  Edit,
  Clock,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteItemWithProduct, Product } from '@/services/quotes/QuotesService';

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
    quote.custom_request_text ? 'custom' : 'products'
  );

  const items = (quote.items || []) as QuoteItemWithProduct[];

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
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
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
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium flex items-center gap-2 text-gray-900">
            <div className="bg-blue-50 rounded-lg flex items-center justify-center" style={{ width: '2rem', height: '2rem' }}>
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            {quote.name || `Quote #${quote.id.substring(0, 8)}`}
          </h3>
          <Badge variant="secondary">
            {quote.status}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="text-gray-600 text-sm">
            {quoteType === 'products'
              ? `${items.length} material${items.length !== 1 ? 's' : ''}`
              : 'Custom request'
            }
          </div>
          <div className="text-muted-foreground text-sm">
            Created: {new Date(quote.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          {/* Expiration Status */}
          {expirationStatus && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${expirationStatus.bgColor}`}>
              {expirationStatus.status === 'expired' ? (
                <>
                  <AlertCircle className={`h-4 w-4 ${expirationStatus.color}`} />
                  <span className={expirationStatus.color}>This quote has expired</span>
                </>
              ) : expirationStatus.status === 'expiring-soon' ? (
                <>
                  <Clock className={`h-4 w-4 ${expirationStatus.color}`} />
                  <span className={expirationStatus.color}>
                    Expires in {expirationStatus.days} day{expirationStatus.days !== 1 ? 's' : ''}
                  </span>
                </>
              ) : (
                <>
                  <Clock className={`h-4 w-4 ${expirationStatus.color}`} />
                  <span className={expirationStatus.color}>
                    Expires in {expirationStatus.days} days
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quote Type Tabs */}
      <Tabs value={quoteType} onValueChange={(value) => setQuoteType(value as 'products' | 'custom')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products
          </TabsTrigger>
          <TabsTrigger value="custom">
            <FileText className="h-4 w-4 mr-2" />
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
                      <TableHead>Material</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-gray-900">
                              {item.product?.name || 'Unknown Material'}
                            </div>
                            {item.product?.sku && (
                              <div className="text-xs text-gray-600">SKU: {item.product.sku}</div>
                            )}
                            {item.added_from && (
                              <Badge variant="outline" className="text-xs">
                                Added from: {item.added_from}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                            className="w-20 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-gray-600 text-sm max-w-xs">
                          <div className="truncate">{item.notes || '-'}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleRemoveItem(item.id)}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
            color: 'white'
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
    </div>
  );
};

