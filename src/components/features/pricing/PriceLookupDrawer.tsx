/**
 * PriceLookupDrawer
 *
 * Admin-only drawer that asks the KAI agent to compose a price proposal
 * from the "Pricing" category of the Knowledge Base.
 *
 * Used from:
 *  - Product detail modal ("Get price from KB" button)
 *  - Quote line item (AddProductsSheet / QuoteItemsList "Get price" button)
 *
 * Flow:
 *  1. User clicks trigger → drawer opens.
 *  2. We POST to the agent-chat edge function (SSE stream).
 *  3. We collect `price_lookup_matches` and `price_proposal` chunks.
 *  4. We render the reasoning chain + sources.
 *  5. Admin clicks "Use this price" → onConfirm() callback fires.
 *
 * Never auto-fills. Always requires an explicit confirm click.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Globe2, Loader2, Sparkles, X, Zap } from 'lucide-react';

import { MarketPanel } from './MarketPanel';
import { marketCheck, type MarketCheckResponse } from '@/services/priceMonitoringApi';
import { useWorkspace } from '@/contexts/WorkspaceContext';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/core/ui/sheet';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Separator } from '@/components/core/ui/separator';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { edgeError } from '@/utils/edgeError';
import { supabase } from '@/integrations/supabase/client';

type LookupMode = 'ai' | 'quick';

export interface PriceProposal {
  product_id?: string;
  product_name?: string;
  list_price?: number | null;
  discount_percent?: number | null;
  final_unit_price?: number | null;
  currency?: string;
  unit?: string;
  quantity_applied?: number | null;
  total?: number | null;
  source_doc_ids?: string[];
  source_titles?: string[];
  reasoning_chain?: string[];
  warnings?: string[];
  confidence?: 'high' | 'medium' | 'low';
  effective_through?: string | null;
}

export interface PriceLookupMatch {
  doc_id?: string;
  doc_title: string;
  doc_type: 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion' | 'unknown';
  snippet: string;
  relevance_score: number;
}

export interface PriceConfirmPayload {
  unit_price: number;
  discount_price: number | null;
  discount_percent: number | null;
  currency: string;
  unit: string | null;
  source_doc_ids: string[];
  source_titles: string[];
  reasoning_chain: string[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
  /** FK to agent_tool_call_logs.id — set when the AI mode was used and we received tool_call_ids. */
  price_lookup_call_id?: string | null;
  /** Audit provenance: 'kb:ai:{log_id}' | 'kb:quick:{doc_id}' | 'manual' */
  price_source?: string;
}

interface PriceLookupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string;
  productName: string;
  sku?: string;
  manufacturer?: string;
  quantity?: number;
  unit?: string;
  /**
   * CRM company UUID of the quote's customer (B2B). When provided, the
   * price_lookup tool reads `crm_companies.discount_percent` and folds the
   * customer-side discount into its reasoning chain so the proposed final
   * price already reflects the standing agreement. Mutually exclusive with
   * customerContactId.
   */
  customerCompanyId?: string | null;
  /**
   * CRM contact UUID of the quote's customer (B2C / private). Same behavior
   * as customerCompanyId, sourced from `crm_contacts`. Mutually exclusive
   * with customerCompanyId.
   */
  customerContactId?: string | null;
  /** Called when the admin clicks "Use this price" — returns the committed values to the caller. */
  onConfirm?: (payload: PriceConfirmPayload) => void | Promise<void>;
  /** When true, the drawer additionally upserts to product_prices after confirm. Defaults to false (quote flow). */
  commitToProductPrices?: boolean;
  /** Default mode. Quick pick skips the agent and queries MIVAA directly — faster + no LLM cost. */
  defaultMode?: LookupMode;
}

const DOC_TYPE_LABEL: Record<PriceLookupMatch['doc_type'], string> = {
  price_list: 'Price list',
  discount_rule: 'Discount rule',
  contract_terms: 'Contract terms',
  promotion: 'Promotion',
  unknown: 'Unclassified',
};

const DOC_TYPE_COLOR: Record<PriceLookupMatch['doc_type'], string> = {
  price_list: 'bg-primary/20 text-primary',
  discount_rule: 'bg-amber-500/20 text-amber-400',
  contract_terms: 'bg-emerald-500/20 text-emerald-400',
  promotion: 'bg-pink-500/20 text-pink-400',
  unknown: 'bg-muted text-muted-foreground',
};

