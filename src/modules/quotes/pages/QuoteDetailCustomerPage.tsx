import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2, CheckCircle, XCircle, FileText, DollarSign, Gift, AlertCircle, Check, X, ShoppingCart, Tag, Boxes, Milestone, RotateCcw, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Card, CardContent } from '@/components/core/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/core/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteUpsell, QuoteTimeline } from '../services/QuotesService';
import { AddProductsSheet } from '../components/AddProductsSheet';
import { QuoteItemsList } from '../components/QuoteItemsList';
import { QuoteApprovalsCard } from '../components/QuoteApprovalsCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { QuoteStatusBadge } from '@/lib/quoteStatus';
import { QuoteDownloadButtons } from '../components/QuoteDownloadButtons';
import { QuoteShareButton } from '../components/QuoteShareButton';
import { QuoteEmailButton } from '../components/QuoteEmailButton';
import { useQuoteDocument } from '../hooks/useQuoteDocument';
import { trackQuoteView } from '@/services/quoteAnalyticsService';

/**
 * Customer-facing Quote Detail Page
 * Full page with tabs for Overview, Items, Extras, Timeline
 */
export const QuoteDetailCustomerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteWithItems | null>(null);
  const [quoteUpsells, setQuoteUpsells] = useState<QuoteUpsell[]>([]);
  const [quoteTimeline, setQuoteTimeline] = useState<QuoteTimeline[]>([]);
  const [updatingUpsell, setUpdatingUpsell] = useState<string | null>(null);
  const [acceptingQuote, setAcceptingQuote] = useState(false);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [openInvoice, setOpenInvoice] = useState<{ id: string; internal_number: string; amount_due: number; currency: string; status: string } | null>(null);
  const [payingNow, setPayingNow] = useState(false);

  const { data: docData } = useQuoteDocument(id || '');

  useEffect(() => {
    if (id) {
      loadQuoteDetails();
      trackQuoteView(id, 'customer');
    }
  }, [id]);

  const loadQuoteDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [quoteData, upsells, timeline] = await Promise.all([
        quotesService.getQuote(id),
        quotesService.getQuoteUpsells(id),
        quotesService.getQuoteTimeline(id),
      ]);
      setQuote(quoteData);
      setQuoteUpsells(upsells);
      setQuoteTimeline(timeline);

      // Look up an open invoice for this quote so we can render the Pay-now action.
      if (quoteData?.status === 'accepted') {
        const { data: inv } = await supabase
          .from('invoices')
          .select('id, internal_number, amount_due, currency, status')
          .eq('quote_id', id)
          .in('status', ['issued', 'partially_paid', 'overdue'])
          .order('issued_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (inv && Number((inv as any).amount_due) > 0) {
          setOpenInvoice(inv as any);
        }
      }
    } catch (error) {
      console.error('Error loading quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle upsell accept/reject
  const handleUpsellDecision = async (quoteUpsellId: string, accepted: boolean) => {
    try {
      setUpdatingUpsell(quoteUpsellId);
      await quotesService.updateUpsellAcceptance(quoteUpsellId, accepted);
      toast({
        title: 'Success',
        description: `Extra ${accepted ? 'accepted' : 'rejected'}`,
      });
      // Reload to get updated extras_total
      await loadQuoteDetails();
    } catch (error) {
      console.error('Error updating upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to update extra',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUpsell(null);
    }
  };

  // Handle reset upsell decision
  const handleResetUpsellDecision = async (quoteUpsellId: string) => {
    try {
      setUpdatingUpsell(quoteUpsellId);
      await quotesService.resetUpsellDecision(quoteUpsellId);
      toast({
        title: 'Decision Reset',
        description: 'You can now reconsider this extra',
      });
      await loadQuoteDetails();
    } catch (error) {
      console.error('Error resetting upsell decision:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset decision',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUpsell(null);
    }
  };

  // Handle quote submission (finalize draft → submitted)
  const handleSubmitQuote = async () => {
    if (!id) return;
    try {
      setSubmittingQuote(true);
      await quotesService.submitQuote(id, quote?.notes || undefined);
      toast({
        title: 'Quote Submitted!',
        description: 'Your quote has been submitted for review. We will prepare a proposal for you.',
      });
      await loadQuoteDetails();
    } catch (error) {
      console.error('Error submitting quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit quote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingQuote(false);
    }
  };

  // Handle quote acceptance
  const handleAcceptQuote = async () => {
    if (!id) return;
    try {
      setAcceptingQuote(true);
      const result = await quotesService.acceptQuote(id);

      if (!result.success) {
        toast({
          title: 'Action Required',
          description: result.error || 'Please decide on all extras before accepting the quote',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Quote Accepted!',
        description: 'Your quote has been accepted and the project timeline has been initialized.',
      });
      await loadQuoteDetails();
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


  const getTimelineStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-blue-500" />;
      case 'skipped': return <XCircle className="h-5 w-5 text-gray-400" />;
      default: return <Clock className="h-5 w-5 text-gray-300" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen p-3 sm:p-6">
        <Button variant="ghost" onClick={() => navigate('/quotes')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to quotes
        </Button>
        <Card className="text-center py-12">
          <CardContent>
            <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Quote Not Found</h3>
            <p className="text-muted-foreground">The requested quote could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const itemCount = quote.items?.length || quote.total_items || 0;

  // Calculate extras total from accepted upsells (using custom price × quantity if available)
  const acceptedExtrasTotal = quoteUpsells.reduce((sum, qu) => {
    if (qu.customer_accepted !== true) return sum;
    const price = qu.metadata?.custom_price ?? qu.upsell?.price ?? 0;
    const quantity = qu.metadata?.quantity ?? 1;
    return sum + (price * quantity);
  }, 0);

  // Use stored extras_total from quote if available, otherwise calculate
  const extrasTotal = quote.extras_total ?? acceptedExtrasTotal;

  // Check for pending upsells (not yet decided)
  const pendingUpsells = quoteUpsells.filter(u => u.customer_accepted === null || u.customer_accepted === undefined);
  const hasUpsells = quoteUpsells.length > 0;
  const allUpsellsDecided = pendingUpsells.length === 0;
  const canAcceptQuote = quote.status === 'quoted' && (!hasUpsells || allUpsellsDecided);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={ShoppingCart}
        title={quote.name || 'Untitled Quote'}
        subtitle={`Created ${new Date(quote.created_at).toLocaleDateString()} · Expires ${new Date(quote.expires_at).toLocaleDateString()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <QuoteStatusBadge status={quote.status} />
            {quote.status === 'draft' && (
              <Button
                onClick={handleSubmitQuote}
                disabled={submittingQuote || (quote.items?.length || 0) === 0}
                variant="outline" size="sm"
              >
                {submittingQuote ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Submit Quote Request
              </Button>
            )}
            {quote.status === 'quoted' && (
              <Button
                onClick={handleAcceptQuote}
                disabled={!canAcceptQuote || acceptingQuote}
                className="rounded-full bg-green-500/80 hover:bg-green-500 text-white border border-green-400/30"
              >
                {acceptingQuote ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Accept Quote
              </Button>
            )}
            {openInvoice && (
              <Button
                onClick={async () => {
                  try {
                    setPayingNow(true);
                    const successUrl = `${window.location.origin}/quotes/${quote.id}?payment=success`;
                    const cancelUrl = `${window.location.origin}/quotes/${quote.id}?payment=cancelled`;
                    const res = await financeService.payInvoiceAsCustomer(openInvoice.id, { successUrl, cancelUrl });
                    if (res.checkout_url) {
                      window.location.href = res.checkout_url;
                    } else if (res.error) {
                      toast({ title: 'Cannot pay', description: res.error, variant: 'destructive' });
                    }
                  } catch (err: any) {
                    toast({ title: 'Failed', description: err?.message ?? 'Error', variant: 'destructive' });
                  } finally {
                    setPayingNow(false);
                  }
                }}
                disabled={payingNow}
                className="rounded-full bg-primary hover:bg-primary/90"
              >
                {payingNow ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Pay {formatMoney(openInvoice.amount_due, openInvoice.currency)} by card
              </Button>
            )}
            {/* Preview & PDF download — available whenever the quote has items */}
            {(quote.items?.length || quote.total_items || 0) > 0 && (
              <>
                <QuoteShareButton
                  quoteId={quote.id}
                  enabled={quote.public_share_enabled ?? false}
                  token={quote.public_share_token ?? null}
                  onChange={loadQuoteDetails}
                />
                <QuoteEmailButton quoteId={quote.id} onSent={loadQuoteDetails} />
                <QuoteDownloadButtons
                  quoteId={quote.id}
                  quoteNumber={quote.quote_number}
                  data={docData}
                  viewContext="customer"
                />
              </>
            )}
          </div>
        }
      />

      {/* Stats Row */}
      <div className="border-b">
        <div className="page-container py-4">
          {/* Pending Upsells Warning */}
          {quote.status === 'quoted' && hasUpsells && !allUpsellsDecided && (
            <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 mb-4">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-800">Action Required</AlertTitle>
              <AlertDescription className="text-yellow-700">
                Please accept or reject all {pendingUpsells.length} pending extra(s) before you can accept this quote.
                Go to the <strong>Extras</strong> tab to review them.
              </AlertDescription>
            </Alert>
          )}

          {/* Quote Information Grid - compact stats with proper card styling */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  }}
                >
                  <Tag className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <QuoteStatusBadge status={quote.status} />
                </div>
              </div>
            </div>
            <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  }}
                >
                  <Boxes className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Items</p>
                  <p className="text-lg font-semibold">{itemCount}</p>
                </div>
              </div>
            </div>
            <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  }}
                >
                  <Gift className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Extras</p>
                  <p className="text-lg font-semibold">
                    {quoteUpsells.length}
                    {pendingUpsells.length > 0 && (
                      <span className="text-xs text-yellow-600 ml-1">({pendingUpsells.length} pending)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                  }}
                >
                  <DollarSign className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Extras Total</p>
                  <p className="text-lg font-semibold">€{(quote.extras_total || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Request (if exists) */}
          {quote.custom_request_text && (
            <div className="mt-4 dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium">Custom Request</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {quote.custom_request_text}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container py-6">
        {/* E-sign audit trail (self-hides when the quote has no approvals) */}
        <QuoteApprovalsCard quoteId={quote.id} />
        {/* Tabs */}
        <Tabs defaultValue="items" className="w-full mt-2">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="items" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Items ({itemCount})
            </TabsTrigger>
            <TabsTrigger value="extras" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Extras ({quoteUpsells.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <Milestone className="h-4 w-4" />
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-5">
            <QuoteItemsList
              items={quote.items || []}
              showAddButton={quote.status === 'draft'}
              onAddProducts={() => setShowAddProducts(true)}
              onUpdateQuantity={quote.status === 'draft' ? async (itemId, quantity) => {
                try {
                  await quotesService.updateItem(itemId, { quantity });
                  await loadQuoteDetails();
                } catch (error) {
                  console.error('Error updating item:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update item quantity',
                    variant: 'destructive',
                  });
                }
              } : undefined}
              onUpdateItem={quote.status === 'draft' ? async (itemId, data) => {
                try {
                  await quotesService.updateItem(itemId, data);
                  await loadQuoteDetails();
                } catch (error) {
                  console.error('Error updating item:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to update item',
                    variant: 'destructive',
                  });
                }
              } : undefined}
              onRemoveItem={async (itemId) => {
                try {
                  await quotesService.removeItem(itemId);
                  await loadQuoteDetails();
                  toast({
                    title: 'Item Removed',
                    description: 'Product removed from quote',
                  });
                } catch (error) {
                  console.error('Error removing item:', error);
                  toast({
                    title: 'Error',
                    description: 'Failed to remove item from quote',
                    variant: 'destructive',
                  });
                }
              }}
              editable={quote.status === 'draft'}
              editPricing={false}
              showPricing={quote.status === 'quoted' || quote.status === 'accepted'}
            />
          </TabsContent>

          <TabsContent value="extras" className="mt-5">
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Gift className="h-4 w-4" /> Extras & Add-ons
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Review and accept or reject additional services. Accepted extras will be added to your total.</p>
              </div>
              <div>
                {quoteUpsells.length > 0 ? (
                  <div className="space-y-4">
                    {quoteUpsells.map((qu) => {
                      const price = qu.metadata?.custom_price ?? qu.upsell?.price ?? 0;
                      const quantity = qu.metadata?.quantity ?? 1;
                      const measurement = qu.metadata?.measurement || '';
                      const totalPrice = price * quantity;
                      const isDecided = qu.customer_accepted !== null && qu.customer_accepted !== undefined;
                      const isUpdating = updatingUpsell === qu.id;

                      return (
                        <div
                          key={qu.id}
                          className={`p-4 border rounded-lg ${
                            qu.customer_accepted === true
                              ? 'border-green-300 bg-green-50'
                              : qu.customer_accepted === false
                              ? 'border-red-300 bg-red-50'
                              : 'border-yellow-300 bg-yellow-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Gift className="h-4 w-4 text-muted-foreground" />
                                <p className="font-medium">{qu.upsell?.name || 'Unknown Extra'}</p>
                                {isDecided && (
                                  <span className={`text-xs ${qu.customer_accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {qu.customer_accepted ? 'Accepted' : 'Rejected'}
                                  </span>
                                )}
                                {!isDecided && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400">Pending Decision</span>
                                )}
                              </div>
                              {qu.upsell?.description && (
                                <p className="text-sm text-muted-foreground mt-1 ml-6">{qu.upsell.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 ml-6 text-sm">
                                <span className="font-semibold text-green-700">€{price.toFixed(2)}</span>
                                {quantity > 1 && <span className="text-muted-foreground">× {quantity}</span>}
                                {measurement && <span className="text-muted-foreground">{measurement}</span>}
                                {quantity > 1 && (
                                  <span className="font-semibold text-green-700">= €{totalPrice.toFixed(2)}</span>
                                )}
                              </div>
                            </div>

                            {/* Accept/Reject Buttons - only show when quote is not finalized */}
                            {quote.status !== 'accepted' && quote.status !== 'rejected' && (
                              <div className="flex items-center gap-2 ml-4">
                                {/* If already decided, show reset button only */}
                                {isDecided ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                                    onClick={() => handleResetUpsellDecision(qu.id)}
                                    disabled={isUpdating}
                                  >
                                    {isUpdating ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <RotateCcw className="h-4 w-4 mr-1" />
                                        Change
                                      </>
                                    )}
                                  </Button>
                                ) : (
                                  /* Show accept/reject buttons when not yet decided */
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700"
                                      onClick={() => handleUpsellDecision(qu.id, false)}
                                      disabled={isUpdating}
                                    >
                                      {isUpdating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <>
                                          <X className="h-4 w-4 mr-1" />
                                          Reject
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-green-300 text-green-600 hover:bg-green-100 hover:text-green-700"
                                      onClick={() => handleUpsellDecision(qu.id, true)}
                                      disabled={isUpdating}
                                    >
                                      {isUpdating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <>
                                          <Check className="h-4 w-4 mr-1" />
                                          Accept
                                        </>
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Summary */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Accepted Extras Total:</span>
                        <span className="text-2xl font-bold text-green-600">€{extrasTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No extras added to this quote</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-5">
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Milestone className="h-4 w-4" /> Project Timeline
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Track the progress of your quote</p>
              </div>
              {quoteTimeline.length > 0 ? (
                <div className="space-y-4">
                  {quoteTimeline.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        {getTimelineStatusIcon(step.status)}
                        {index < quoteTimeline.length - 1 && (
                          <div className="w-0.5 h-8 bg-border mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{step.timeline_step?.name || 'Step'}</p>
                          {(step as any).quote_item && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {(step as any).quote_item.product?.name || (step as any).quote_item.custom_product_name || 'Product'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.timeline_step?.description}
                        </p>
                        {step.notes && (
                          <p className="text-xs text-foreground mt-1 bg-muted/50 rounded px-2 py-1">{step.notes}</p>
                        )}
                        <span className={`mt-2 inline-block text-xs capitalize ${statusTone(step.status)}`}>
                          {step.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Timeline not yet initialized for this quote
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Products Sheet */}
      <AddProductsSheet
        open={showAddProducts}
        onOpenChange={setShowAddProducts}
        quoteId={quote.id}
        existingProductIds={quote.items?.map(item => item.product_id) || []}
        customerCompanyId={(quote as any).customer_company_id}
        customerContactId={(quote as any).customer_contact_id}
        onProductsAdded={loadQuoteDetails}
      />
    </div>
  );
};

export default QuoteDetailCustomerPage;

