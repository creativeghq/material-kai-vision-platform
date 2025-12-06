import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, Package, DollarSign, Check, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, Upsell, QuoteUpsell } from '@/services/quotes/QuotesService';

interface QuoteRequestModalProps {
  quote: QuoteWithItems;
  onClose: () => void;
  onUpdate: () => void;
}

export const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  quote,
  onClose,
  onUpdate,
}) => {
  const { toast } = useToast();
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [quoteUpsells, setQuoteUpsells] = useState<QuoteUpsell[]>([]);
  const [loadingUpsells, setLoadingUpsells] = useState(false);
  const [updatingUpsell, setUpdatingUpsell] = useState<string | null>(null);

  useEffect(() => {
    loadUpsells();
    loadQuoteUpsells();
  }, [quote.id]);

  const loadUpsells = async () => {
    try {
      const data = await quotesService.getUpsells();
      setUpsells(data.filter(u => u.is_active));
    } catch (error) {
      console.error('Error loading upsells:', error);
    }
  };

  const loadQuoteUpsells = async () => {
    try {
      setLoadingUpsells(true);
      const data = await quotesService.getQuoteUpsells(quote.id);
      setQuoteUpsells(data);
    } catch (error) {
      console.error('Error loading quote upsells:', error);
    } finally {
      setLoadingUpsells(false);
    }
  };

  const handleAcceptUpsell = async (quoteUpsellId: string, accept: boolean) => {
    try {
      setUpdatingUpsell(quoteUpsellId);
      await quotesService.updateUpsellAcceptance(quoteUpsellId, accept);
      toast({
        title: 'Success',
        description: `Upsell ${accept ? 'accepted' : 'rejected'}`,
      });
      await loadQuoteUpsells();
      onUpdate();
    } catch (error) {
      console.error('Error updating upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to update upsell',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUpsell(null);
    }
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'Not estimated';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-[hsl(var(--badge-pending-bg))] text-[hsl(var(--badge-pending-text))] border-[hsl(var(--badge-pending-border))]',
      updated: 'bg-[hsl(var(--badge-updated-bg))] text-[hsl(var(--badge-updated-text))] border-[hsl(var(--badge-updated-border))]',
      approved: 'bg-[hsl(var(--badge-approved-bg))] text-[hsl(var(--badge-approved-text))] border-[hsl(var(--badge-approved-border))]',
      rejected: 'bg-[hsl(var(--badge-rejected-bg))] text-[hsl(var(--badge-rejected-text))] border-[hsl(var(--badge-rejected-border))]',
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">Quote Request Details</DialogTitle>
              <DialogDescription className="mt-1">
                Request ID: {quote.id}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={getStatusColor(quote.status)}>
              {quote.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-medium mb-3 text-gray-900">Summary</h3>

            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center bg-blue-50 rounded-lg"
                style={{
                  width: '2rem',
                  height: '2rem',
                }}
              >
                <Package className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Items</p>
                <p className="font-medium text-gray-900">{quote.items?.length || 0} items</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Quote Name</p>
                <p className="text-lg font-semibold text-gray-900">
                  {quote.name || 'Untitled Quote'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Created</p>
                <p className="font-medium text-gray-900">{formatDate(quote.created_at)}</p>
              </div>
            </div>

            {quote.updated_at !== quote.created_at && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center bg-blue-50 rounded-lg" style={{ width: '2rem', height: '2rem' }}>
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Last Updated</p>
                  <p className="font-medium text-gray-900">{formatDate(quote.updated_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-2 text-gray-900">Notes</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Extras/Upsells Section */}
          {quoteUpsells.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4 text-gray-900">
                Additional Extras
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({quoteUpsells.length} item{quoteUpsells.length !== 1 ? 's' : ''})
                </span>
              </h3>
              {loadingUpsells ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="space-y-3">
                  {quoteUpsells.map((quoteUpsell) => {
                    const upsell = upsells.find(u => u.id === quoteUpsell.upsell_id);
                    if (!upsell) return null;

                    const isUpdating = updatingUpsell === quoteUpsell.id;
                    const isAccepted = quoteUpsell.customer_accepted === true;
                    const isRejected = quoteUpsell.customer_accepted === false;

                    return (
                      <div
                        key={quoteUpsell.id}
                        className={`flex items-start justify-between p-4 border rounded-lg transition-colors ${
                          isAccepted
                            ? 'border-green-300 bg-green-50'
                            : isRejected
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-gray-400" />
                            <h4 className="font-medium text-gray-900">{upsell.name}</h4>
                            {isAccepted && (
                              <Badge className="bg-green-100 text-green-700 border-green-300">
                                Accepted
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge className="bg-red-100 text-red-700 border-red-300">
                                Rejected
                              </Badge>
                            )}
                          </div>
                          {upsell.description && (
                            <p className="text-sm text-gray-600 mb-2">{upsell.description}</p>
                          )}
                          <div className="flex items-center gap-1 text-green-600 font-semibold">
                            <DollarSign className="h-4 w-4" />
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(upsell.price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {isUpdating ? (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant={isAccepted ? 'default' : 'outline'}
                                onClick={() => handleAcceptUpsell(quoteUpsell.id, true)}
                                disabled={isAccepted}
                                className={isAccepted ? 'bg-green-600 hover:bg-green-700' : ''}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant={isRejected ? 'destructive' : 'outline'}
                                onClick={() => handleAcceptUpsell(quoteUpsell.id, false)}
                                disabled={isRejected}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

