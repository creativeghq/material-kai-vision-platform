import React, { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteItemWithProduct } from '@/services/quotes/QuotesService';

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
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const items = (quote.items || []) as QuoteItemWithProduct[];

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

  const handleSendRequest = async () => {
    if (items.length === 0) {
      toast({
        title: 'Error',
        description: 'Add at least one material to send quote request',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Send this quote request? You will not be able to edit it after sending.')) {
      return;
    }

    try {
      setProcessing(true);

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
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-400" />
            {quote.name || `Quote #${quote.id.substring(0, 8)}`}
          </h3>
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300">
            {quote.status}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="text-white/60 text-sm">
            {items.length} material{items.length !== 1 ? 's' : ''}
          </div>
          <div className="text-white/60 text-sm">
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

      {/* Materials List */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Materials</h3>
          <Button
            onClick={() => setShowAddMaterial(!showAddMaterial)}
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Material
          </Button>
        </div>

        {showAddMaterial && (
          <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials to add..."
                className="pl-10 bg-white/5 border-white/20 text-white"
              />
            </div>
            <p className="text-white/40 text-sm mt-2">
              Search for materials from your catalog or use the "Add to Quote" button on product pages
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 text-white/40 mx-auto mb-3" />
            <p className="text-white/60 mb-2">No materials added yet</p>
            <p className="text-white/40 text-sm">
              Use the "Add to Quote" button on product pages or search above
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/80">Material</TableHead>
                  <TableHead className="text-white/80 text-center">Quantity</TableHead>
                  <TableHead className="text-white/80">Notes</TableHead>
                  <TableHead className="text-white/80 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="border-white/10">
                    <TableCell className="text-white/80">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {item.product?.name || 'Unknown Material'}
                        </div>
                        {item.product?.sku && (
                          <div className="text-xs text-white/40">SKU: {item.product.sku}</div>
                        )}
                        {item.added_from && (
                          <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                            Added from: {item.added_from}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-white/80 text-center">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                        className="w-20 bg-white/5 border-white/20 text-white text-center"
                      />
                    </TableCell>
                    <TableCell className="text-white/60 text-sm max-w-xs">
                      <div className="truncate">{item.notes || '-'}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleRemoveItem(item.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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

      {/* Notes */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <Label className="text-white/80 mb-2 block">Additional Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any special requirements, delivery instructions, or questions..."
          className="bg-white/5 border-white/20 text-white"
          rows={4}
        />
      </div>

      {/* Send Request Button */}
      <div className="sticky bottom-0 bg-gray-900 pt-4 border-t border-white/10">
        <Button
          onClick={handleSendRequest}
          disabled={processing || items.length === 0}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 text-lg"
        >
          {processing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Sending Request...
            </>
          ) : (
            <>
              <Send className="h-5 w-5 mr-2" />
              Send Quote Request ({items.length} material{items.length !== 1 ? 's' : ''})
            </>
          )}
        </Button>
        <p className="text-white/40 text-sm text-center mt-2">
          We'll review your request and send you a detailed proposal with pricing
        </p>
      </div>
    </div>
  );
};

