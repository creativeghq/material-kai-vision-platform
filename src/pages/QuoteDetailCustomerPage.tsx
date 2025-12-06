import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Package, Clock, Loader2, CheckCircle, XCircle, FileText, DollarSign, Gift, AlertCircle, Check, X, ShoppingCart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteUpsell, QuoteTimeline } from '@/services/quotes/QuotesService';

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

  useEffect(() => {
    if (id) {
      loadQuoteDetails();
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { icon: Clock, className: 'bg-gray-100 text-gray-800' },
      submitted: { icon: FileText, className: 'bg-blue-100 text-blue-800' },
      quoted: { icon: CheckCircle, className: 'bg-purple-100 text-purple-800' },
      accepted: { icon: CheckCircle, className: 'bg-green-100 text-green-800' },
      rejected: { icon: XCircle, className: 'bg-red-100 text-red-800' },
      expired: { icon: XCircle, className: 'bg-gray-100 text-gray-600' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;
    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
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
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="ghost" onClick={() => navigate('/quotes')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Quotes
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
    <div className="min-h-screen bg-background">
      {/* Page Header - Customer Style */}
      <div className="bg-card" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">{quote.name || 'Untitled Quote'}</h1>
                <p className="text-muted-foreground">
                  Created {new Date(quote.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {getStatusBadge(quote.status)}
              {quote.status === 'quoted' && (
                <Button
                  onClick={handleAcceptQuote}
                  disabled={!canAcceptQuote || acceptingQuote}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {acceptingQuote ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Accept Quote
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container" style={{ marginTop: 'var(--space-xl)' }}>
        {/* Pending Upsells Warning */}
        {quote.status === 'quoted' && hasUpsells && !allUpsellsDecided && (
          <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 mb-6">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">Action Required</AlertTitle>
            <AlertDescription className="text-yellow-700">
              Please accept or reject all {pendingUpsells.length} pending extra(s) before you can accept this quote.
              Go to the <strong>Extras</strong> tab to review them.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="dashboard-card">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Items</span>
            </div>
            <div className="text-2xl font-semibold">{itemCount}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-3 mb-2">
              <Gift className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Extras</span>
            </div>
            <div className="text-2xl font-semibold">
              {quoteUpsells.length}
              {pendingUpsells.length > 0 && (
                <span className="text-sm text-yellow-600 ml-2">({pendingUpsells.length} pending)</span>
              )}
            </div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Accepted Extras Total</span>
            </div>
            <div className="text-2xl font-semibold text-green-600">€{extrasTotal.toFixed(2)}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Expires</span>
            </div>
            <div className="text-2xl font-semibold">
              {new Date(quote.expires_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="items">Items ({itemCount})</TabsTrigger>
            <TabsTrigger value="extras">Extras ({quoteUpsells.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quote Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Name</span>
                    <p className="font-medium">{quote.name || 'Untitled Quote'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Status</span>
                    <div className="mt-1">{getStatusBadge(quote.status)}</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Created</span>
                    <p className="font-medium">{new Date(quote.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Expires</span>
                    <p className="font-medium">{new Date(quote.expires_at).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              {quote.custom_request_text && (
                <Card>
                  <CardHeader>
                    <CardTitle>Custom Request</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {quote.custom_request_text}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="items" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Quote Items</CardTitle>
                <CardDescription>Materials included in this quote</CardDescription>
              </CardHeader>
              <CardContent>
                {quote.items && quote.items.length > 0 ? (
                  <div className="space-y-4">
                    {quote.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          {item.product?.image_url && (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium">{item.product?.name || 'Unknown Product'}</p>
                            <p className="text-sm text-muted-foreground">
                              Quantity: {item.quantity}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No items in this quote</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extras" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Extras & Add-ons</CardTitle>
                <CardDescription>
                  Review and accept or reject additional services. Accepted extras will be added to your total.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                                  <Badge
                                    variant={qu.customer_accepted ? 'default' : 'destructive'}
                                    className={qu.customer_accepted ? 'bg-green-600' : ''}
                                  >
                                    {qu.customer_accepted ? 'Accepted' : 'Rejected'}
                                  </Badge>
                                )}
                                {!isDecided && (
                                  <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                                    Pending Decision
                                  </Badge>
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

                            {/* Accept/Reject Buttons - only show if not yet decided */}
                            {!isDecided && quote.status === 'quoted' && (
                              <div className="flex items-center gap-2 ml-4">
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
                                  className="bg-green-600 hover:bg-green-700"
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
                  <p className="text-muted-foreground text-center py-8">No extras added to this quote</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Timeline</CardTitle>
                <CardDescription>Track the progress of your quote</CardDescription>
              </CardHeader>
              <CardContent>
                {quoteTimeline.length > 0 ? (
                  <div className="space-y-4">
                    {quoteTimeline.map((step, index) => (
                      <div key={step.id} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          {getTimelineStatusIcon(step.status)}
                          {index < quoteTimeline.length - 1 && (
                            <div className="w-0.5 h-8 bg-gray-200 mt-2" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="font-medium">{step.timeline_step?.name || 'Step'}</p>
                          <p className="text-sm text-muted-foreground">
                            {step.timeline_step?.description}
                          </p>
                          <Badge variant="outline" className="mt-2">
                            {step.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Timeline not yet initialized for this quote
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default QuoteDetailCustomerPage;

