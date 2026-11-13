import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Package, DollarSign, Loader2, Plus, X, GitBranch, CheckCircle, Circle, PlayCircle, SkipForward, Gift, ListChecks, MessageSquare, Boxes, Milestone, Activity, Save, Send, Truck, FilePlus2, Eye, BookmarkPlus, FileSignature, Receipt, MoreHorizontal, Download, ScrollText, Sparkles } from 'lucide-react';
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
import { ProjectLinkField } from '@/modules/finance/components/ProjectLinkField';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { CustomerPicker, type QuoteCustomer } from '@/modules/quotes/components/CustomerPicker';
import { masterRequestsService } from '@/services/masterRequestsService';
import { quotePDFService } from '../services/QuotePDFService';
import { trackQuoteView } from '@/services/quoteAnalyticsService';
import { QuoteAnalyticsPanel } from '../components/QuoteAnalyticsPanel';
import { QuoteEmailButton } from '../components/QuoteEmailButton';
import { SendOnWhatsAppButton } from '@/modules/messaging/components/SendOnWhatsAppButton';
import { QuoteStatusBadge } from '@/lib/quoteStatus';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { QuoteItemsList } from '../components/QuoteItemsList';
import { AddProductsSheet } from '../components/AddProductsSheet';
import { QuoteShippingCard } from '../components/QuoteShippingCard';
import { QuoteTermsEditor } from '../components/QuoteTermsEditor';
import { QuoteStatusMenu } from '../components/QuoteStatusActions';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubRecordPage, HubPanel, HubProperty, HubPropertyList } from '@/components/core/hub';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { useDisplayProfile } from '@/hooks/useDisplayProfile';
import { humanizeLabel } from '@/utils/humanize';
import { QuoteDealLink } from '../components/QuotePipelineDialog';
import { QuoteLineBuyPrice } from '../components/QuoteLineBuyPrice';
import { ClientQuoteDialog } from '../components/ClientQuoteDialog';
import type { BuyPriceSuggestion } from '../services/QuotesService';
import { quoteUrl, QUOTES_BASE } from '../routes';
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
import { QuoteEconomicsTiles } from '../components/QuoteEconomicsTiles';
import { Switch } from '@/components/core/ui/switch';
import { previewTotalsBreakdown } from '@/modules/quotes/utils/quoteTotals';
import { formatDate } from '@/utils/datetime';
import { PnlExclusionToggle } from '@/modules/finance/components/PnlExclusionToggle';

