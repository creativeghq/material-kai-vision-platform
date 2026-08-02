import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, FileText, Package, User, DollarSign, Loader2, Plus, X, GitBranch, CheckCircle, Circle, PlayCircle, SkipForward, Gift, ListChecks, MessageSquare, Ruler, Boxes, Milestone, Activity, Timer, Save, Send, Truck, FilePlus2, Eye, BookmarkPlus } from 'lucide-react';
import { marketplacePricingService } from '@/services/marketplacePricingService';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal, parseDecimalOr } from '@/utils/decimal';
import { supabase } from '@/integrations/supabase/client';
import { quotesService, QuoteWithItems, Upsell, QuoteUpsell, TimelineStep, QuoteTimeline, QuoteItemWithProduct } from '../services/QuotesService';
import { AddressUnitSelect } from '@/modules/crm/components/AddressUnitSelect';
import { CustomerPicker, type QuoteCustomer } from '@/modules/quotes/components/CustomerPicker';
import { masterRequestsService } from '@/services/masterRequestsService';
import { quotePDFService } from '../services/QuotePDFService';
import { QuoteDownloadButtons } from '../components/QuoteDownloadButtons';
import { useQuoteDocument } from '../hooks/useQuoteDocument';
import { trackQuoteView } from '@/services/quoteAnalyticsService';
import { QuoteAnalyticsPanel } from '../components/QuoteAnalyticsPanel';
import { QuoteEmailButton } from '../components/QuoteEmailButton';
import { QuoteStatusBadge } from '@/lib/quoteStatus';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { QuoteItemsList } from '../components/QuoteItemsList';
import { AddProductsSheet } from '../components/AddProductsSheet';
import { QuoteShippingCard } from '../components/QuoteShippingCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { QuoteActivityPanel } from '@/modules/finance/components/QuoteActivityPanel';
import { IssueInvoiceButton } from '@/modules/finance/components/IssueInvoiceButton';
import { formatMoney, financeService } from '@/modules/finance/services/financeService';
import { Switch } from '@/components/core/ui/switch';
import { previewTotalsBreakdown } from '@/modules/quotes/utils/quoteTotals';

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
  // NOTE: `statusTags` used to be fetched here on every mount via quotesService.getStatusTags().
  // Its only reader was a `selectedTag` derivation that nothing rendered, so the whole chain —
  // request, state, derived value — produced nothing. Removed rather than left as a network
  // call whose result is discarded.
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [quoteUpsells, setQuoteUpsells] = useState<QuoteUpsell[]>([]);
  const [loadingUpsells, setLoadingUpsells] = useState(false);

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
  // #237 — per-line "save this typed price to the workspace catalog" so it's pulled next time.
  const [savingCatalogId, setSavingCatalogId] = useState<string | null>(null);
  // #227 — order-level paid-upfront (cash) discount
  const [paidUpfront, setPaidUpfront] = useState(false);
  const [cashPct, setCashPct] = useState(0);
  const [negMarginPolicy, setNegMarginPolicy] = useState<string>('warn');
  const [salesCanSeeCost, setSalesCanSeeCost] = useState(true);
  useEffect(() => {
    if (!quote) return;
    setPaidUpfront(!!(quote as any).paid_upfront);
    const ws = (quote as any).workspace_id;
    if (ws) {
      financeService.getActiveCashDiscountPct(ws).then(setCashPct).catch(() => {});
      financeService.getSettings(ws).then((s) => {
        setNegMarginPolicy((s as any)?.negative_margin_policy || 'warn');
        setSalesCanSeeCost((s as any)?.sales_can_see_cost !== false);
      }).catch(() => {
        // Fail SAFE instead of silently keeping the permissive defaults: hide cost from sales (rather
        // than defaulting to visible) and tell the operator the finance policy didn't load — so a
        // workspace configured to BLOCK negative-margin quotes isn't silently shown as warn-only.
        setSalesCanSeeCost(false);
        toast({
          title: 'Finance settings could not be loaded',
          description: 'Cost is hidden and margin controls may be limited until this loads — refresh to retry.',
          variant: 'destructive',
        });
      });
    }
  }, [quote?.id]);

  // PDF progress is owned by QuoteDownloadButtons (its own `generating` flag). This page briefly
  // kept its own generatingPDF/downloadingPDF/updatingStatus mirrors of it; nothing ever set or
  // read them, so they were removed rather than left looking like busy-state protection.
  const [sendingQuote, setSendingQuote] = useState(false);

  // HTML/client-side PDF — hook must be at top level (before any early returns)
  const { data: docData } = useQuoteDocument(id || '');

  useEffect(() => {
    if (id) {
      trackQuoteView(id, 'admin');
      loadQuoteDetails();
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
        custom_price: upsellPrice ? parseDecimal(upsellPrice) ?? undefined : undefined,
        quantity: upsellQuantity ? parseDecimalOr(upsellQuantity, 1) : 1,
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
    const price = parseDecimalOr(itemPrices[itemId], 0);
    const discountPct = parseDecimalOr(itemDiscounts[itemId], 0);
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

  const pricingVatRate = parseDecimalOr(vatRate, 0);
  // #227 — paid-upfront (cash) discount applies to the net subtotal before VAT.
  const pricingCashPct = paidUpfront ? cashPct : 0;

  // Accepted upsells only, honouring metadata.custom_price / metadata.quantity — the same
  // rule get_quote_totals() and QuotesService.recalculateQuoteExtrasTotal use. The display
  // tally further down used to sum EVERY upsell at its catalog price, accepted or not.
  const pricingExtrasTotal = quoteUpsells.reduce((sum, qu) => {
    if (qu.customer_accepted !== true) return sum;
    const meta = (qu.metadata ?? {}) as { custom_price?: number; quantity?: number };
    const upsell = upsells.find(u => u.id === qu.upsell_id);
    const price = meta.custom_price ?? upsell?.price ?? 0;
    return sum + price * (meta.quantity ?? 1);
  }, 0);

  // The operator approves THIS preview, so it has to agree to the cent with what
  // reprice_quote_items will persist. previewTotalsBreakdown mirrors get_quote_totals
  // step for step; the arithmetic that used to live here was the second of three
  // divergent implementations (audit #307 finding 17) and folded in no extras, so the
  // operator approved a Final that excluded upsells the customer had already accepted
  // (finding 18).
  const pricingPreview = previewTotalsBreakdown({
    subtotal: pricingSubtotal,
    cashDiscountPct: pricingCashPct,
    extrasTotal: pricingExtrasTotal,
    vatRate: pricingVatRate,
  });
  const pricingCashDiscount = pricingPreview.discount;
  const pricingVatAmount = pricingPreview.vat;
  const pricingGrandTotal = pricingPreview.final;

  const allItemsHavePrices = (quote?.items || []).length > 0 &&
    (quote?.items || []).every(item => {
      const price = parseDecimal(itemPrices[item.id]);
      return price !== null && price > 0;
    });

  // #237 — remember a typed unit price in the workspace catalog (product_prices.list_price),
  // so the resolver pulls it automatically on the next quote. Saves the pre-discount unit
  // price (the list anchor) — customer discounts still apply on top per-customer.
  const handleSaveToCatalog = async (item: QuoteItemWithProduct, listPrice: number) => {
    if (!item.product_id || !(listPrice > 0) || !quote?.workspace_id) return;
    setSavingCatalogId(item.id);
    try {
      await marketplacePricingService.setListPrice(quote.workspace_id, item.product_id, listPrice, {
        unit: (item.product as any)?.metadata?.unit ?? null,
      });
      toast({ title: 'Saved to catalog', description: 'This price will be pulled automatically next time.' });
    } catch (err: any) {
      toast({ title: 'Could not save to catalog', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingCatalogId(null);
    }
  };

  const handleSavePrices = async () => {
    if (!quote?.id || !quote.items) return;
    // #227 — negative-margin guardrail (block / require_approval prevent saving below cost)
    if (negMarginPolicy === 'block' || negMarginPolicy === 'require_approval') {
      const neg = (quote.items || []).filter((item) => {
        const price = getItemEffectivePrice(item.id);
        const cost = (item as any).cost_snapshot != null ? Number((item as any).cost_snapshot)
          : (item.product as any)?.cost != null ? Number((item.product as any).cost) : null;
        return cost != null && price > 0 && price < cost;
      });
      if (neg.length > 0) {
        toast({
          title: 'Below-cost pricing blocked',
          description: `${neg.length} line(s) are priced below cost. ${negMarginPolicy === 'require_approval' ? 'Finance approval is required for negative margin.' : 'Adjust the price, or change the policy in Finance → Settings → Pricing.'}`,
          variant: 'destructive',
        });
        return;
      }
    }
    try {
      setSavingPrices(true);
      const items = quote.items.map(item => {
        const unitPrice = parseDecimalOr(itemPrices[item.id], 0);
        const discountPct = parseDecimalOr(itemDiscounts[item.id], 0);
        const effectivePrice = getItemEffectivePrice(item.id);
        const discountedPrice = discountPct > 0 ? effectivePrice : null;
        return {
          id: item.id,
          unit_price: unitPrice,
          discounted_price: discountedPrice,
          line_total: effectivePrice * item.quantity,
        };
      });
      // #227 — persist the paid-upfront flag first so saveItemPrices applies the cash discount.
      await supabase.from('quotes').update({ paid_upfront: paidUpfront }).eq('id', quote.id);
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
            Back to quotes
          </Button>
        </div>
      </div>
    );
  }

  const itemCount = quote.items?.length || quote.total_items || 0;
  const extrasTotal = pricingExtrasTotal;

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
            Back to quotes
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
              viewContext="admin"
            />

            {/* Email the quote to the customer (or a typed recipient) */}
            <QuoteEmailButton quoteId={quote.id} onSent={loadQuoteDetails} />

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

            {/* Sales/Finance: Issue invoice (creates internal invoice row from accepted quote) */}
            {quote && <IssueInvoiceButton quoteId={quote.id} quoteStatus={quote.status} />}

            {/* Project Workspace: Issue revision — clones quote + items, bumps revision_number, sets parent_quote_id.
                Available once the quote is no longer a draft (i.e. has been sent / quoted / accepted / rejected). */}
            {quote && (quote.status === 'submitted' || quote.status === 'quoted' || quote.status === 'accepted' || quote.status === 'rejected' || quote.status === 'expired') && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!confirm('Create a new revision of this quote? The current quote stays as-is; a new draft revision is created with all items copied over.')) return;
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
                Issue revision
              </Button>
            )}

            {/* Marketplace: derive an end-user (client) quote at +margin from this (procurement) quote. */}
            {quote && (quote as any).quote_role !== 'client' && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const raw = window.prompt('Margin % to add on top for the end user?', '20');
                  if (raw === null) return;
                  const margin = parseDecimal(raw);
                  if (margin === null || margin < 0) {
                    toast({ title: 'Enter a valid margin %', variant: 'destructive' });
                    return;
                  }
                  try {
                    const newId = await quotesService.generateClientQuote(quote.id, margin);
                    toast({ title: 'Client quote created', description: `+${margin}% margin · opening the draft…` });
                    navigate(`/admin/quotes/${newId}`);
                  } catch (err) {
                    toast({ title: 'Failed to generate', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
                  }
                }}
                className="rounded-full"
              >
                <FilePlus2 className="h-4 w-4 mr-1" />
                Generate for end user
              </Button>
            )}

            {/* Marketplace: submit a procurement quote up to the parent node to be priced. */}
            {quote && (quote as any).quote_role !== 'client' && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={async () => {
                  try {
                    await masterRequestsService.submit(quote.id);
                    toast({ title: 'Submitted to your parent node', description: 'Track it under Requests.' });
                  } catch (err) {
                    toast({ title: 'Failed to submit', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
                  }
                }}
              >
                <Send className="h-4 w-4 mr-1" />
                Submit to parent
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

        {/* Customer — editable so a quote created without one (the common case from the New Quote
            modal / Add-to-Quote) can be given a party: drives pricing pyramid, email recipient,
            bill-to on invoicing. */}
        <QuoteCustomerRow
          quoteId={quote.id}
          companyId={quote.customer_company_id ?? null}
          contactId={quote.customer_contact_id ?? null}
          onSaved={loadQuoteDetails}
        />

        {/* Bill-to address — choose the customer's main address or one of their sub-units.
            Self-hides when the party has no sub-units. Propagates to the invoice on conversion. */}
        {(quote.customer_company_id || quote.customer_contact_id) && (
          <AddressUnitSelect
            className="max-w-md"
            companyId={quote.customer_company_id}
            contactId={quote.customer_contact_id}
            value={quote.customer_address_unit_id ?? null}
            label="Bill-to address"
            onChange={async (unitId) => {
              await quotesService.updateQuote(quote.id, { customer_address_unit_id: unitId } as any);
              await loadQuoteDetails();
            }}
          />
        )}

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
            <TabsTrigger value="items" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Items ({itemCount})
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing
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
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Items Tab */}
          <TabsContent value="items" className="mt-5">
            <QuoteItemsList
              items={quote.items || []}
              variant="detailed"
              showAddButton={quote.status !== 'accepted' && quote.status !== 'rejected'}
              salesCanSeeCost={salesCanSeeCost}
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
              onRefresh={loadQuoteDetails}
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
                            const unitPrice = parseDecimalOr(itemPrices[item.id], 0);
                            const discountPct = parseDecimalOr(itemDiscounts[item.id], 0);
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
                                  <div className="flex items-center gap-1">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        className="pl-6 h-8 w-28"
                                        value={itemPrices[item.id] || ''}
                                        onChange={(e) => setItemPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      />
                                    </div>
                                    {/* #237 — save this typed price to the catalog so it's pulled next time (catalog products only). */}
                                    {item.product_id && unitPrice > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0"
                                        title="Save this price to the catalog (pulled automatically next time)"
                                        disabled={savingCatalogId === item.id}
                                        onClick={() => handleSaveToCatalog(item, unitPrice)}
                                      >
                                        {savingCatalogId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="relative">
                                    <Input
                                      type="text"
                                      inputMode="decimal"
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
                        {/* #227 — paid-upfront (cash) discount */}
                        <div className="flex items-center justify-between text-sm">
                          <label className="flex items-center gap-2 text-muted-foreground">
                            <Switch checked={paidUpfront} onCheckedChange={setPaidUpfront} />
                            Paid upfront (cash){cashPct > 0 ? ` − ${cashPct}%` : ''}
                          </label>
                          {pricingCashDiscount > 0 && (
                            <span className="font-medium text-primary">− €{pricingCashDiscount.toFixed(2)}</span>
                          )}
                        </div>
                        {paidUpfront && cashPct === 0 && (
                          <p className="text-[11px] text-muted-foreground">No cash-payment rule set — configure it in Finance → Settings → Pricing.</p>
                        )}
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">VAT</span>
                            <Input
                              type="text"
                              inputMode="decimal"
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
            {/* Shipping — freight quote (SeaRates BYOK → instant; else operator) → add as a quote line */}
            <QuoteShippingCard
              quoteId={quote.id}
              editable={quote.status !== 'accepted' && quote.status !== 'rejected'}
              onAdded={loadQuoteDetails}
            />

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
                    <label htmlFor="quotedetailadminpage-select-upsell" className="text-sm font-medium mb-2 block">Select Upsell</label>
                    <Select value={selectedUpsellId} onValueChange={setSelectedUpsellId}>
                      <SelectTrigger id="quotedetailadminpage-select-upsell" className="w-full">
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
                    <label htmlFor="quotedetailadminpage-price" className="text-sm font-medium mb-2 block">
                      <DollarSign className="h-3 w-3 inline mr-1" />
                      Price (€)
                    </label>
                    <Input id="quotedetailadminpage-price"
                      type="text"
                      inputMode="decimal"
                      placeholder="Custom price"
                      value={upsellPrice}
                      onChange={(e) => setUpsellPrice(e.target.value)}
                    />
                  </div>

                  {/* Quantity */}
                  <div>
                    <label htmlFor="quotedetailadminpage-quantity" className="text-sm font-medium mb-2 block">
                      <Ruler className="h-3 w-3 inline mr-1" />
                      Quantity
                    </label>
                    <Input id="quotedetailadminpage-quantity"
                      type="text"
                      inputMode="decimal"
                      placeholder="1"
                      value={upsellQuantity}
                      onChange={(e) => setUpsellQuantity(e.target.value)}
                    />
                  </div>

                  {/* Measurement */}
                  <div>
                    <label htmlFor="quotedetailadminpage-measurement" className="text-sm font-medium mb-2 block">Measurement</label>
                    <Input id="quotedetailadminpage-measurement"
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
                                <span className={`text-xs ${quoteUpsell.customer_accepted ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                  {quoteUpsell.customer_accepted ? 'Accepted' : 'Rejected'}
                                </span>
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
                    <label htmlFor="quotedetailadminpage-step" className="text-sm font-medium mb-2 block">Step</label>
                    <Select value={selectedTimelineStepId} onValueChange={setSelectedTimelineStepId}>
                      <SelectTrigger id="quotedetailadminpage-step" className="w-full">
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
                    <label htmlFor="quotedetailadminpage-product-optional" className="text-sm font-medium mb-2 block">Product (optional)</label>
                    <Select value={selectedTimelineItemId} onValueChange={setSelectedTimelineItemId}>
                      <SelectTrigger id="quotedetailadminpage-product-optional" className="w-full">
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
                    <label htmlFor="quotedetailadminpage-note-optional" className="text-sm font-medium mb-2 block">
                      <MessageSquare className="h-3 w-3 inline mr-1" />
                      Note (optional)
                    </label>
                    <Textarea id="quotedetailadminpage-note-optional"
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
                              <span className={`text-xs capitalize ${statusTone(item.status)}`}>
                                {item.status.replace('_', ' ')}
                              </span>
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
                              <label htmlFor="quotedetailadminpage-note" className="text-xs font-medium text-muted-foreground mb-1 block">
                                <MessageSquare className="h-3 w-3 inline mr-1" />
                                Note
                              </label>
                              <Textarea id="quotedetailadminpage-note"
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

          {/* Analytics Tab — views / previews / downloads + public share link */}
          <TabsContent value="analytics" className="mt-5">
            {id && (
              <QuoteAnalyticsPanel
                quoteId={id}
                publicShareEnabled={(quote as any).public_share_enabled ?? false}
                publicShareToken={(quote as any).public_share_token ?? null}
                onShareChange={loadQuoteDetails}
              />
            )}
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

/** Editable customer on the quote — resolves the current party's name, lets the operator set/change
 *  it, and writes the mutually-exclusive company/contact pair back via updateQuote. */
const QuoteCustomerRow: React.FC<{ quoteId: string; companyId: string | null; contactId: string | null; onSaved: () => void }> = ({ quoteId, companyId, contactId, onSaved }) => {
  const [cust, setCust] = useState<QuoteCustomer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (companyId) {
        const { data } = await supabase.from('crm_companies').select('name').eq('id', companyId).maybeSingle();
        if (!cancelled) setCust({ type: 'company', id: companyId, label: `${(data as any)?.name ?? 'Customer'} (company)` });
      } else if (contactId) {
        const { data } = await supabase.from('crm_contacts').select('name').eq('id', contactId).maybeSingle();
        if (!cancelled) setCust({ type: 'contact', id: contactId, label: (data as any)?.name ?? 'Customer' });
      } else if (!cancelled) setCust(null);
    })();
    return () => { cancelled = true; };
  }, [companyId, contactId]);

  return (
    <div className="max-w-md">
      <CustomerPicker
        value={cust}
        label="Customer"
        onChange={async (v) => {
          setCust(v);
          await quotesService.updateQuote(quoteId, {
            customer_company_id: v?.type === 'company' ? v.id : null,
            customer_contact_id: v?.type === 'contact' ? v.id : null,
          });
          onSaved();
        }}
      />
    </div>
  );
};

