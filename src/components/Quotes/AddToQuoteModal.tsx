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



  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add to Quote</DialogTitle>
          <DialogDescription>
            {productName || 'Select a quote to add this product'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Product Info */}
          {productImage && (
            <div className="flex items-center gap-3 bg-muted rounded-lg p-3">
              <img
                src={productImage}
                alt={productName}
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1">
                <p className="font-medium">{productName}</p>
                <p className="text-muted-foreground text-sm">ID: {productId.substring(0, 8)}...</p>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any special requirements..."
              className="mt-1"
              rows={2}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : quotes.length === 0 ? (
            /* No Quotes Available */
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground mb-2">No quotes available</p>
              <p className="text-muted-foreground text-sm mb-4">
                Create a new quote first, then add products to it
              </p>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          ) : (
            /* Select Existing Quote */
            <div className="space-y-3">
              <Label>Select Quote</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {quotes.map((quote) => (
                  <button
                    key={quote.id}
                    onClick={() => setSelectedQuoteId(quote.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedQuoteId === quote.id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-muted border-border hover:bg-muted/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                      <div className="flex-1">
                        <p className="font-medium">
                          {quote.name || `Quote #${quote.id.substring(0, 8)}`}
                        </p>
                        <p className="text-muted-foreground text-sm">{quote.total_items || 0} items</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <Button
                onClick={handleAddToExisting}
                className="w-full"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'white',
                }}
                disabled={!selectedQuoteId || processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Add to Selected Quote
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

