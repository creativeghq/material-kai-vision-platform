import React, { useState, useEffect } from 'react';
import { Plus, ShoppingCart, Loader2, FileText } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Quote } from '@/services/quotes/QuotesService';

interface AddToQuoteModalProps {
  productId: string;
  productName?: string;
  productImage?: string;
  defaultQuantity?: number;
  onClose: () => void;
  onSuccess: (quoteName: string) => void;
}

export const AddToQuoteModal: React.FC<AddToQuoteModalProps> = ({
  productId,
  productName,
  productImage,
  defaultQuantity = 1,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newQuoteName, setNewQuoteName] = useState('');
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      // Get user's draft quotes
      const data = await quotesService.getQuotes({ status: 'draft' });
      setQuotes(data || []);
    } catch (error) {
      console.error('Error loading quotes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quotes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToExisting = async () => {
    if (!selectedQuoteId) {
      toast({
        title: 'Error',
        description: 'Please select a quote',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      await quotesService.addItem({
        quote_id: selectedQuoteId,
        product_id: productId,
        quantity,
        notes,
        added_from: 'manual',
      });

      const selectedQuote = quotes.find(q => q.id === selectedQuoteId);
      onSuccess(selectedQuote?.name || `Quote #${selectedQuoteId.substring(0, 8)}`);
    } catch (error) {
      console.error('Error adding to quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to add product to quote',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newQuoteName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a quote name',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      // Create new quote
      const newQuote = await quotesService.createQuote({
        name: newQuoteName,
      });

      // Add product to the new quote
      await quotesService.addItem({
        quote_id: newQuote.id,
        product_id: productId,
        quantity,
        notes,
        added_from: 'manual',
      });

      onSuccess(newQuoteName);
    } catch (error) {
      console.error('Error creating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quote',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-white/20 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add to Quote</DialogTitle>
          <DialogDescription className="text-white/60">
            {productName || 'Select a quote or create a new one'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Product Info */}
          {productImage && (
            <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
              <img
                src={productImage}
                alt={productName}
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1">
                <p className="text-white font-medium">{productName}</p>
                <p className="text-white/60 text-sm">ID: {productId.substring(0, 8)}...</p>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <Label className="text-white/80">Quantity</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="bg-white/5 border-white/20 text-white mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-white/80">Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any special requirements..."
              className="bg-white/5 border-white/20 text-white mt-1"
              rows={2}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : showCreateNew ? (
            /* Create New Quote Form */
            <div className="space-y-3">
              <div>
                <Label className="text-white/80">Quote Name</Label>
                <Input
                  value={newQuoteName}
                  onChange={(e) => setNewQuoteName(e.target.value)}
                  placeholder="e.g., Office Renovation Materials"
                  className="bg-white/5 border-white/20 text-white mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreateNew(false)}
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  disabled={processing}
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateAndAdd}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create & Add
                </Button>
              </div>
            </div>
          ) : (
            /* Select Existing Quote */
            <div className="space-y-3">
              {quotes.length > 0 ? (
                <>
                  <Label className="text-white/80">Select Quote</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {quotes.map((quote) => (
                      <button
                        key={quote.id}
                        onClick={() => setSelectedQuoteId(quote.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedQuoteId === quote.id
                            ? 'bg-purple-600/20 border-purple-500'
                            : 'bg-white/5 border-white/20 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-purple-400" />
                          <div className="flex-1">
                            <p className="text-white font-medium">
                              {quote.name || `Quote #${quote.id.substring(0, 8)}`}
                            </p>
                            <p className="text-white/60 text-sm">{quote.total_items || 0} items</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddToExisting}
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      disabled={!selectedQuoteId || processing}
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-4 w-4 mr-2" />
                      )}
                      Add to Selected
                    </Button>
                    <Button
                      onClick={() => setShowCreateNew(true)}
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <FileText className="h-12 w-12 text-white/40 mx-auto mb-3" />
                  <p className="text-white/60 mb-4">No quotes yet</p>
                  <Button
                    onClick={() => setShowCreateNew(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Quote
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