const sendQuoteNotification = (userId: string, title: string, quoteId: string) => {
  supabase.from('user_notifications').insert({
    user_id: userId,
    type: 'quote_updated',
    title,
    body: null,
    action_url: quoteUrl(quoteId),
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
  /** The order + pre-invoice the accept trigger produced (#378 C1). Read-only. */
  const [quoteDocs, setQuoteDocs] = useState<{
    order: { id: string; order_number: string | null; status: string } | null;
    preInvoice: { id: string; internal_number: string | null; status: string } | null;
  }>({ order: null, preInvoice: null });
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
  const [upsellIncluded, setUpsellIncluded] = useState(true);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraDescription, setNewExtraDescription] = useState('');
  const [addingUpsell, setAddingUpsell] = useState(false);
  const [decidingUpsellId, setDecidingUpsellId] = useState<string | null>(null);

  // Timeline notes state (for editing notes on existing timeline items)
  const [editingTimelineNotes, setEditingTimelineNotes] = useState<Record<string, string>>({});

  // Add Products Sheet state
  const [isAddProductsOpen, setIsAddProductsOpen] = useState(false);
  const [buySuggestions, setBuySuggestions] = useState<Record<string, BuyPriceSuggestion>>({});
  const [findingBuy, setFindingBuy] = useState(false);
  const [hasParentNode, setHasParentNode] = useState(false);
  const [clientQuoteOpen, setClientQuoteOpen] = useState(false);

  // Pricing state
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, string>>({});
  const [vatRate, setVatRate] = useState<string>('24');
  const [savingPrices, setSavingPrices] = useState(false);
  // per-line "save this typed price to the workspace catalog" so it's pulled next time.
  const [savingCatalogId, setSavingCatalogId] = useState<string | null>(null);
  // order-level paid-upfront (cash) discount
  const [paidUpfront, setPaidUpfront] = useState(false);
  const [cashPct, setCashPct] = useState(0);
  const [negMarginPolicy, setNegMarginPolicy] = useState<string>('warn');
  const [salesCanSeeCost, setSalesCanSeeCost] = useState(true);
  const [costAllowed, setCostAllowed] = useState(false);
  const showCost = salesCanSeeCost && costAllowed;
  useEffect(() => {
    const qid = quote?.id;
    if (!qid) { setCostAllowed(false); return; }
    let cancelled = false;
    void (supabase as any).rpc('user_can_see_quote_buy_prices', { p_quote_id: qid })
      .then(({ data }: { data: unknown }) => { if (!cancelled) setCostAllowed(data === true); });
    return () => { cancelled = true; };
  }, [quote?.id]);

  useEffect(() => {
    const ws = quote?.workspace_id;
    if (!ws) { setHasParentNode(false); return; }
    void supabase.from('workspaces').select('parent_workspace_id').eq('id', ws).maybeSingle()
      .then(({ data }) => setHasParentNode(!!(data as any)?.parent_workspace_id));
  }, [quote?.workspace_id]);

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

  const [sendingQuote, setSendingQuote] = useState(false);
  const [acceptingQuote, setAcceptingQuote] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  useEffect(() => {
    if (id) {
      trackQuoteView(id, 'admin');
      loadQuoteDetails();
      loadQuoteUpsells();
      loadTimelineData();
    }
  }, [id]);

  const loadQuoteDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      // The seller view: margin, the retail/discount breakdown and the below-cost guardrail all
      // need the live product cost when a line has no `cost_snapshot` yet. The customer page
      // asks without it (#368 follow-up).
      const data = await quotesService.getQuote(id, { includeCost: true });
      setQuote(data);
      // Best-effort: the quote renders with or without them, so a failure here must not blank
      // the page. Absent simply means the accept trigger has not run for this quote.
      void quotesService.getQuoteDocuments(id)
        .then((d) => setQuoteDocs(d as any))
        .catch(() => setQuoteDocs({ order: null, preInvoice: null }));
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
      const data = await quotesService.getUpsells(true, quote?.workspace_id ?? null);
      setUpsells(data);
    } catch (error) {
      console.error('Error loading upsells:', error);
    }
  };

  useEffect(() => {
    if (quote?.workspace_id) void loadUpsells();
  }, [quote?.workspace_id]);

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

  const NEW_EXTRA = '__new__';
  const handleAddUpsellFromDropdown = async () => {
    if (!id || !selectedUpsellId) return;
    const isNew = selectedUpsellId === NEW_EXTRA;
    const price = upsellPrice ? parseDecimal(upsellPrice) : null;
    if (isNew && (!newExtraName.trim() || price === null || price < 0)) {
      toast({ title: 'Name the extra and give it a price', variant: 'destructive' });
      return;
    }
    try {
      setAddingUpsell(true);
      // A new extra joins this workspace's extras list, so it can be offered on the next quote too.
      const upsellId = isNew
        ? (await quotesService.createUpsell({
            name: newExtraName.trim(),
            description: newExtraDescription.trim() || undefined,
            price: price ?? 0,
            workspace_id: quote?.workspace_id ?? null,
          })).id
        : selectedUpsellId;
      const metadata = {
        custom_price: !isNew && price !== null ? price : undefined,
        quantity: upsellQuantity ? parseDecimalOr(upsellQuantity, 1) : 1,
        measurement: upsellMeasurement || undefined,
      };
      await quotesService.addUpsellToQuote(id, upsellId, undefined, metadata, upsellIncluded ? true : null);
      toast({
        title: 'Extra added',
        description: upsellIncluded ? 'Included and charged on this quote.' : 'Offered as optional — the customer decides.',
      });
      setSelectedUpsellId('');
      setUpsellPrice('');
      setUpsellQuantity('1');
      setUpsellMeasurement('');
      setNewExtraName('');
      setNewExtraDescription('');
      await Promise.all([loadQuoteUpsells(), isNew ? loadUpsells() : Promise.resolve()]);
    } catch (error) {
      toast({ title: 'Could not add the extra', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setAddingUpsell(false);
    }
  };

  const handleSetUpsellInclusion = async (quoteUpsellId: string, included: boolean | null) => {
    try {
      setDecidingUpsellId(quoteUpsellId);
      await quotesService.setUpsellInclusion(quoteUpsellId, included);
      await loadQuoteUpsells();
    } catch (error) {
      toast({ title: 'Could not update the extra', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setDecidingUpsellId(null);
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
  // paid-upfront (cash) discount applies to the net subtotal before VAT.
  const pricingCashPct = paidUpfront ? cashPct : 0;

  // Accepted upsells only, honouring metadata.custom_price / metadata.quantity — the same
  // rule get_quote_totals() and QuotesService.recalculateQuoteExtrasTotal use. The display
  // tally further down used to sum EVERY upsell at its catalog price, accepted or not.
  const pricingExtrasTotal = quoteUpsells.reduce((sum, qu) => {
    if (qu.customer_accepted !== true) return sum;
    const meta = (qu.metadata ?? {}) as { custom_price?: number; quantity?: number };
    const upsell = qu.upsell ?? upsells.find(u => u.id === qu.upsell_id);
    const price = meta.custom_price ?? upsell?.price ?? 0;
    return sum + price * (meta.quantity ?? 1);
  }, 0);

  // The operator approves THIS preview, so it has to agree to the cent with what
  // reprice_quote_items will persist. previewTotalsBreakdown mirrors get_quote_totals step for
  // step — never re-implement the arithmetic here. A local copy that folds in no extras has the
  // operator approving a Final that excludes upsells the customer already accepted.
  const pricingPreview = previewTotalsBreakdown({
    subtotal: pricingSubtotal,
    cashDiscountPct: pricingCashPct,
    extrasTotal: pricingExtrasTotal,
    vatRate: pricingVatRate,
  });
  const pricingCashDiscount = pricingPreview.discount;
  const pricingVatAmount = pricingPreview.vat;
  const pricingGrandTotal = pricingPreview.final;

  // Typed in the Pricing tab but not saved: accepting now would bill the stored prices instead.
  const pricesDirty = (quote?.items || []).some((item) => {
    const saved = item.unit_price ?? null;
    const typed = parseDecimal(itemPrices[item.id]);
    return (typed ?? null) !== (saved === null ? null : Number(saved));
  });

  const allItemsHavePrices = (quote?.items || []).length > 0 &&
    (quote?.items || []).every(item => {
      const price = parseDecimal(itemPrices[item.id]);
      return price !== null && price > 0;
    });

  // Remember a typed unit price in the workspace catalog (product_prices.list_price),
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
    // negative-margin guardrail (block / require_approval prevent saving below cost)
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
        };
      });
      // Persist the paid-upfront flag first so saveItemPrices applies the cash discount.
      //
      // This one is money. `saveItemPrices` reads the flag back off the row, so a silently
      // rejected write meant the cash discount was NOT applied while the prices saved and the
      // user was told "Prices saved" — a quote priced without a discount the operator had
      // ticked. supabase-js resolves on an RLS denial instead of throwing, so the surrounding
      // try/catch never saw it (#347 audit).
      const { error: flagErr } = await supabase.from('quotes')
        .update({ paid_upfront: paidUpfront }).eq('id', quote.id);
      if (flagErr) throw flagErr;
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



  /**
   * Mark the quote accepted, from the screen the operator actually works on.
   *
   * `acceptQuote` had three callers and all three were the CUSTOMER's: the public share link and
   * two customer-facing pages. Acceptance is what mints the order AND the draft pre-invoice, so a
   * sale closed over WhatsApp or on the phone could not be entered at all — the operator had to
   * open the customer route or wait for a link to be clicked. The validation (expiry, unpriced
   * lines, undecided upsells) lives in the service and is the same for both.
   */
  const handleAcceptQuote = async () => {
    if (!quote) return;
    try {
      setAcceptingQuote(true);
      const res = await quotesService.acceptQuote(quote.id);
      if (!res.success) {
        // The service's own words — it distinguishes an expired quote from an unpriced line from
        // an undecided upsell, and each needs a different response from the operator.
        toast({ title: 'Could not accept the quote', description: res.error ?? 'Nothing was changed.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Quote accepted', description: 'The order and a draft invoice have been created.' });
      await loadQuoteDetails();
    } catch (err) {
      toast({ title: 'Could not accept the quote', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setAcceptingQuote(false);
    }
  };

  const handleFindBuyPrices = async () => {
    if (!quote) return;
    try {
      setFindingBuy(true);
      const lines = await quotesService.findBuyPrices(quote.id);
      setBuySuggestions(Object.fromEntries(lines.map((l) => [l.line_id, l])));
      const found = lines.filter((l) => l.match).length;
      toast({
        title: found > 0 ? `Found a buy price for ${found} of ${lines.length} lines` : 'None of these lines is in your price lists',
        description: found < lines.length ? 'The rest are not in your supplier price lists. Enter those by hand.' : undefined,
      });
    } catch (err) {
      toast({ title: 'Could not search the price lists', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setFindingBuy(false);
    }
  };

  /**
   * One click from a priced quote to a draft invoice of its lines. Acceptance is the ONE writer of
   * the order + draft pre-invoice (`_generate_order_from_quote_core`), so this accepts and opens it.
   */
  const handleCreateDraftInvoice = async () => {
    if (!quote) return;
    if (quoteDocs.preInvoice) {
      navigate(`${FINANCE_BASE}/invoices/${quoteDocs.preInvoice.id}`);
      return;
    }
    if (pricesDirty) {
      toast({ title: 'Save the prices first', description: 'The Pricing tab has changes that are not saved yet.', variant: 'destructive' });
      return;
    }
    if (!confirm('Create a draft invoice from this quote? The quote is marked accepted, which creates the order and a draft invoice with these lines and extras. The invoice stays a draft until you issue it.')) return;
    try {
      setCreatingInvoice(true);
      const res = await quotesService.acceptQuote(quote.id);
      if (!res.success) {
        toast({ title: 'Could not create the invoice', description: res.error ?? 'Nothing was changed.', variant: 'destructive' });
        return;
      }
      const docs = await quotesService.getQuoteDocuments(quote.id);
      if (docs.preInvoice) {
        toast({ title: 'Draft invoice created', description: docs.preInvoice.internal_number ?? undefined });
        navigate(`${FINANCE_BASE}/invoices/${docs.preInvoice.id}`);
      } else {
        toast({ title: 'Quote accepted', description: 'The order was created but no draft invoice was found — check Finance → Invoices.', variant: 'destructive' });
        await loadQuoteDetails();
      }
    } catch (err) {
      toast({ title: 'Could not create the invoice', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCreatingInvoice(false);
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
          <Button onClick={() => navigate(QUOTES_BASE)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to quotes
          </Button>
        </div>
      </div>
    );
  }

  const itemCount = quote.items?.length || quote.total_items || 0;
  const extrasTotal = pricingExtrasTotal;
  const editableStatus = ['draft', 'submitted', 'quoted'].includes(quote.status);
  const unpricedReason = allItemsHavePrices ? undefined : 'Price every line in the Pricing tab first';
  const procurement = hasParentNode && (quote as any).quote_role !== 'client';
  const canRevise = ['submitted', 'quoted', 'accepted', 'rejected', 'expired'].includes(quote.status);
  const title = quote.name || 'Untitled Quote';
  const subtitle = [
    quote.quote_number,
    `Created ${formatDate(quote.created_at)}`,
    quote.expires_at ? `Expires ${formatDate(quote.expires_at)}` : null,
  ].filter(Boolean).join(' · ');

  const issueRevision = async () => {
    if (!confirm('Create a new revision of this quote? The current quote stays as-is; a new draft revision is created with all items copied over.')) return;
    try {
      const newQuote = await quotesService.issueRevision(quote.id);
      toast({ title: `Revision ${newQuote.revision_number} created`, description: 'Opening the new draft...' });
      navigate(quoteUrl(newQuote.id));
    } catch (err) {
      toast({ title: 'Failed to issue revision', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const submitToParent = async () => {
    try {
      await masterRequestsService.submit(quote.id);
      toast({ title: 'Submitted to your parent node', description: 'Track it under Requests.' });
    } catch (err) {
      toast({ title: 'Failed to submit', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  };

  const downloadPdf = async () => {
    const result = await quotePDFService.savePDF(quote.id, quote.quote_number);
    if (result.success) toast({ title: 'PDF downloaded', description: result.filename });
    else toast({ title: 'PDF download failed', description: result.error, variant: 'destructive' });
  };

  const actions = (
    <>
      <QuoteStatusMenu
        quote={quote}
        onChanged={loadQuoteDetails}
        onMarkSent={() => void handleSendQuote()}
        onAccept={() => void handleAcceptQuote()}
        blockedReason={unpricedReason}
        working={sendingQuote || acceptingQuote}
      />
      <QuoteEmailButton quoteId={quote.id} onSent={loadQuoteDetails} />
      {editableStatus && !quoteDocs.preInvoice && (
        <Button size="sm" onClick={handleCreateDraftInvoice} disabled={creatingInvoice || !allItemsHavePrices} title={unpricedReason}>
          {creatingInvoice
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</>
            : <><Receipt className="h-4 w-4 mr-1" /> Create draft invoice</>}
        </Button>
      )}
      <IssueInvoiceButton quoteId={quote.id} quoteStatus={quote.status} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => window.open(`/quotes/${quote.id}/preview`, '_blank')}>
            <Eye className="mr-2 h-4 w-4" /> Preview
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void downloadPdf()}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </DropdownMenuItem>
          {(canRevise || procurement) && <DropdownMenuSeparator />}
          {canRevise && (
            <DropdownMenuItem onSelect={() => void issueRevision()}>
              <FilePlus2 className="mr-2 h-4 w-4" /> Issue revision
            </DropdownMenuItem>
          )}
          {procurement && (
            <>
              <DropdownMenuItem onSelect={() => setClientQuoteOpen(true)}>
                <FilePlus2 className="mr-2 h-4 w-4" /> Generate for end user
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void submitToParent()}>
                <Send className="mr-2 h-4 w-4" /> Submit to parent
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const left = (
    <>
      <HubPanel title="Details">
        <HubPropertyList>
          <HubProperty label="Status">
            <QuoteStatusBadge status={quote.status} />
            {quote.status === 'rejected' && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Declined{quote.rejected_at ? ` ${formatDate(quote.rejected_at)}` : ''}: {quote.rejection_reason || 'no reason recorded'}
              </span>
            )}
          </HubProperty>
          <HubProperty label="Customer">
            <QuoteCustomerRow
              quoteId={quote.id}
              companyId={quote.customer_company_id ?? null}
              contactId={quote.customer_contact_id ?? null}
              onSaved={loadQuoteDetails}
            />
          </HubProperty>
          {(quote.customer_company_id || quote.customer_contact_id) && (
            <AddressUnitSelect
              className="py-1.5"
              companyId={quote.customer_company_id}
              contactId={quote.customer_contact_id}
              value={quote.customer_address_unit_id ?? null}
              label="Bill-To Address"
              onChange={async (unitId) => {
                await quotesService.updateQuote(quote.id, { customer_address_unit_id: unitId } as any);
                await loadQuoteDetails();
              }}
            />
          )}
          {quote.workspace_id && (
            <HubProperty label="Project">
              <ProjectLinkField
                compact
                workspaceId={quote.workspace_id}
                projectId={(quote as any).project_id ?? null}
                onChange={async (projectId) => {
                  await quotesService.updateQuote(quote.id, { project_id: projectId });
                  await loadQuoteDetails();
                }}
              />
            </HubProperty>
          )}
          <HubProperty label="Pipeline">
            <QuoteDealLink quote={quote as any} editable={quote.status !== 'superseded'} onChanged={loadQuoteDetails} />
          </HubProperty>
          <HubProperty label="Created By"><QuoteCreatorName userId={quote.user_id} /></HubProperty>
          <HubProperty label="Created">{formatDate(quote.created_at)}</HubProperty>
          <HubProperty label="Expires">{quote.expires_at ? formatDate(quote.expires_at) : null}</HubProperty>
          <HubProperty label="P&L">
            <PnlExclusionToggle kind="quote" id={quote.id} checked={(quote as any).exclude_from_pnl === true}
              onChanged={(next) => setQuote({ ...quote, exclude_from_pnl: next } as typeof quote)} />
          </HubProperty>
        </HubPropertyList>
      </HubPanel>

      <HubPanel title="Totals">
        <HubPropertyList>
          <HubProperty label="Lines" layout="inline">{itemCount}</HubProperty>
          <HubProperty label="Extras" layout="inline">
            {quoteUpsells.length > 0 ? `${quoteUpsells.length} · ${formatMoney(extrasTotal, quote.currency)}` : null}
          </HubProperty>
          <HubProperty label="Grand Total" layout="inline">
            <span className="font-semibold tabular-nums">{formatMoney(pricingGrandTotal, quote.currency)}</span>
          </HubProperty>
        </HubPropertyList>
      </HubPanel>

      {(quoteDocs.order || quoteDocs.preInvoice) && (
        <HubPanel title="Created From This Quote">
          <div className="space-y-1.5 text-sm">
            {quoteDocs.order && (
              <Link to={`${FINANCE_BASE}/orders/${quoteDocs.order.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                <Package className="h-3.5 w-3.5" />
                Order {quoteDocs.order.order_number ?? quoteDocs.order.id.slice(0, 8)}
                <span className="text-xs text-muted-foreground">· {humanizeLabel(quoteDocs.order.status)}</span>
              </Link>
            )}
            {quoteDocs.preInvoice && (
              <Link to={`${FINANCE_BASE}/invoices/${quoteDocs.preInvoice.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                <FileText className="h-3.5 w-3.5" />
                {quoteDocs.preInvoice.internal_number ?? 'Draft invoice'}
                <span className="text-xs text-muted-foreground">· {humanizeLabel(quoteDocs.preInvoice.status)}</span>
              </Link>
            )}
          </div>
        </HubPanel>
      )}

      {(quote as any).public_share_token && (
        <HubPanel title="Customer Link">
          <SendOnWhatsAppButton
            contactId={quote.customer_contact_id ?? null}
            companyId={quote.customer_company_id ?? null}
            message={`Here is your quote: ${window.location.origin}/q/${(quote as any).public_share_token}`}
          />
        </HubPanel>
      )}

      {quote.notes && (
        <HubPanel title="Notes">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
        </HubPanel>
      )}
      {quote.custom_request_text && (
        <HubPanel title="Customer Request">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.custom_request_text}</p>
        </HubPanel>
      )}
    </>
  );

  return (
    <HubRecordPage
      icon={FileText}
      title={title}
      subtitle={subtitle}
      breadcrumbs={[{ label: 'Quotes', to: QUOTES_BASE }, { label: title }]}
      actions={actions}
      left={left}
      overlays={id && (
        <>
        <ClientQuoteDialog
          open={clientQuoteOpen}
          onOpenChange={setClientQuoteOpen}
          quote={quote}
          onCreated={(newId) => navigate(quoteUrl(newId))}
        />
        <AddProductsSheet
          currency={quote?.currency}
          quoteId={id}
          open={isAddProductsOpen}
          onOpenChange={setIsAddProductsOpen}
          existingProductIds={(quote?.items || []).map((i: any) => i.product_id).filter(Boolean)}
          customerCompanyId={quote?.customer_company_id}
          customerContactId={quote?.customer_contact_id}
          onProductsAdded={loadQuoteDetails}
        />
        </>
      )}
    >
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
            {/* `contracts.quote_id` has always existed and contracts-api has always accepted it;
                the panel was mounted on employees, projects and the standalone page only, so the
                agreement a quote was won under sat invisible from it (#378 L4). */}
            <TabsTrigger value="terms" className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              Terms
            </TabsTrigger>
            <TabsTrigger value="contracts" className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" />
              Contracts
            </TabsTrigger>
          </TabsList>

          {/* Items Tab */}
          <TabsContent value="items" className="mt-5">
            <QuoteItemsList
              currency={quote.currency}
              items={quote.items || []}
              variant="detailed"
              showAddButton={quote.status !== 'accepted' && quote.status !== 'rejected'}
              salesCanSeeCost={showCost}
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
            <QuoteEconomicsTiles quoteId={quote.id} refreshKey={quote} />

            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <DollarSign className="h-4 w-4" /> Set Item Prices
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Set a unit price for each item. Line totals and the grand total are calculated automatically.</p>
                {showCost && (quote.items || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleFindBuyPrices()} disabled={findingBuy}>
                      {findingBuy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      Find buy prices
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Matches each line against your supplier price lists. Nothing is saved until you press Use this price.
                    </span>
                  </div>
                )}
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
                            {showCost && <th className="text-left text-xs font-medium text-muted-foreground p-3">Buy Price</th>}
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
                                    {/* Save this typed price to the catalog so it's pulled next time (catalog products only). */}
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
                                {showCost && (
                                  <td className="p-3 align-top">
                                    <QuoteLineBuyPrice
                                      cost={(item as any).cost_snapshot != null ? Number((item as any).cost_snapshot) : null}
                                      sellPrice={effectivePrice}
                                      suggestion={buySuggestions[item.id]}
                                      readOnly={quote.status === 'accepted' || quote.status === 'superseded'}
                                      onSave={async (cost, source) => {
                                        await quotesService.setItemCost(quote.id, quote.workspace_id!, item.id, cost, source);
                                        await loadQuoteDetails();
                                      }}
                                    />
                                  </td>
                                )}
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
                                  {formatMoney(lineTotal, quote.currency)}
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
                        {/* paid-upfront (cash) discount */}
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
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Switch
                            checked={!!quote.show_prices_incl_vat}
                            disabled={quote.status === 'accepted' || quote.status === 'rejected'}
                            onCheckedChange={async (v) => {
                              await quotesService.updateQuote(quote.id, { show_prices_incl_vat: v });
                              await loadQuoteDetails();
                            }}
                          />
                          PDF shows prices incl. VAT (final total only)
                        </label>
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

            {quote.status !== 'accepted' && quote.status !== 'rejected' && quote.status !== 'superseded' && (
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Gift className="h-4 w-4" /> Add Extra
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Charge something on top of the lines — installation, delivery, a service. Pick one from your extras list or create a new one.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="md:col-span-2">
                  <label htmlFor="quotedetailadminpage-select-upsell" className="text-xs font-medium mb-2 block">Extra</label>
                  <Select value={selectedUpsellId} onValueChange={(v) => {
                    setSelectedUpsellId(v);
                    const u = upsells.find((x) => x.id === v);
                    if (u) setUpsellPrice(String(u.price));
                  }}>
                    <SelectTrigger id="quotedetailadminpage-select-upsell" className="w-full">
                      <SelectValue placeholder="Choose an extra..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_EXTRA}>
                        <span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" /> New extra…</span>
                      </SelectItem>
                      {upsells
                        .filter(u => !quoteUpsells.some(qu => qu.upsell_id === u.id))
                        .map((upsell) => (
                          <SelectItem key={upsell.id} value={upsell.id}>
                            <div className="flex items-center justify-between gap-4">
                              <span>{upsell.name}</span>
                              <span className="text-muted-foreground tabular-nums">{formatMoney(upsell.price, quote.currency)}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="quotedetailadminpage-price" className="text-xs font-medium mb-2 block">Unit Price</label>
                  <Input id="quotedetailadminpage-price" type="text" inputMode="decimal" placeholder="0.00"
                    value={upsellPrice} onChange={(e) => setUpsellPrice(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="quotedetailadminpage-quantity" className="text-xs font-medium mb-2 block">Quantity</label>
                  <Input id="quotedetailadminpage-quantity" type="text" inputMode="decimal" placeholder="1"
                    value={upsellQuantity} onChange={(e) => setUpsellQuantity(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="quotedetailadminpage-measurement" className="text-xs font-medium mb-2 block">Unit (optional)</label>
                  <Input id="quotedetailadminpage-measurement" placeholder="e.g. m², pcs, hours"
                    value={upsellMeasurement} onChange={(e) => setUpsellMeasurement(e.target.value)} />
                </div>
                {selectedUpsellId === NEW_EXTRA && (
                  <>
                    <div className="md:col-span-2">
                      <label htmlFor="quotedetailadminpage-new-extra-name" className="text-xs font-medium mb-2 block">Extra Name</label>
                      <Input id="quotedetailadminpage-new-extra-name" placeholder="e.g. Installation"
                        value={newExtraName} onChange={(e) => setNewExtraName(e.target.value)} />
                    </div>
                    <div className="md:col-span-3">
                      <label htmlFor="quotedetailadminpage-new-extra-desc" className="text-xs font-medium mb-2 block">Description (optional)</label>
                      <Input id="quotedetailadminpage-new-extra-desc" placeholder="Shown to the customer under the name"
                        value={newExtraDescription} onChange={(e) => setNewExtraDescription(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={upsellIncluded} onCheckedChange={setUpsellIncluded} />
                  {upsellIncluded ? 'Included — charged on this quote' : 'Optional — the customer accepts or declines it'}
                </label>
                <Button onClick={handleAddUpsellFromDropdown} disabled={!selectedUpsellId || addingUpsell}>
                  {addingUpsell ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add extra
                </Button>
                {selectedUpsellId === NEW_EXTRA && (
                  <span className="text-xs text-muted-foreground">It is also saved to your extras list for the next quote.</span>
                )}
              </div>
            </div>
            )}

            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Gift className="h-4 w-4" /> Extras on This Quote
                </h3>
                <span className="text-sm font-semibold tabular-nums">
                  Charged: {formatMoney(extrasTotal, quote.currency)}
                </span>
              </div>
              {loadingUpsells ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : quoteUpsells.length === 0 ? (
                <HubEmptyState
                  icon={Gift}
                  title="No extras on this quote"
                  description="Installation, delivery or any service charged on top of the lines."
                  action={['accepted', 'rejected', 'superseded'].includes(quote.status) ? undefined : (
                    <Button size="sm" variant="outline" onClick={() => setSelectedUpsellId(NEW_EXTRA)}>New extra</Button>
                  )}
                />
              ) : (
                <div className="divide-y divide-hairline border border-hairline rounded-sm">
                  {quoteUpsells.map((quoteUpsell) => {
                    const upsell = quoteUpsell.upsell ?? upsells.find(u => u.id === quoteUpsell.upsell_id);
                    const metadata = quoteUpsell.metadata as { custom_price?: number; quantity?: number; measurement?: string } | null;
                    const unit = metadata?.custom_price ?? upsell?.price ?? 0;
                    const qty = metadata?.quantity ?? 1;
                    const state = quoteUpsell.customer_accepted === true ? 'included'
                      : quoteUpsell.customer_accepted === false ? 'declined' : 'optional';
                    const locked = quote.status === 'accepted' || quote.status === 'rejected' || quote.status === 'superseded';
                    return (
                      <div key={quoteUpsell.id} className="flex flex-wrap items-center gap-3 p-3">
                        <div className="flex-1 min-w-[12rem]">
                          <p className="text-sm font-medium">{upsell?.name ?? 'Extra'}</p>
                          {upsell?.description && <p className="text-xs text-muted-foreground">{upsell.description}</p>}
                          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                            {formatMoney(unit, quote.currency)} × {qty}{metadata?.measurement ? ` ${metadata.measurement}` : ''} = {formatMoney(unit * qty, quote.currency)}
                          </p>
                        </div>
                        {locked ? (
                          <Badge variant={state === 'included' ? 'success' : state === 'declined' ? 'error' : 'neutral'}>
                            {state === 'included' ? 'Included' : state === 'declined' ? 'Declined' : 'Optional'}
                          </Badge>
                        ) : (
                          <Select
                            value={state}
                            onValueChange={(v) => void handleSetUpsellInclusion(quoteUpsell.id, v === 'included' ? true : v === 'declined' ? false : null)}
                            disabled={decidingUpsellId === quoteUpsell.id}
                          >
                            <SelectTrigger className="h-8 w-56 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="included">Included (Charged)</SelectItem>
                              <SelectItem value="optional">Optional (Customer Decides)</SelectItem>
                              <SelectItem value="declined">Declined</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {!locked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${upsell?.name ?? 'extra'}`}
                            onClick={() => handleRemoveUpsell(quoteUpsell.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {quoteUpsells.some((qu) => qu.customer_accepted === null || qu.customer_accepted === undefined) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Optional extras must be decided (by the customer, or set here) before the quote can be accepted or invoiced.
                </p>
              )}
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
                          <span className="text-sm">{formatDate(item.delivery_date)}</span>
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
                        <SelectValue placeholder="All Products" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">All Products</SelectItem>
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
                                Completed: {formatDate(item.completed_at)}
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

          {/* The paper behind the quote. Counterparty prefilled from the quote's own customer, so
              the signing email has a recipient without anyone retyping the name. */}
          <TabsContent value="contracts" className="mt-5">
            {quote.workspace_id && (
              <ContractsSection
                workspaceId={quote.workspace_id}
                context="finance"
                subject={{ quote_id: quote.id }}
                heading="Contracts on this quote"
                defaultCounterparty={{ name: quote.customer_name ?? null }}
              />
            )}
          </TabsContent>
          <TabsContent value="terms" className="mt-5">
            <QuoteTermsEditor
              quoteId={quote.id}
              terms={quote.terms}
              readOnly={quote.status === 'accepted' || quote.status === 'rejected'}
              onSaved={loadQuoteDetails}
            />
          </TabsContent>
        </Tabs>
    </HubRecordPage>
  );
};

const QuoteCreatorName: React.FC<{ userId: string | null | undefined }> = ({ userId }) => {
  const profile = useDisplayProfile(userId);
  return <>{profile?.fullName || profile?.email || null}</>;
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
    <div>
      <CustomerPicker
        value={cust}
        label=""
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

