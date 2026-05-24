import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, Package, User, Clock, DollarSign, Loader2, Plus, X, GitBranch, CheckCircle, Circle, PlayCircle, SkipForward, Gift, ListChecks, MessageSquare, Ruler, Boxes, Milestone, Activity, Tag, Timer, Download, RefreshCw, Save, Send, Truck, FilePlus2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { quotesService, QuoteWithItems, StatusTag, Upsell, QuoteUpsell, TimelineStep, QuoteTimeline, QuoteItemWithProduct } from '../services/QuotesService';
import { quotePDFService } from '../services/QuotePDFService';
import { QuoteDownloadButtons } from '../components/QuoteDownloadButtons';
import { useQuoteDocument } from '../hooks/useQuoteDocument';
import { QuoteStatusBadge } from '@/lib/quoteStatus';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { QuoteItemsList } from '../components/QuoteItemsList';
import { AddProductsSheet } from '../components/AddProductsSheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { OxygenPreInvoiceButton } from '@/modules/oxygen';
import { QuoteActivityPanel } from '@/modules/finance/components/QuoteActivityPanel';
import { IssueInvoiceButton } from '@/modules/finance/components/IssueInvoiceButton';
import { formatMoney } from '@/modules/finance/services/financeService';

const sendQuoteNotification = (userId: string, title: string, quoteId: string) => {
  supabase.from('user_notifications').insert({
    user_id: userId,
    type: 'quote_updated',
    title,
    body: null,
    action_url: `/quotes/${quoteId}`,
    is_read: false,
    metadata: { quote_id: quoteId },
  }).then(() => {});
};

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
  const [selectedTimelineItemId, setSelectedTimelineItemId] = useState<string>('');
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

  // Pricing state
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, string>>({});
  const [vatRate, setVatRate] = useState<string>('24');
  const [savingPrices, setSavingPrices] = useState(false);

  // PDF generation state
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);

  // HTML/client-side PDF — hook must be at top level (before any early returns)
  const { data: docData } = useQuoteDocument(id || '');

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
      // Initialize pricing state from loaded data
      if (data?.items) {
        const prices: Record<string, string> = {};
        const discounts: Record<string, string> = {};
        data.items.forEach((item: QuoteItemWithProduct) => {
          if (item.unit_price !== null && item.unit_price !== undefined) {
            prices[item.id] = String(item.unit_price);
          }
          // Reverse-calculate discount % from unit_price and discounted_price
          const dp = (item as any).discounted_price;
          if (dp != null && item.unit_price && item.unit_price > 0) {
            const pct = ((item.unit_price - dp) / item.unit_price) * 100;
            if (pct > 0) discounts[item.id] = String(Math.round(pct * 100) / 100);
          }
        });
        setItemPrices(prices);
        setItemDiscounts(discounts);
      }
      if (data?.vat_rate) {
        setVatRate(String(data.vat_rate));
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
    status: 'pending' | 'in_progress' | 'completed' | 'skipped',
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
      const itemId = selectedTimelineItemId && selectedTimelineItemId !== '__none__' ? selectedTimelineItemId : undefined;
      await quotesService.addTimelineStepToQuote(id, selectedTimelineStepId, timelineNote || undefined, itemId);
      if (quote?.user_id) {
        const stepLabel = timelineSteps.find((s) => s.id === selectedTimelineStepId)?.name ?? 'a step';
        sendQuoteNotification(quote.user_id, `Your quote "${quote?.name || 'Quote'}" has a new update: ${stepLabel}`, id);
      }
      toast({
        title: 'Success',
        description: 'Timeline step added',
      });
      setSelectedTimelineStepId('');
      setSelectedTimelineItemId('');
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

  // Pricing helpers
  const getItemEffectivePrice = (itemId: string): number => {
    const price = parseFloat(itemPrices[itemId] || '0');
    const discountPct = parseFloat(itemDiscounts[itemId] || '0');
    if (discountPct > 0 && price > 0) {
      return Math.round(price * (1 - discountPct / 100) * 100) / 100;
    }
    return price;
  };

  const getItemLineTotal = (itemId: string, quantity: number): number => {
    return getItemEffectivePrice(itemId) * quantity;
  };

  const pricingSubtotal = (quote?.items || []).reduce((sum, item) => {
    return sum + getItemLineTotal(item.id, item.quantity);
  }, 0);

  const pricingVatRate = parseFloat(vatRate) || 0;
  const pricingVatAmount = pricingSubtotal * (pricingVatRate / 100);
  const pricingGrandTotal = pricingSubtotal + pricingVatAmount;

  const allItemsHavePrices = (quote?.items || []).length > 0 &&
    (quote?.items || []).every(item => {
      const price = parseFloat(itemPrices[item.id] || '');
      return !isNaN(price) && price > 0;
    });

  const handleSavePrices = async () => {
    if (!quote?.id || !quote.items) return;
    try {
      setSavingPrices(true);
      const items = quote.items.map(item => {
        const unitPrice = parseFloat(itemPrices[item.id] || '0');
        const discountPct = parseFloat(itemDiscounts[item.id] || '0');
        const effectivePrice = getItemEffectivePrice(item.id);
        const discountedPrice = discountPct > 0 ? effectivePrice : null;
        return {
          id: item.id,
          unit_price: unitPrice,
          discounted_price: discountedPrice,
          line_total: effectivePrice * item.quantity,
        };
      });
      const result = await quotePDFService.saveItemPrices(quote.id, items, pricingVatRate);
      if (result.success) {
        toast({ title: 'Prices saved', description: 'Item prices and totals updated.' });
        await loadQuoteDetails();
        if (quote?.user_id) {
          sendQuoteNotification(quote.user_id, `Your quote "${quote.name || 'Quote'}" has been priced and is ready to review`, quote.id);
        }
      } else {
        toast({ title: 'Error', description: result.error || 'Failed to save prices', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error saving prices:', error);
      toast({ title: 'Error', description: 'Failed to save prices', variant: 'destructive' });
    } finally {
      setSavingPrices(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!quote?.id) return;
    try {
      setGeneratingPDF(true);
      const regenerate = !!quote.pdf_storage_path;
      const result = await quotePDFService.generatePDF(quote.id, regenerate);
      if (result.success) {
        toast({ title: 'PDF Generated', description: `Quote ${result.quote_number || ''} PDF is ready.` });
        await loadQuoteDetails();
      } else {
        toast({ title: 'PDF Generation Failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quote?.id) return;
    try {
      setDownloadingPDF(true);
      const downloaded = await quotePDFService.downloadPDF(quote.id);
      if (!downloaded) {
        toast({ title: 'Error', description: 'PDF not available. Generate it first.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({ title: 'Error', description: 'Failed to download PDF', variant: 'destructive' });
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleSendQuote = async () => {
    if (!quote) return;
    try {
      setSendingQuote(true);
      await quotesService.updateQuote(quote.id, { status: 'quoted' });
      await loadQuoteDetails();
      if (quote.user_id) {
        sendQuoteNotification(quote.user_id, `Your quote "${quote.name || 'Quote'}" has been priced and is ready for your review`, quote.id);
      }
      toast({ title: 'Quote Sent', description: 'Quote has been sent to the customer for review.' });
    } catch (error) {
      console.error('Error sending quote:', error);
      toast({ title: 'Error', description: 'Failed to send quote to customer', variant: 'destructive' });
    } finally {
      setSendingQuote(false);
    }
  };

  const handleStatusTagChange = async (tagId: string) => {
    if (!quote) return;

    try {
      setUpdatingStatus(true);
      // '__none__' is the sentinel value for clearing the tag
      await quotesService.updateQuoteStatusTag(quote.id, tagId === '__none__' ? null : tagId);
      await loadQuoteDetails();
      if (quote.user_id) {
        const tagLabel = tagId === '__none__' ? 'updated' : (statusTags.find((t) => t.id === tagId)?.name ?? 'updated');
        sendQuoteNotification(quote.user_id, `Your quote "${quote.name || 'Quote'}" status changed to: ${tagLabel}`, quote.id);
      }
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
        <div className="p-3 sm:p-6">
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
        description={
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Created {new Date(quote.created_at).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              Expires {new Date(quote.expires_at).toLocaleDateString()}
            </span>
          </span>
        }
        badge="Quote Details"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Back Button & Status Row */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate('/admin/quote-requests')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Quotes
          </Button>

          <div className="flex items-center gap-3">
            {/* Quote Status Badge */}
            <QuoteStatusBadge status={quote.status} />

            {quote.quote_number && (
              <Badge variant="outline" className="font-mono">{quote.quote_number}</Badge>
            )}

            {/* Preview + Download PDF (client-side) */}
            <QuoteDownloadButtons
              quoteId={quote.id}
              quoteNumber={quote.quote_number}
              data={docData}
            />

            {/* Send Quote to Customer — only when submitted/draft and all items priced */}
            {(quote.status === 'submitted' || quote.status === 'draft') && allItemsHavePrices && (
              <Button
                size="sm"
                onClick={handleSendQuote}
                disabled={sendingQuote}
                className="rounded-full bg-green-600 hover:bg-green-700 text-white"
              >
                {sendingQuote ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1" /> Send Quote</>
                )}
              </Button>
            )}

            {/* Oxygen module: Pre-Invoice (notice) — renders only when status === 'accepted' */}
            <OxygenPreInvoiceButton
              quote={quote as unknown as import('@/modules/oxygen').QuoteOxygenView}
              onSynced={loadQuoteDetails}
            />

            {/* Sales/Finance: Issue invoice (creates internal invoice row from accepted quote) */}
            {quote && <IssueInvoiceButton quoteId={quote.id} quoteStatus={quote.status} />}

            {/* Project Workspace: Issue revision — clones quote + items, bumps revision_number, sets parent_quote_id.
                Available once the quote is no longer a draft (i.e. has been sent / quoted / accepted / rejected). */}
            {quote && (quote.status === 'submitted' || quote.status === 'quoted' || quote.status === 'accepted' || quote.status === 'rejected' || quote.status === 'expired') && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!confirm(`Create a new revision of this quote? The current quote stays as-is; a new draft revision is created with all items copied over.`)) return;
                  try {
                    const newQuote = await quotesService.issueRevision(quote.id);
                    toast({ title: `Revision ${newQuote.revision_number} created`, description: 'Opening the new draft...' });
                    navigate(`/admin/quotes/${newQuote.id}`);
                  } catch (err) {
                    toast({ title: 'Failed to issue revision', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
                  }
                }}
                className="rounded-full"
              >
                <FilePlus2 className="h-4 w-4 mr-1" />
                Issue Revision
              </Button>
            )}
          </div>
        </div>

        {/* Compact Quote Information Row - dashboard card styling */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
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
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
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

        {/* Tabs */}
        <Tabs defaultValue="items" className="w-full mt-2">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="items" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Boxes className="h-4 w-4" />
              Items ({itemCount})
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="h-4 w-4" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="extras" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Gift className="h-4 w-4" />
              Extras ({quoteUpsells.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Milestone className="h-4 w-4" />
              Timeline ({quoteTimeline.length})
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Items Tab */}
          <TabsContent value="items" className="mt-5">
            <QuoteItemsList
              items={quote.items || []}
              variant="detailed"
              showAddButton={quote.status !== 'accepted' && quote.status !== 'rejected'}
              customerCompanyId={quote.customer_company_id}
              customerContactId={quote.customer_contact_id}
              onAddProducts={() => setIsAddProductsOpen(true)}
              onUpdateQuantity={['draft', 'submitted'].includes(quote.status) ? async (itemId, quantity) => {
                await quotesService.updateItem(itemId, { quantity });
                await loadQuoteDetails();
              } : undefined}
              onUpdateItem={['draft', 'submitted'].includes(quote.status) ? async (itemId, data) => {
                await quotesService.updateItem(itemId, data);
                await loadQuoteDetails();
              } : undefined}
              onRemoveItem={async (itemId) => {
                await quotesService.removeItem(itemId);
                await loadQuoteDetails();
              }}
              editable={quote.status !== 'accepted' && quote.status !== 'rejected'}
              editPricing={false}
              editUnits={['draft', 'submitted'].includes(quote.status)}
            />
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-5 mt-5">
            {/* Profit summary — visible to admins via RLS on the underlying cost columns. */}
            {(() => {
              const items = quote.items || [];
              let totalRevenue = 0;
              let totalCost = 0;
              let hasCost = false;
              for (const it of items) {
                const qty = Number(it.quantity || 0);
                const effective = Number(it.discounted_price ?? it.unit_price ?? 0);
                totalRevenue += qty * effective;
                const snap = (it as any).cost_snapshot;
                const liveCost = (it.product as any)?.cost;
                const cost = snap != null ? Number(snap) : liveCost != null ? Number(liveCost) : null;
                if (cost != null) {
                  totalCost += qty * cost;
                  hasCost = true;
                }
              }
              const margin = totalRevenue - totalCost;
              const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : null;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="dashboard-card p-3 border-0 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue (net)</div>
                    <div className="text-lg font-semibold">{formatMoney(totalRevenue, quote.currency || 'EUR')}</div>
                  </div>
                  <div className="dashboard-card p-3 border-0 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Estimated COGS</div>
                    <div className="text-lg font-semibold">{hasCost ? formatMoney(totalCost, quote.currency || 'EUR') : '—'}</div>
                  </div>
                  <div className={`dashboard-card p-3 border-0 rounded-2xl ${margin < 0 && hasCost ? 'ring-1 ring-destructive/40' : ''}`}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross margin</div>
                    <div className={`text-lg font-semibold ${margin < 0 && hasCost ? 'text-destructive' : ''}`}>
                      {hasCost ? formatMoney(margin, quote.currency || 'EUR') : '—'}
                    </div>
                  </div>
                  <div className="dashboard-card p-3 border-0 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Margin %</div>
                    <div className="text-lg font-semibold">{marginPct != null && hasCost ? `${marginPct.toFixed(1)}%` : '—'}</div>
                  </div>
                </div>
              );
            })()}

            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <DollarSign className="h-4 w-4" /> Set Item Prices
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Set a unit price for each item. Line totals and the grand total are calculated automatically.</p>
              </div>
              <div>
                {(quote.items || []).length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No items in this quote.</p>
                ) : (
                  <>
                    {/* Pricing Table */}
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                          <tr>
                            <th className="text-left text-xs font-medium text-muted-foreground p-3">Product</th>
                            <th className="text-center text-xs font-medium text-muted-foreground p-3 w-16">Qty</th>
                            <th className="text-left text-xs font-medium text-muted-foreground p-3 w-32">Unit Price</th>
                            <th className="text-left text-xs font-medium text-muted-foreground p-3 w-24">Discount</th>
                            <th className="text-right text-xs font-medium text-muted-foreground p-3 w-28">Final Price</th>
                            <th className="text-right text-xs font-medium text-muted-foreground p-3 w-28">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(quote.items || []).map((item, idx) => {
                            const unitPrice = parseFloat(itemPrices[item.id] || '0');
                            const discountPct = parseFloat(itemDiscounts[item.id] || '0');
                            const effectivePrice = getItemEffectivePrice(item.id);
                            const lineTotal = getItemLineTotal(item.id, item.quantity);
                            const hasDiscount = discountPct > 0 && unitPrice > 0;
                            const productName = !item.product_id
                              ? (item.custom_product_name || 'Custom Item')
                              : (item.product?.name || 'Unknown');

                            return (
                              <tr key={item.id} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                                <td className="p-3">
                                  <div className="font-medium text-sm">{productName}</div>
                                  <div className="flex gap-2 mt-0.5">
                                    {item.selected_size && (
                                      <span className="text-xs text-muted-foreground">{item.selected_size}</span>
                                    )}
                                    {item.selected_color && (
                                      <span className="text-xs text-muted-foreground">{item.selected_color}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 text-sm text-center">{item.quantity}</td>
                                <td className="p-3">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="0.00"
                                      className="pl-6 h-8 w-28"
                                      value={itemPrices[item.id] || ''}
                                      onChange={(e) => setItemPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    />
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      max="100"
                                      placeholder="0"
                                      className="h-8 w-20 pr-6 text-right"
                                      value={itemDiscounts[item.id] || ''}
                                      onChange={(e) => setItemDiscounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right text-sm">
                                  {hasDiscount ? (
                                    <div>
                                      <span className="text-xs text-muted-foreground line-through">€{unitPrice.toFixed(2)}</span>
                                      <div className="font-semibold text-primary">€{effectivePrice.toFixed(2)}</div>
                                    </div>
                                  ) : unitPrice > 0 ? (
                                    <span className="font-medium">€{unitPrice.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-right text-sm font-semibold">
                                  €{lineTotal.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals Summary */}
                    <div className="mt-6 flex justify-end">
                      <div className="w-72 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">€{pricingSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">VAT</span>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              className="h-7 w-16 text-center text-xs"
                              value={vatRate}
                              onChange={(e) => setVatRate(e.target.value)}
                            />
                            <span className="text-muted-foreground text-xs">%</span>
                          </div>
                          <span className="font-medium">€{pricingVatAmount.toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-3 flex justify-between">
                          <span className="font-semibold">Grand Total</span>
                          <span className="font-bold text-lg">€{pricingGrandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="mt-6 flex justify-end">
                      <Button onClick={handleSavePrices} disabled={savingPrices}>
                        {savingPrices ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="h-4 w-4 mr-2" /> Save Prices</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Extras Tab */}
          <TabsContent value="extras" className="space-y-5 mt-5">
            {/* Add Upsell Dropdown Section */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Gift className="h-4 w-4" /> Add Extra/Upsell
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Select an upsell from the dropdown and customize price, quantity, and measurement</p>
              </div>
              <div>
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
              </div>
            </div>

            {/* Attached Upsells */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Gift className="h-4 w-4" /> Attached Extras/Upsells
                </h3>
                <Badge variant="secondary">{quoteUpsells.length} items</Badge>
              </div>
              <div>
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
              </div>
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-5 mt-5">
            {/* Expected Deliveries Summary */}
            {(quote.items || []).some((item: any) => item.delivery_date) && (
              <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary mb-4">
                  <Truck className="h-4 w-4" /> Expected Deliveries
                </h3>
                <div className="space-y-2">
                  {(quote.items || []).filter((item: any) => item.delivery_date).map((item: any) => {
                    const name = !item.product_id
                      ? (item.custom_product_name || 'Custom Item')
                      : (item.product?.name || 'Product');
                    return (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{name}</span>
                          {item.room && <Badge variant="secondary" className="text-[10px]">{item.room}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{new Date(item.delivery_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add Timeline Step Dropdown Section */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <ListChecks className="h-4 w-4" /> Add Timeline Entry
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Add a step to the timeline, optionally linked to a specific product</p>
              </div>
              <div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  {/* Timeline Step Dropdown */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Step</label>
                    <Select value={selectedTimelineStepId} onValueChange={setSelectedTimelineStepId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose step..." />
                      </SelectTrigger>
                      <SelectContent>
                        {timelineSteps
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((step) => (
                            <SelectItem key={step.id} value={step.id}>
                              {step.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Product (optional) */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Product (optional)</label>
                    <Select value={selectedTimelineItemId} onValueChange={setSelectedTimelineItemId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All products" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">All products</SelectItem>
                        {(quote.items || []).map((item: any) => {
                          const name = !item.product_id
                            ? (item.custom_product_name || 'Custom Item')
                            : (item.product?.name || 'Product');
                          return (
                            <SelectItem key={item.id} value={item.id}>
                              {name}
                            </SelectItem>
                          );
                        })}
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
                  Add to Timeline
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
              </div>
            </div>

            {/* Timeline Steps List */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Milestone className="h-4 w-4" /> Project Timeline
                </h3>
                <Badge variant="secondary">{quoteTimeline.length} steps</Badge>
              </div>
              <div>
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
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{step.name}</h4>
                                {item.quote_item && (
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    <Package className="h-2.5 w-2.5 mr-1" />
                                    {item.quote_item.product?.name || item.quote_item.custom_product_name || 'Product'}
                                  </Badge>
                                )}
                              </div>
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
                                  [item.id]: e.target.value,
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
                                    value as 'pending' | 'in_progress' | 'completed' | 'skipped',
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
              </div>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="mt-5">
            {id && <QuoteActivityPanel quoteId={id} />}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Products Sheet */}
      {id && (
        <AddProductsSheet
          quoteId={id}
          open={isAddProductsOpen}
          onOpenChange={setIsAddProductsOpen}
          existingProductIds={(quote?.items || []).map((i: any) => i.product_id).filter(Boolean)}
          customerCompanyId={quote?.customer_company_id}
          customerContactId={quote?.customer_contact_id}
          onProductsAdded={loadQuoteDetails}
        />
      )}
    </div>
  );
};

