import React, { useState, useEffect } from 'react';
import { Plus, ShoppingCart, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Quote } from '../services/QuotesService';
import { QuantityInput } from './QuantityInput';
import { LineIdentityPicker } from '@/components/business/lines/LineIdentityPicker';

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
  const [identity, setIdentity] = useState<{
    selected_attributes: Record<string, string>;
    selected_size: string | null;
    selected_color: string | null;
  }>({ selected_attributes: {}, selected_size: null, selected_color: null });
  const identityFields = {
    ...(Object.keys(identity.selected_attributes).length > 0 && { selected_attributes: identity.selected_attributes }),
    ...(identity.selected_size && { selected_size: identity.selected_size }),
    ...(identity.selected_color && { selected_color: identity.selected_color }),
  };
  // Inline quote creation
  const [showCreate, setShowCreate] = useState(false);
  const [newQuoteName, setNewQuoteName] = useState('');
  const [creating, setCreating] = useState(false);
  const [notes, setNotes] = useState('');
  // FF&E fields
  const [showFFE, setShowFFE] = useState(false);
  const [room, setRoom] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [installationRequirements, setInstallationRequirements] = useState('');

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getQuotes({ status: 'draft' });
      setQuotes(data || []);
      // Auto-expand create section when there are no existing quotes
      if (!data || data.length === 0) setShowCreate(true);
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

  const handleCreateAndAdd = async () => {
    if (!newQuoteName.trim()) return;
    setCreating(true);
    try {
      const newQuote = await quotesService.createQuote({ name: newQuoteName.trim() });
      await quotesService.addItem({
        quote_id: newQuote.id,
        product_id: productId,
        quantity,
        notes,
        added_from: '3d_generation',
        ...identityFields,
        ...(room && { room }),
        ...(dimensions && { dimensions }),
        ...(installationRequirements && { installation_requirements: installationRequirements }),
      });
      onSuccess(newQuote.name || newQuoteName.trim());
    } catch (error) {
      console.error('Error creating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quote',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
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
        ...identityFields,
        ...(room && { room }),
        ...(dimensions && { dimensions }),
        ...(installationRequirements && { installation_requirements: installationRequirements }),
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
          <DialogTitle>Add to Quote</DialogTitle>
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

          <FormSection title="Item">
            <FormField label="Quantity" htmlFor="add-to-quote-qty">
              <QuantityInput
                id="add-to-quote-qty"
                value={quantity}
                onCommit={setQuantity}
              />
            </FormField>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Variant</Label>
              <LineIdentityPicker
                productId={productId}
                value={identity.selected_attributes}
                onChange={setIdentity}
              />
            </div>

            <FormField label="Notes" htmlFor="add-to-quote-notes" optional>
              <Textarea
                id="add-to-quote-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any special requirements..."
                rows={2}
              />
            </FormField>
          </FormSection>

          {/* FF&E Specification Fields */}
          <button
            type="button"
            onClick={() => setShowFFE(!showFFE)}
            className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span>Product Specifications</span>
            {showFFE ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showFFE && (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
              <FormGrid>
                <FormField label="Room" htmlFor="add-to-quote-room" optional>
                  <Input
                    id="add-to-quote-room"
                    value={room}
                    onChange={e => setRoom(e.target.value)}
                    placeholder="e.g. Living Room"
                  />
                </FormField>
                <FormField label="Dimensions" htmlFor="add-to-quote-dims" optional>
                  <Input
                    id="add-to-quote-dims"
                    value={dimensions}
                    onChange={e => setDimensions(e.target.value)}
                    placeholder="e.g. 120×60×45"
                  />
                </FormField>
                <FormField label="Installation requirements" htmlFor="add-to-quote-install" optional className="sm:col-span-2">
                  <Textarea
                    id="add-to-quote-install"
                    value={installationRequirements}
                    onChange={e => setInstallationRequirements(e.target.value)}
                    placeholder="e.g. Requires wall anchoring, professional install"
                    rows={2}
                  />
                </FormField>
              </FormGrid>
            </div>
          )}

          <FormSection title="Quote">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Existing quotes list */}
                {quotes.length > 0 && (
                  <>
                    <Label>Select Quote</Label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
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
                              <p className="font-medium">{quote.name || `Quote #${quote.id.substring(0, 8)}`}</p>
                              <p className="text-muted-foreground text-sm">{quote.total_items || 0} items</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddToExisting}
                        style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                        disabled={!selectedQuoteId || processing}
                      >
                        {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</> : <><ShoppingCart className="h-4 w-4 mr-2" />Add to Selected Quote</>}
                      </Button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or</span></div>
                    </div>
                  </>
                )}

                {/* Create new quote section */}
                {!showCreate ? (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Create new quote
                  </button>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
                    <Label className="text-sm font-medium">New quote name</Label>
                    <Input
                      value={newQuoteName}
                      onChange={e => setNewQuoteName(e.target.value)}
                      placeholder="e.g. Living Room Renovation"
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd(); }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCreateAndAdd}
                        disabled={!newQuoteName.trim() || creating}
                        className="flex-1"
                        style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                      >
                        {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create & Add</>}
                      </Button>
                      {quotes.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </FormSection>
        </div>
      </DialogContent>
    </Dialog>
  );
};

