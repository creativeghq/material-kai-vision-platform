import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Package, Clock, Loader2, CheckCircle, XCircle, FileText, DollarSign, ListChecks, Gift } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, QuoteUpsell, QuoteTimeline } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { ProjectTimelineModal } from '@/components/Quotes/ProjectTimelineModal';

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
  const [showTimelineModal, setShowTimelineModal] = useState(false);

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
      <div className="min-h-screen">
        <GlobalAdminHeader title="Quote Details" description="Loading..." />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader title="Quote Not Found" description="The requested quote could not be found" />
        <div className="p-6">
          <Button onClick={() => navigate('/quotes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  const itemCount = quote.items?.length || quote.total_items || 0;
  const extrasTotal = quoteUpsells.reduce((sum, u) => sum + (u.upsell?.price || 0), 0);

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title={quote.name || 'Untitled Quote'}
        description={`Created ${new Date(quote.created_at).toLocaleDateString()}`}
        badge="Quote Details"
      />

      <div className="p-6 space-y-6">
        {/* Back Button & Status */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/quotes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>
          <div className="flex items-center gap-4">
            {getStatusBadge(quote.status)}
            <Button variant="outline" onClick={() => setShowTimelineModal(true)}>
              <ListChecks className="h-4 w-4 mr-2" />
              View Timeline
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <div className="text-2xl font-semibold">{quoteUpsells.length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Extras Total</span>
            </div>
            <div className="text-2xl font-semibold">€{extrasTotal.toFixed(2)}</div>
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
                <CardDescription>Additional services included in this quote</CardDescription>
              </CardHeader>
              <CardContent>
                {quoteUpsells.length > 0 ? (
                  <div className="space-y-4">
                    {quoteUpsells.map((qu) => (
                      <div key={qu.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{qu.upsell?.name || 'Unknown Extra'}</p>
                          <p className="text-sm text-muted-foreground">{qu.upsell?.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">€{qu.upsell?.price?.toFixed(2) || '0.00'}</p>
                          <Badge variant={qu.accepted ? 'default' : 'secondary'}>
                            {qu.accepted ? 'Accepted' : 'Pending'}
                          </Badge>
                        </div>
                      </div>
                    ))}
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

      {/* Timeline Modal */}
      <ProjectTimelineModal
        open={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        quoteId={id || ''}
      />
    </div>
  );
};

export default QuoteDetailCustomerPage;