export const PriceLookupDrawer: React.FC<PriceLookupDrawerProps> = ({
  open,
  onOpenChange,
  productId,
  productName,
  sku,
  manufacturer,
  quantity,
  unit,
  customerCompanyId,
  customerContactId,
  onConfirm,
  commitToProductPrices = false,
  defaultMode = 'ai',
}) => {
  const [mode, setMode] = useState<LookupMode>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [matches, setMatches] = useState<PriceLookupMatch[]>([]);
  const [proposal, setProposal] = useState<PriceProposal | null>(null);
  const [agentText, setAgentText] = useState('');
  const [priceLookupCallId, setPriceLookupCallId] = useState<string | null>(null);
  const [finalPrice, setFinalPrice] = useState<string>('');
  const [finalDiscount, setFinalDiscount] = useState<string>('');
  const [finalCurrency, setFinalCurrency] = useState<string>('EUR');
  const [finalUnit, setFinalUnit] = useState<string>(unit || '');
  const [notes, setNotes] = useState('');
  const [committing, setCommitting] = useState(false);
  const [market, setMarket] = useState<MarketCheckResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  const reset = useCallback(() => {
    setLoading(false);
    setStatus('');
    setMatches([]);
    setProposal(null);
    setAgentText('');
    setPriceLookupCallId(null);
    setFinalPrice('');
    setFinalDiscount('');
    setFinalCurrency('EUR');
    setFinalUnit(unit || '');
    setNotes('');
    setMarket(null);
    setMarketLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [unit]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /**
   * Quick pick mode: calls MIVAA directly via mivaa-gateway with
   * category_slug="pricing". Shows the raw matches; no LLM, no reasoning chain.
   */
  const runQuickLookup = useCallback(async () => {
    reset();
    setLoading(true);
    setStatus('Searching price knowledge base...');

    try {
      const query = [productName, sku, manufacturer].filter(Boolean).join(' ').trim();
      if (!activeWorkspaceId) throw new Error('No active workspace');

      const { data, error } = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'search_knowledge_base',
          payload: {
            query,
            workspace_id: activeWorkspaceId,
            search_types: ['kb_docs'],
            top_k: 8,
            similarity_threshold: 0.35,
            caller: 'admin',
            category_slug: 'pricing',
          },
        },
      });
      if (error) throw await edgeError(error);

      // The gateway forwards the MIVAA response as-is under data.data (or directly).
      const payload = (data?.data ?? data) as any;
      const rawChunks: any[] = payload?.chunks || [];
      const mapped: PriceLookupMatch[] = rawChunks.map((c: any) => ({
        doc_id: c.id,
        doc_title: c.document_title || c.title || 'Untitled',
        doc_type: (c.price_doc_type as any) || 'unknown',
        snippet: String(c.content || '').slice(0, 800),
        relevance_score: Number(c.relevance_score || c.similarity_score || 0),
      }));
      setMatches(mapped);
      if (mapped.length === 0) {
        toast({
          title: 'No price documents found',
          description: 'No matching docs in the Pricing category. You can still enter a price manually.',
        });
      }
    } catch (err) {
      console.error('Quick price lookup failed:', err);
      toast({
        title: 'Quick lookup failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setStatus('');
    }
  }, [productName, sku, manufacturer, reset, toast]);

  const runAILookup = useCallback(async () => {
    reset();
    setLoading(true);
    setStatus('Asking agent to search the Pricing knowledge base...');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = (supabase as any).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
      const url = `${supabaseUrl}/functions/v1/agent-chat`;

      const promptParts = [
        'Look up the current price for this product:',
        `- Name: ${productName}`,
        sku ? `- SKU: ${sku}` : null,
        manufacturer ? `- Manufacturer: ${manufacturer}` : null,
        quantity != null ? `- Quantity: ${quantity}` : null,
        unit ? `- Expected unit: ${unit}` : null,
        productId ? `- Product ID: ${productId}` : null,
        customerCompanyId ? `- Customer company ID: ${customerCompanyId}` : null,
        customerContactId ? `- Customer contact ID: ${customerContactId}` : null,
        '',
        'Call the price_lookup tool with category_slug="pricing"' +
          (customerCompanyId
            ? `, customer_company_id="${customerCompanyId}"`
            : customerContactId
              ? `, customer_contact_id="${customerContactId}"`
              : '') +
          ' and compose a price_proposal chunk with a full reasoning chain. Cite source documents by title. If a customer discount is on file, show the supplier-layer price and the customer-layer price as separate lines in the reasoning chain.',
      ].filter(Boolean).join('\n');

      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: promptParts }],
          agentId: 'kai',
          context: { source: 'price_lookup_drawer', product_id: productId },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Agent request failed: ${response.status} ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let localText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: any;
          try {
            chunk = JSON.parse(line);
          } catch {
            continue;
          }

          switch (chunk.type) {
            case 'status':
              if (chunk.message) setStatus(chunk.message);
              break;
            case 'heartbeat':
              break;
            case 'tool_progress':
              if (chunk.status) setStatus(chunk.status);
              break;
            case 'tool_call_ids':
              // Emitted by agent-chat after tool logs are inserted. Capture the
              // price_lookup row id so we can link committed prices back to it.
              if (Array.isArray(chunk.mapping)) {
                const found = chunk.mapping.find((m: any) => m.tool_name === 'price_lookup');
                if (found?.log_id) setPriceLookupCallId(found.log_id);
              }
              break;
            case 'price_lookup_matches':
              if (Array.isArray(chunk.matches)) setMatches(chunk.matches);
              break;
            case 'price_proposal':
              setProposal(chunk as PriceProposal);
              if (chunk.final_unit_price != null) setFinalPrice(String(chunk.final_unit_price));
              if (chunk.discount_percent != null) setFinalDiscount(String(chunk.discount_percent));
              if (chunk.currency) setFinalCurrency(chunk.currency);
              if (chunk.unit) setFinalUnit(chunk.unit);
              break;
            case 'text':
            case 'content':
              if (typeof chunk.text === 'string') {
                localText += chunk.text;
                setAgentText(localText);
              } else if (typeof chunk.content === 'string') {
                localText += chunk.content;
                setAgentText(localText);
              }
              break;
            case 'done':
            case 'final':
              setStatus('');
              break;
            case 'error':
              throw new Error(chunk.message || 'Agent error');
            default:
              break;
          }
        }
      }

      setStatus('');
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      console.error('Price lookup failed:', err);
      toast({
        title: 'Price lookup failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, [productId, productName, sku, manufacturer, quantity, unit, customerCompanyId, customerContactId, reset, toast]);

  const runLookup = useCallback(() => {
    return mode === 'quick' ? runQuickLookup() : runAILookup();
  }, [mode, runQuickLookup, runAILookup]);

  /**
   * Stateless one-shot retailer market scan. Parallel to the KB lookup — the
   * admin can run either or both. Reuses the monitoring snapshot if the
   * product is already enrolled and the last refresh is ≤6h old.
   */
  const runMarketCheck = useCallback(async () => {
    if (marketLoading) return;
    setMarketLoading(true);
    try {
      const res = await marketCheck({
        productId,
        productName,
        manufacturer,
        verifyPrices: true,
      });
      if (!res.success) {
        toast({
          title: 'Market check failed',
          description: res.error ?? 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      setMarket(res);
      if ((res.total_results ?? 0) === 0) {
        toast({
          title: 'No retailers found',
          description: 'Perplexity + DataForSEO returned nothing for this product in your market.',
        });
      }
    } catch (err) {
      console.error('Market check failed:', err);
      toast({
        title: 'Market check failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setMarketLoading(false);
    }
  }, [marketLoading, productId, productName, manufacturer, toast]);

  // Auto-run on open — uses whatever mode is currently selected
  useEffect(() => {
    if (open && !loading && matches.length === 0 && !proposal) {
      runLookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsedPrice = parseFloat(finalPrice);
  const parsedDiscount = finalDiscount ? parseFloat(finalDiscount) : null;
  const canConfirm = !Number.isNaN(parsedPrice) && parsedPrice > 0;

  const handleConfirm = async () => {
    if (!canConfirm) {
      toast({
        title: 'Enter a price',
        description: 'Unit price is required before confirming.',
        variant: 'destructive',
      });
      return;
    }
    setCommitting(true);
    try {
      const discount_percent = parsedDiscount != null && !Number.isNaN(parsedDiscount) ? parsedDiscount : null;
      const discount_price = proposal?.list_price && discount_percent != null
        ? Number(proposal.list_price) * (1 - discount_percent / 100)
        : null;

      const source_doc_ids = proposal?.source_doc_ids || matches.map((m) => m.doc_id).filter((id): id is string => !!id);
      // Provenance tag for audit. Shape: kb:<mode>:<linkId>
      //   AI mode → kb:ai:<agent_tool_call_logs.id>
      //   Quick   → kb:quick:<first_doc_id>  (no agent call to link to)
      let priceSource: string;
      if (mode === 'ai' && priceLookupCallId) {
        priceSource = `kb:ai:${priceLookupCallId}`;
      } else if (source_doc_ids[0]) {
        priceSource = `kb:quick:${source_doc_ids[0]}`;
      } else {
        priceSource = 'manual';
      }

      const payload: PriceConfirmPayload = {
        unit_price: parsedPrice,
        discount_price,
        discount_percent,
        currency: finalCurrency || 'EUR',
        unit: finalUnit || null,
        source_doc_ids,
        source_titles: proposal?.source_titles || matches.map((m) => m.doc_title),
        reasoning_chain: proposal?.reasoning_chain || [],
        confidence: proposal?.confidence || (mode === 'quick' ? 'medium' : 'medium'),
        notes: notes || undefined,
        price_lookup_call_id: priceLookupCallId,
        price_source: priceSource,
      };

      // Optionally upsert to product_prices for the ACTIVE workspace — used when
      // triggered from the product detail page (per-workspace catalog price).
      if (commitToProductPrices && productId && activeWorkspaceId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // The error MUST be destructured and thrown. supabase-js RESOLVES on an RLS denial
          // rather than throwing, so discarding it let a rejected write flow straight into the
          // "Price confirmed" toast below and close the drawer — the user saw a price they
          // believed was saved, the catalog was unchanged, and no second signal existed
          // anywhere. The enclosing try/catch could not help: nothing threw. The other two
          // product_prices call sites both check. (audit #305 finding 14)
          const { error: priceErr } = await supabase.from('product_prices').upsert(
            {
              workspace_id: activeWorkspaceId,
              product_id: productId,
              list_price: proposal?.list_price ?? null,
              discount_price,
              discount_percent,
              currency: payload.currency,
              unit: payload.unit,
              source_kb_doc_ids: payload.source_doc_ids,
              source_snippet: matches[0]?.snippet ?? null,
              price_lookup_call_id: priceLookupCallId,
              confirmed_by: user.id,
              confirmed_at: new Date().toISOString(),
              notes: notes || null,
            },
            { onConflict: 'workspace_id,product_id' },
          );
          if (priceErr) throw new Error(`Could not save the catalog price: ${priceErr.message}`);
        }
      }

      await onConfirm?.(payload);
      toast({
        title: 'Price confirmed',
        description: `${payload.unit_price.toFixed(2)} ${payload.currency}${payload.unit ? ` / ${payload.unit}` : ''}`,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Price confirm failed:', err);
      toast({
        title: 'Failed to confirm price',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Get Price from Knowledge Base
          </SheetTitle>
          <SheetDescription>
            {productName}
            {sku ? ` · SKU ${sku}` : ''}
            {manufacturer ? ` · ${manufacturer}` : ''}
            {quantity != null ? ` · qty ${quantity}${unit ? ` ${unit}` : ''}` : ''}
          </SheetDescription>
        </SheetHeader>

        {/* Mode toggle — AI reasoning vs cheap direct search */}
        <div className="mt-4 flex items-center gap-2">
          <div className="inline-flex rounded-full border p-0.5 bg-muted/30">
            <button
              type="button"
              onClick={() => { setMode('ai'); if (open) { setTimeout(() => runAILookup(), 0); } }}
              disabled={loading || committing}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                mode === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="AI composes a reasoning chain from matching docs (uses LLM tokens)"
            >
              <Sparkles className="h-3 w-3" />
              AI mode
            </button>
            <button
              type="button"
              onClick={() => { setMode('quick'); if (open) { setTimeout(() => runQuickLookup(), 0); } }}
              disabled={loading || committing}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                mode === 'quick' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Fetch raw matches from Knowledge Base (no LLM, no cost)"
            >
              <Zap className="h-3 w-3" />
              Quick pick
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {mode === 'ai' ? 'Agent composes a price with reasoning.' : 'Direct search · no AI cost.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={runMarketCheck}
            disabled={marketLoading}
            title="Run a live retailer scan (Perplexity + DataForSEO + Firecrawl) to compare your KB price against the market. Stateless — does not enroll into monitoring."
          >
            {marketLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Globe2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Check market
          </Button>
        </div>

        <div className="mt-6 space-y-6">
          {loading && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{status || 'Searching…'}</span>
            </div>
          )}

          {!loading && matches.length === 0 && !proposal && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No results yet.{' '}
                <Button variant="link" size="sm" className="px-1" onClick={runLookup}>
                  Run lookup
                </Button>
              </CardContent>
            </Card>
          )}

          {market && (
            <MarketPanel
              market={market}
              kbPrice={
                proposal?.final_unit_price != null
                  ? Number(proposal.final_unit_price)
                  : parsedPrice && !Number.isNaN(parsedPrice)
                    ? parsedPrice
                    : null
              }
            />
          )}

          {proposal && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Proposal</h3>
                  {proposal.confidence && (
                    <Badge
                      variant="outline"
                      className={
                        proposal.confidence === 'high'
                          ? 'border-emerald-500/40 text-emerald-400'
                          : proposal.confidence === 'low'
                            ? 'border-amber-500/40 text-amber-400'
                            : ''
                      }
                    >
                      {proposal.confidence} confidence
                    </Badge>
                  )}
                </div>

                {proposal.reasoning_chain && proposal.reasoning_chain.length > 0 && (
                  <div className="space-y-1">
                    {proposal.reasoning_chain.map((line, i) => (
                      <div key={i} className="text-sm text-foreground/90">
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                {(proposal.list_price != null || proposal.final_unit_price != null) && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {proposal.list_price != null && (
                      <div>
                        <div className="text-xs text-muted-foreground">List price</div>
                        <div className="font-medium">
                          {proposal.list_price} {proposal.currency || ''}
                          {proposal.unit ? ` / ${proposal.unit}` : ''}
                        </div>
                      </div>
                    )}
                    {proposal.discount_percent != null && (
                      <div>
                        <div className="text-xs text-muted-foreground">Discount</div>
                        <div className="font-medium">{proposal.discount_percent}%</div>
                      </div>
                    )}
                    {proposal.final_unit_price != null && (
                      <div>
                        <div className="text-xs text-muted-foreground">Final unit price</div>
                        <div className="font-medium text-primary">
                          {proposal.final_unit_price} {proposal.currency || ''}
                          {proposal.unit ? ` / ${proposal.unit}` : ''}
                        </div>
                      </div>
                    )}
                    {proposal.total != null && (
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Total{proposal.quantity_applied ? ` (× ${proposal.quantity_applied})` : ''}
                        </div>
                        <div className="font-medium text-primary">
                          {proposal.total} {proposal.currency || ''}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {proposal.warnings && proposal.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <div className="flex items-center gap-2 text-amber-400 mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Warnings</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-foreground/90">
                      {proposal.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {proposal.effective_through && (
                  <div className="text-xs text-muted-foreground">
                    Effective through {proposal.effective_through}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {matches.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Sources ({matches.length})</h3>
              {matches.map((m, i) => (
                <Card key={m.doc_id || i}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{m.doc_title}</span>
                      </div>
                      <Badge variant="outline" className={`text-xs ${DOC_TYPE_COLOR[m.doc_type]}`}>
                        {DOC_TYPE_LABEL[m.doc_type]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {m.snippet.length > 400 ? `${m.snippet.slice(0, 400)}…` : m.snippet}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && agentText && !proposal && (
            <Card>
              <CardContent className="p-4 text-sm whitespace-pre-wrap">{agentText}</CardContent>
            </Card>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Commit Price</h3>
            <p className="text-xs text-muted-foreground">
              Review the proposal and sources above, then enter the final values. Nothing is saved until you click
              "Use this price".
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="price-unit-price">Unit price *</Label>
                <Input
                  id="price-unit-price"
                  type="number"
                  step="0.01"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-currency">Currency</Label>
                <Input
                  id="price-currency"
                  value={finalCurrency}
                  onChange={(e) => setFinalCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-discount">Discount %</Label>
                <Input
                  id="price-discount"
                  type="number"
                  step="0.01"
                  value={finalDiscount}
                  onChange={(e) => setFinalDiscount(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-unit">Unit</Label>
                <Input
                  id="price-unit"
                  value={finalUnit}
                  onChange={(e) => setFinalUnit(e.target.value)}
                  placeholder="m², piece, box…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price-notes">Notes</Label>
              <Input
                id="price-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. applied Q2 contract discount"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!canConfirm || committing}>
              {committing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Use this price
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PriceLookupDrawer;
