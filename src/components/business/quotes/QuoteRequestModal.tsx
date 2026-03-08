import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, Package, DollarSign, Check, Loader2, GitBranch, AlertCircle, Timer } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, Upsell, QuoteUpsell } from '@/services/quotes/QuotesService';
import { ProjectTimelineModal } from './ProjectTimelineModal';

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
  const [acceptingQuote, setAcceptingQuote] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);

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

  const handleAcceptQuote = async () => {
    try {
      setAcceptingQuote(true);

      // Use the acceptQuote method which handles validation and timeline initialization
      const result = await quotesService.acceptQuote(quote.id);

      if (!result.success) {
        toast({
          title: 'Action Required',
          description: result.error || 'Please accept or reject all extras before accepting the quote',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Quote Accepted!',
        description: 'Your quote has been accepted and the project timeline has been initialized.',
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error accepting quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to accept quote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAcceptingQuote(false);
    }
  };

  // Calculate pending upsells for UI feedback
  const pendingUpsellsCount = quoteUpsells.filter(qu => qu.customer_accepted === null).length;
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
              <DialogTitle className="text-2xl">{quote.name || 'Quote Request'}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-4">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Created {formatDate(quote.created_at)}</span>
                {quote.expires_at && (
                  <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Expires {formatDate(quote.expires_at)}</span>
                )}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className={getStatusColor(quote.status)}>
              {quote.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Pending Upsells Warning */}
          {pendingUpsellsCount > 0 && quote.status !== 'accepted' && quoteUpsells.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                You have {pendingUpsellsCount} extra{pendingUpsellsCount !== 1 ? 's' : ''} pending decision.
                Please accept or reject all extras before accepting the quote.
              </AlertDescription>
            </Alert>
          )}
          {/* Summary */}
          <div className="dashboard-card rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-sm font-semibold">{quote.items?.length || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quote</p>
                <p className="text-sm font-semibold truncate">{quote.name || 'Untitled'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-semibold">{formatDate(quote.created_at)}</p>
              </div>
            </div>
            {quote.expires_at && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Timer className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-sm font-semibold">{formatDate(quote.expires_at)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="dashboard-card rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-primary mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          {/* Extras/Upsells Section */}
          {quoteUpsells.length > 0 && (
            <div className="dashboard-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-primary">
                  Additional Extras
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({quoteUpsells.length} item{quoteUpsells.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                {quote.status === 'accepted' && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                    Locked
                  </Badge>
                )}
              </div>
              {loadingUpsells ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <>
                  <div className="grid gap-3">
                    {quoteUpsells.map((quoteUpsell) => {
                      const upsell = upsells.find(u => u.id === quoteUpsell.upsell_id);
                      if (!upsell) return null;

                      const isUpdating = updatingUpsell === quoteUpsell.id;
                      const isAccepted = quoteUpsell.customer_accepted === true;
                      const isRejected = quoteUpsell.customer_accepted === false;
                      const isPending = quoteUpsell.customer_accepted === null;
                      const isLocked = quote.status === 'accepted';

                      return (
                        <div
                          key={quoteUpsell.id}
                          className={`p-4 border rounded-lg transition-all ${
                            isAccepted
                              ? 'border-green-300 bg-green-50'
                              : isRejected
                              ? 'border-red-300 bg-red-50'
                              : isPending
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <h4 className="font-medium">{upsell.name}</h4>
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
                                {isPending && !isLocked && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                                    Pending Decision
                                  </Badge>
                                )}
                              </div>
                              {upsell.description && (
                                <p className="text-sm text-muted-foreground mb-2">{upsell.description}</p>
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
                              ) : isLocked ? (
                                <span className="text-sm text-muted-foreground italic">Locked</span>
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
                        </div>
                      );
                    })}
                  </div>

                  {/* Extras Total */}
                  {quoteUpsells.some(qu => qu.customer_accepted === true) && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Accepted Extras Total:</span>
                        <span className="font-semibold text-green-600">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(
                            quoteUpsells
                              .filter(qu => qu.customer_accepted === true)
                              .reduce((sum, qu) => {
                                const upsell = upsells.find(u => u.id === qu.upsell_id);
                                return sum + (upsell?.price || 0);
                              }, 0),
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </>
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
            {quote.status === 'accepted' && (
              <Button
                onClick={() => setShowTimelineModal(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <GitBranch className="h-4 w-4 mr-2" />
                View Timeline
              </Button>
            )}
            {quote.status !== 'accepted' && quote.status !== 'rejected' && (
              <Button
                onClick={handleAcceptQuote}
                disabled={acceptingQuote}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {acceptingQuote ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Accept Quote
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Timeline Modal */}
      {showTimelineModal && (
        <ProjectTimelineModal
          quoteId={quote.id}
          quoteName={quote.name || 'Untitled Quote'}
          onClose={() => setShowTimelineModal(false)}
          isAdmin={false}
        />
      )}
    </Dialog>
  );
};

