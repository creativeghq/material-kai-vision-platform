import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, Package, User, Clock, DollarSign, Loader2, Plus, X, GitBranch, CheckCircle, Circle, PlayCircle, SkipForward, Gift, ListChecks, MessageSquare, Ruler, Boxes, Milestone, Activity, Tag, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, StatusTag, Upsell, QuoteUpsell, TimelineStep, QuoteTimeline } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { QuoteItemsList } from '@/components/Quotes/QuoteItemsList';
import { AddProductsSheet } from '@/components/Quotes/AddProductsSheet';
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
  const [showTimelineModal, setShowTimelineModal] = useState(false);

  // Timeline state
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [quoteTimeline, setQuoteTimeline] = useState<QuoteTimeline[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [updatingTimelineStep, setUpdatingTimelineStep] = useState<string | null>(null);
  const [selectedTimelineStepId, setSelectedTimelineStepId] = useState<string>('');
  const [timelineNote, setTimelineNote] = useState('');
  const [addingTimeline, setAddingTimeline] = useState(false);

  // Upsell add state
  const [selectedUpsellId, setSelectedUpsellId] = useState<string>('');
  const [upsellPrice, setUpsellPrice] = useState('');
  const [upsellQuantity, setUpsellQuantity] = useState('1');
  const [upsellMeasurement, setUpsellMeasurement] = useState('');
  const [addingUpsell, setAddingUpsell] = useState(false);

  // Timeline notes state (for editing notes on existing timeline items)
  const [editingTimelineNotes, setEditingTimelineNotes] = useState<Record<string, string>>({});

  // Add Products Sheet state
  const [isAddProductsOpen, setIsAddProductsOpen] = useState(false);

  useEffect(() => {
    if (id) {
      loadQuoteDetails();
      loadStatusTags();
      loadUpsells();
      loadQuoteUpsells();
      loadTimelineData();
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

  const loadTimelineData = async () => {
    if (!id) return;
    try {
      setLoadingTimeline(true);
      const [steps, timeline] = await Promise.all([
        quotesService.getTimelineSteps(),
        quotesService.getQuoteTimeline(id),
      ]);
      setTimelineSteps(steps);
      setQuoteTimeline(timeline);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleUpdateTimelineStatus = async (
    quoteTimelineId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  ) => {
    try {
      setUpdatingTimelineStep(quoteTimelineId);
      await quotesService.updateTimelineStep(quoteTimelineId, { status });
      toast({
        title: 'Success',
        description: 'Timeline step updated',
      });
      await loadTimelineData();
    } catch (error) {
      console.error('Error updating timeline step:', error);
      toast({
        title: 'Error',
        description: 'Failed to update timeline step',
        variant: 'destructive',
      });
    } finally {
      setUpdatingTimelineStep(null);
    }
  };

  const handleInitializeTimeline = async () => {
    if (!id) return;
    try {
      setLoadingTimeline(true);
      await quotesService.initializeQuoteTimeline(id);
      toast({
        title: 'Success',
        description: 'Timeline initialized',
      });
      await loadTimelineData();
    } catch (error) {
      console.error('Error initializing timeline:', error);
      toast({
        title: 'Error',
        description: 'Failed to initialize timeline',
        variant: 'destructive',
      });
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleAddTimelineFromDropdown = async () => {
    if (!id || !selectedTimelineStepId) return;
    try {
      setAddingTimeline(true);
      await quotesService.addTimelineStepToQuote(id, selectedTimelineStepId, timelineNote || undefined);
      toast({
        title: 'Success',
        description: 'Timeline step added',
      });
      setSelectedTimelineStepId('');
      setTimelineNote('');
      await loadTimelineData();
    } catch (error) {
      console.error('Error adding timeline step:', error);
      toast({
        title: 'Error',
        description: 'Failed to add timeline step',
        variant: 'destructive',
      });
    } finally {
      setAddingTimeline(false);
    }
  };

  const handleUpdateTimelineNote = async (quoteTimelineId: string, notes: string) => {
    try {
      await quotesService.updateTimelineStep(quoteTimelineId, { notes });
      toast({
        title: 'Success',
        description: 'Note saved',
      });
      setEditingTimelineNotes((prev) => {
        const updated = { ...prev };
        delete updated[quoteTimelineId];
        return updated;
      });
      await loadTimelineData();
    } catch (error) {
      console.error('Error updating timeline note:', error);
      toast({
        title: 'Error',
        description: 'Failed to save note',
        variant: 'destructive',
      });
    }
  };

  const handleAddUpsellFromDropdown = async () => {
    if (!id || !selectedUpsellId) return;
    try {
      setAddingUpsell(true);
      const metadata = {
        custom_price: upsellPrice ? parseFloat(upsellPrice) : undefined,
        quantity: upsellQuantity ? parseFloat(upsellQuantity) : 1,
        measurement: upsellMeasurement || undefined,
      };
      await quotesService.addUpsellToQuote(id, selectedUpsellId, undefined, metadata);
      toast({
        title: 'Success',
        description: 'Upsell added to quote',
      });
      setSelectedUpsellId('');
      setUpsellPrice('');
      setUpsellQuantity('1');
      setUpsellMeasurement('');
      await loadQuoteUpsells();
    } catch (error) {
      console.error('Error adding upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to add upsell',
        variant: 'destructive',
      });
    } finally {
      setAddingUpsell(false);
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
      <div className="min-h-screen">
        <GlobalAdminHeader title="Quote Details" description="Loading..." badge="Admin" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader title="Quote Not Found" badge="Admin" />
        <div className="p-6">
          <Button onClick={() => navigate('/admin/quote-requests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>
        </div>
      </div>
    );
  }

  const selectedTag = statusTags.find(tag => tag.id === quote.status_tag_id);
  const itemCount = quote.items?.length || quote.total_items || 0;
  const extrasTotal = quoteUpsells.reduce((sum, qu) => {
    const upsell = upsells.find(u => u.id === qu.upsell_id);
    return sum + (upsell?.price || 0);
  }, 0);

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title={quote.name || 'Untitled Quote'}
        description={`Created ${new Date(quote.created_at).toLocaleDateString()}`}
        badge="Quote Details"
      />

      <div className="p-6 space-y-6">
        {/* Back Button & Status Row */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/admin/quote-requests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>

          <div className="flex items-center gap-3">
            {/* Quote Status Badge */}
            <Badge className={`border ${getStatusColor(quote.status)}`}>
              {quote.status}
            </Badge>

            {/* Status Tag Selector */}
            <Select
              value={quote.status_tag_id || ''}
              onValueChange={handleStatusTagChange}
              disabled={updatingStatus}
            >
              <SelectTrigger className="w-48 h-9 bg-white border-2">
                {updatingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SelectValue placeholder="Assign Status Tag">
                    {selectedTag && (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: selectedTag.color }}
                        />
                        <span className="truncate">{selectedTag.name}</span>
                      </div>
                    )}
                  </SelectValue>
                )}
              </SelectTrigger>
              <SelectContent>
                {statusTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Compact Quote Information Row - dashboard card styling */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Boxes className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
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
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Gift className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Extras</p>
                <p className="text-lg font-semibold">{quoteUpsells.length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <DollarSign className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Extras Total</p>
                <p className="text-lg font-semibold">€{extrasTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <ListChecks className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="text-lg font-semibold">{quoteTimeline.length} steps</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Calendar className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-lg font-semibold">{new Date(quote.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Timer className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Expires</p>
                <p className="text-lg font-semibold">{new Date(quote.expires_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <User className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-sm font-semibold truncate" title={quote.user_id}>{quote.user_id.substring(0, 8)}...</p>
              </div>
            </div>
          </div>
          {quote.workspace_id && (
            <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '2rem',
                    height: '2rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)'
                  }}
                >
                  <Package className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Workspace</p>
                  <p className="text-sm font-semibold truncate" title={quote.workspace_id}>{quote.workspace_id.substring(0, 8)}...</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes & Custom Request (if present) */}
        {(quote.notes || quote.custom_request_text) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quote.notes && (
              <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-sm font-medium">Notes</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.custom_request_text && (
              <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-sm font-medium">Custom Request</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.custom_request_text}</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs - Reduced to 4 tabs (removed Overview) */}
        <Tabs defaultValue="items" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
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
              Timeline ({quoteTimeline.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Items Tab */}
          <TabsContent value="items">
            <QuoteItemsList
              items={quote.items || []}
              variant="detailed"
              showAddButton={quote.status !== 'accepted' && quote.status !== 'rejected'}
              onAddProducts={() => setIsAddProductsOpen(true)}
              onUpdateQuantity={async (itemId, quantity) => {
                await quotesService.updateItem(itemId, { quantity });
                await loadQuoteDetails();
              }}
              onRemoveItem={async (itemId) => {
                await quotesService.removeItem(itemId);
                await loadQuoteDetails();
              }}
              editable={quote.status !== 'accepted' && quote.status !== 'rejected'}
            />
          </TabsContent>

          {/* Extras Tab */}
          <TabsContent value="extras" className="space-y-6">
            {/* Add Upsell Dropdown Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Add Extra/Upsell
                </CardTitle>
                <CardDescription>
                  Select an upsell from the dropdown and customize price, quantity, and measurement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  {/* Upsell Dropdown */}
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium mb-2 block">Select Upsell</label>
                    <Select value={selectedUpsellId} onValueChange={setSelectedUpsellId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose an upsell..." />
                      </SelectTrigger>
                      <SelectContent>
                        {upsells
                          .filter(u => !quoteUpsells.some(qu => qu.upsell_id === u.id))
                          .map((upsell) => (
                            <SelectItem key={upsell.id} value={upsell.id}>
                              <div className="flex items-center justify-between gap-4">
                                <span>{upsell.name}</span>
                                <span className="text-muted-foreground">€{upsell.price.toFixed(2)}</span>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Custom Price */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      <DollarSign className="h-3 w-3 inline mr-1" />
                      Price (€)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Custom price"
                      value={upsellPrice}
                      onChange={(e) => setUpsellPrice(e.target.value)}
                    />
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      <Ruler className="h-3 w-3 inline mr-1" />
                      Quantity
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="1"
                      value={upsellQuantity}
                      onChange={(e) => setUpsellQuantity(e.target.value)}
                    />
                  </div>

                  {/* Measurement */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Measurement</label>
                    <Input
                      placeholder="e.g., m², pcs"
                      value={upsellMeasurement}
                      onChange={(e) => setUpsellMeasurement(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddUpsellFromDropdown}
                  disabled={!selectedUpsellId || addingUpsell}
                  className="mt-4"
                >
                  {addingUpsell ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Upsell to Quote
                </Button>
              </CardContent>
            </Card>

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
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : quoteUpsells.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No upsells attached to this quote yet</p>
                ) : (
                  <div className="space-y-3">
                    {quoteUpsells.map((quoteUpsell) => {
                      const upsell = upsells.find(u => u.id === quoteUpsell.upsell_id);
                      if (!upsell) return null;

                      const metadata = quoteUpsell.metadata as { custom_price?: number; quantity?: number; measurement?: string } | null;
                      const displayPrice = metadata?.custom_price ?? upsell.price;
                      const displayQty = metadata?.quantity ?? 1;
                      const displayMeasurement = metadata?.measurement ?? '';

                      return (
                        <div
                          key={quoteUpsell.id}
                          className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Gift className="h-4 w-4 text-muted-foreground" />
                              <h4 className="font-medium">{upsell.name}</h4>
                              {quoteUpsell.customer_accepted !== null && (
                                <Badge variant={quoteUpsell.customer_accepted ? 'default' : 'destructive'}>
                                  {quoteUpsell.customer_accepted ? 'Accepted' : 'Rejected'}
                                </Badge>
                              )}
                            </div>
                            {upsell.description && (
                              <p className="text-sm text-muted-foreground mt-1">{upsell.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="text-green-600 font-semibold">€{displayPrice.toFixed(2)}</span>
                              <span className="text-muted-foreground">Qty: {displayQty}</span>
                              {displayMeasurement && (
                                <span className="text-muted-foreground">({displayMeasurement})</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveUpsell(quoteUpsell.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            {/* Add Timeline Step Dropdown Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Add Timeline Step
                </CardTitle>
                <CardDescription>
                  Select a timeline step from the dropdown and optionally add a note
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  {/* Timeline Step Dropdown */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Select Step</label>
                    <Select value={selectedTimelineStepId} onValueChange={setSelectedTimelineStepId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a timeline step..." />
                      </SelectTrigger>
                      <SelectContent>
                        {timelineSteps
                          .filter(s => !quoteTimeline.some(qt => qt.timeline_step_id === s.id))
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((step) => (
                            <SelectItem key={step.id} value={step.id}>
                              <div className="flex items-center gap-2">
                                <span>{step.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Note */}
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium mb-2 block">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      Note (optional)
                    </label>
                    <Textarea
                      placeholder="Add a note for this timeline step..."
                      value={timelineNote}
                      onChange={(e) => setTimelineNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddTimelineFromDropdown}
                  disabled={!selectedTimelineStepId || addingTimeline}
                  className="mt-4"
                >
                  {addingTimeline ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Step to Timeline
                </Button>

                {quoteTimeline.length === 0 && quote.status === 'accepted' && (
                  <Button
                    variant="outline"
                    onClick={handleInitializeTimeline}
                    disabled={loadingTimeline}
                    className="mt-4 ml-2"
                  >
                    {loadingTimeline ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <GitBranch className="h-4 w-4 mr-2" />
                    )}
                    Initialize All Steps
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Timeline Steps List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Project Timeline</span>
                  <Badge variant="secondary">{quoteTimeline.length} steps</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTimeline ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : quoteTimeline.length === 0 ? (
                  <div className="text-center py-8">
                    <GitBranch className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground mb-2">No timeline steps assigned</p>
                    <p className="text-muted-foreground/70 text-sm">
                      Use the dropdown above to add individual steps or initialize all steps at once
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {quoteTimeline.map((item, index) => {
                      const step = item.timeline_step;
                      if (!step) return null;

                      const getStatusIcon = (status: string) => {
                        switch (status) {
                          case 'completed':
                            return <CheckCircle className="h-5 w-5 text-green-500" />;
                          case 'in_progress':
                            return <PlayCircle className="h-5 w-5 text-blue-500" />;
                          case 'skipped':
                            return <SkipForward className="h-5 w-5 text-muted-foreground" />;
                          default:
                            return <Circle className="h-5 w-5 text-muted-foreground/50" />;
                        }
                      };

                      const getStatusBadgeColor = (status: string) => {
                        switch (status) {
                          case 'completed':
                            return 'bg-green-100 text-green-700 border-green-200';
                          case 'in_progress':
                            return 'bg-blue-100 text-blue-700 border-blue-200';
                          case 'skipped':
                            return 'bg-muted text-muted-foreground border-muted';
                          default:
                            return 'bg-muted/50 text-muted-foreground border-muted';
                        }
                      };

                      const isEditingNote = editingTimelineNotes[item.id] !== undefined;
                      const currentNote = isEditingNote ? editingTimelineNotes[item.id] : (item.notes || '');

                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-4 p-4 border rounded-lg bg-muted/50"
                        >
                          <div className="flex flex-col items-center">
                            {getStatusIcon(item.status)}
                            {index < quoteTimeline.length - 1 && (
                              <div className="w-0.5 h-8 bg-border mt-2" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{step.name}</h4>
                              <Badge className={`border ${getStatusBadgeColor(item.status)}`}>
                                {item.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            {step.description && (
                              <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                            )}
                            {item.completed_at && (
                              <p className="text-xs text-muted-foreground mb-2">
                                Completed: {new Date(item.completed_at).toLocaleDateString()}
                              </p>
                            )}

                            {/* Note Section */}
                            <div className="mt-3 p-3 bg-background rounded border">
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                <MessageSquare className="h-3 w-3 inline mr-1" />
                                Note
                              </label>
                              <Textarea
                                placeholder="Add a note..."
                                value={currentNote}
                                onChange={(e) => setEditingTimelineNotes(prev => ({
                                  ...prev,
                                  [item.id]: e.target.value
                                }))}
                                rows={2}
                                className="text-sm"
                              />
                              {isEditingNote && (
                                <Button
                                  size="sm"
                                  onClick={() => handleUpdateTimelineNote(item.id, editingTimelineNotes[item.id])}
                                  className="mt-2"
                                >
                                  Save Note
                                </Button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-3">
                              <Select
                                value={item.status}
                                onValueChange={(value) =>
                                  handleUpdateTimelineStatus(
                                    item.id,
                                    value as 'pending' | 'in_progress' | 'completed' | 'skipped'
                                  )
                                }
                                disabled={updatingTimelineStep === item.id}
                              >
                                <SelectTrigger className="w-40 h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="skipped">Skipped</SelectItem>
                                </SelectContent>
                              </Select>
                              {updatingTimelineStep === item.id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Activity log will be displayed here</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Products Sheet */}
      {id && (
        <AddProductsSheet
          quoteId={id}
          isOpen={isAddProductsOpen}
          onClose={() => setIsAddProductsOpen(false)}
          onProductsAdded={loadQuoteDetails}
        />
      )}
    </div>
  );
};

