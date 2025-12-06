import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, Package, User, Clock, DollarSign, Loader2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, StatusTag, Upsell, QuoteUpsell } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const QuoteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteWithItems | null>(null);
  const [statusTags, setStatusTags] = useState<StatusTag[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [quoteUpsells, setQuoteUpsells] = useState<QuoteUpsell[]>([]);
  const [loadingUpsells, setLoadingUpsells] = useState(false);

  useEffect(() => {
    if (id) {
      loadQuoteDetails();
      loadStatusTags();
      loadUpsells();
      loadQuoteUpsells();
    }
  }, [id]);

  const loadQuoteDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await quotesService.getQuote(id);
      setQuote(data);
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

  const loadStatusTags = async () => {
    try {
      const tags = await quotesService.getStatusTags();
      setStatusTags(tags);
    } catch (error) {
      console.error('Error loading status tags:', error);
    }
  };

  const loadUpsells = async () => {
    try {
      const data = await quotesService.getUpsells();
      setUpsells(data.filter(u => u.is_active));
    } catch (error) {
      console.error('Error loading upsells:', error);
    }
  };

  const loadQuoteUpsells = async () => {
    if (!id) return;
    try {
      setLoadingUpsells(true);
      const data = await quotesService.getQuoteUpsells(id);
      setQuoteUpsells(data);
    } catch (error) {
      console.error('Error loading quote upsells:', error);
    } finally {
      setLoadingUpsells(false);
    }
  };

  const handleAddUpsell = async (upsellId: string) => {
    if (!id) return;
    try {
      await quotesService.addUpsellToQuote(id, upsellId);
      toast({
        title: 'Success',
        description: 'Upsell added to quote',
      });
      await loadQuoteUpsells();
    } catch (error) {
      console.error('Error adding upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to add upsell',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveUpsell = async (quoteUpsellId: string) => {
    try {
      await quotesService.removeUpsellFromQuote(quoteUpsellId);
      toast({
        title: 'Success',
        description: 'Upsell removed from quote',
      });
      await loadQuoteUpsells();
    } catch (error) {
      console.error('Error removing upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove upsell',
        variant: 'destructive',
      });
    }
  };

  const handleStatusTagChange = async (tagId: string) => {
    if (!quote) return;

    try {
      setUpdatingStatus(true);
      await quotesService.updateQuoteStatusTag(quote.id, tagId);
      await loadQuoteDetails();
      toast({
        title: 'Success',
        description: 'Status tag updated successfully',
      });
    } catch (error) {
      console.error('Error updating status tag:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status tag',
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatus(false);
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

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700 border-gray-300',
      submitted: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      quoted: 'bg-purple-100 text-purple-700 border-purple-300',
      accepted: 'bg-green-100 text-green-700 border-green-300',
      rejected: 'bg-red-100 text-red-700 border-red-300',
      expired: 'bg-gray-100 text-gray-600 border-gray-300',
    };
    return colors[status as keyof typeof colors] || colors.draft;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GlobalAdminHeader title="Quote Details" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GlobalAdminHeader title="Quote Details" />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">
            <p className="text-gray-600">Quote not found</p>
            <Button onClick={() => navigate('/admin/quote-requests')} className="mt-4">
              Back to Quotes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const selectedTag = statusTags.find(tag => tag.id === quote.status_tag_id);

  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalAdminHeader title="Quote Details" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/quote-requests')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {quote.name || 'Untitled Quote'}
              </h1>
              <p className="text-gray-600 mt-1">Quote ID: {quote.id}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className={getStatusColor(quote.status)}>
                {quote.status}
              </Badge>
              {selectedTag && (
                <Badge
                  style={{
                    backgroundColor: selectedTag.color + '20',
                    color: selectedTag.color,
                    borderColor: selectedTag.color,
                  }}
                  className="border"
                >
                  {selectedTag.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Status Tag Selector */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Status Tag:</label>
              <Select
                value={quote.status_tag_id || ''}
                onValueChange={handleStatusTagChange}
                disabled={updatingStatus}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select status tag" />
                </SelectTrigger>
                <SelectContent>
                  {statusTags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border border-gray-200">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="items">Items ({quote.items?.length || 0})</TabsTrigger>
            <TabsTrigger value="extras">Extras/Upsells</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Quote Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quote Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Quote Name</p>
                      <p className="font-medium text-gray-900">{quote.name || 'Untitled'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Items</p>
                      <p className="font-medium text-gray-900">{quote.total_items || 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Created</p>
                      <p className="font-medium text-gray-900">{formatDate(quote.created_at)}</p>
                    </div>
                  </div>

                  {quote.submitted_at && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                        <Clock className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Submitted</p>
                        <p className="font-medium text-gray-900">{formatDate(quote.submitted_at)}</p>
                      </div>
                    </div>
                  )}

                  {quote.expires_at && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                        <Calendar className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Expires</p>
                        <p className="font-medium text-gray-900">{formatDate(quote.expires_at)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">User ID</p>
                      <p className="font-medium text-gray-900">{quote.user_id}</p>
                    </div>
                  </div>

                  {quote.workspace_id && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center bg-blue-50 rounded-lg w-10 h-10">
                        <Package className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Workspace ID</p>
                        <p className="font-medium text-gray-900">{quote.workspace_id}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Notes */}
            {quote.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Custom Request */}
            {quote.custom_request_text && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Custom Request</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{quote.custom_request_text}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Items Tab - Placeholder for now */}
          <TabsContent value="items">
            <Card>
              <CardHeader>
                <CardTitle>Quote Items</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Items list will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extras Tab */}
          <TabsContent value="extras" className="space-y-6">
            {/* Attached Upsells */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Attached Extras/Upsells</span>
                  <Badge variant="secondary">{quoteUpsells.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingUpsells ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : quoteUpsells.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No upsells attached to this quote yet</p>
                ) : (
                  <div className="space-y-3">
                    {quoteUpsells.map((quoteUpsell) => {
                      const upsell = upsells.find(u => u.id === quoteUpsell.upsell_id);
                      if (!upsell) return null;

                      return (
                        <div
                          key={quoteUpsell.id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-gray-400" />
                              <h4 className="font-medium text-gray-900">{upsell.name}</h4>
                              {quoteUpsell.customer_accepted !== null && (
                                <Badge variant={quoteUpsell.customer_accepted ? 'default' : 'destructive'}>
                                  {quoteUpsell.customer_accepted ? 'Accepted' : 'Rejected'}
                                </Badge>
                              )}
                            </div>
                            {upsell.description && (
                              <p className="text-sm text-gray-600 mt-1">{upsell.description}</p>
                            )}
                            <div className="flex items-center gap-1 mt-2 text-green-600 font-semibold">
                              <DollarSign className="h-4 w-4" />
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              }).format(upsell.price)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveUpsell(quoteUpsell.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Available Upsells */}
            <Card>
              <CardHeader>
                <CardTitle>Add Upsells to Quote</CardTitle>
              </CardHeader>
              <CardContent>
                {upsells.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No active upsells available</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upsells
                      .filter(upsell => !quoteUpsells.some(qu => qu.upsell_id === upsell.id))
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((upsell) => (
                        <div
                          key={upsell.id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-gray-400" />
                              <h4 className="font-medium text-gray-900">{upsell.name}</h4>
                            </div>
                            {upsell.description && (
                              <p className="text-sm text-gray-600 mt-1">{upsell.description}</p>
                            )}
                            <div className="flex items-center gap-1 mt-2 text-green-600 font-semibold">
                              <DollarSign className="h-4 w-4" />
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              }).format(upsell.price)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleAddUpsell(upsell.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline Tab - Placeholder */}
          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>Project Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Timeline will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab - Placeholder */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Activity log will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

