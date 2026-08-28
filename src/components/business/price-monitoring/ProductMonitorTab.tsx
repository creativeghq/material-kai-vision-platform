/**
 * ProductMonitorTab — per-product price monitoring view.
 *
 * Layout (top → bottom):
 *   1. Header with Enable toggle + Admin "Refresh now" button
 *   2. Price history chart (combines Perplexity-discovered + custom URL data points)
 *   3. Discovered retailers table (Perplexity Sonar, auto-discovered, up to 10)
 *      + Claude summary above the table (closest retailer, pricing anomalies)
 *   4. Custom Monitoring section (user-pasted URLs tracked via Firecrawl)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { Switch } from '@/components/core/ui/switch';
import {
  TrendingDown,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Plus,
  Clock,
  Sparkles,
  Shield,
  Globe,
  ShoppingBag,
  ShoppingCart,
  BadgeCheck,
  ThumbsDown,
  Check,
  X,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { CompetitorSourceManager } from './CompetitorSourceManager';
import { PriceHistoryChart } from './PriceHistoryChart';
import { PriceAlertPreferences } from './PriceAlertPreferences';
import { formatNumber } from '@/utils/decimal';
import { safeHref } from '@/utils/safeUrl';
import {
  refreshProduct,
  trackProduct,
  untrackProduct,
  getProductMonitoring,
  getProductSources,
  listUrlOnlyForProduct,
  submitClassifierCorrection,
  excludeProductResult,
  includeProductResult,
  listProductExclusions,
  verifyProductSources,
  type RetailerRow,
  type ProductExclusion,
  type TrackedQuery,
} from '@/services/priceMonitoringApi';
import {
  isDemoProduct,
  getDemoCompetitorSources,
  getDemoCompetitorPrices,
  getDemoMonitoringConfig,
} from '@/data/demo/price-monitoring-demo';

interface ProductMonitorTabProps {
  productId: string;
  productName: string;
  currentPrice?: number;
  currency?: string;
}

interface CompetitorSource {
  id: string;
  source_name: string;
  source_url: string;
  source_type:
    | 'firecrawl_url'
    | 'perplexity_web_search'
    | 'claude_web_search'
    | 'dataforseo_shopping'
    | 'marketplace_skroutz'
    | 'marketplace_bestprice'
    | 'marketplace_shopflix';
  current_price: number | null;
  current_original_price: number | null;
  current_price_verified: boolean;
  current_currency: string | null;
  current_availability: string | null;
  current_price_updated_at: string | null;
  last_seen_at: string | null;
  is_active: boolean;
  /**
   * Per-row enrichment cache refreshed on each discovery:
   *  - image_url / rating_value / rating_votes: DataForSEO Shopping feed only
   *  - notes: verification discrepancy string when Firecrawl disagreed with the LLM
   */
  current_metadata?: {
    image_url?: string;
    rating_value?: number;
    rating_votes?: number;
    notes?: string;
    /** Exact product name on the retailer page. Disambiguates variants from the same retailer. */
    product_title?: string;
  } | null;
  /** Product-identity verdict. null = row created before identity classification shipped. */
  match_kind?: 'exact' | 'variant' | 'unverifiable' | 'family' | null;
  match_score?: number | null;
  match_note?: string | null;
  /** Sanity-band fields. is_anomaly=true means the latest reading was rejected and current_price wasn't overwritten. */
  is_anomaly?: boolean | null;
  anomaly_reason?: string | null;
  rolling_median_at_check?: number | null;
  manual_override?: boolean | null;
  /** Latest price_history row's rejected reading — surfaced for the "Trust this reading" override flow. */
  pending_reading_price?: number | null;
}

export const ProductMonitorTab: React.FC<ProductMonitorTabProps> = ({
  productId,
  productName,
  currentPrice,
  currency = 'USD',
}) => {
  const { toast } = useToast();
  const isDemo = isDemoProduct(productId);

  // State
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [sources, setSources] = useState<CompetitorSource[]>([]);
  const [trackedQueryId, setTrackedQueryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  // Admin overrides (force-refresh, promote/demote, exclusions) are operator controls.
  const { can } = usePermissions();
  const isAdmin = can('platform.admin');
  const [summary, setSummary] = useState<string | null>(null);
  const [throttleUntil, setThrottleUntil] = useState<string | null>(null);
  const [lastSearchAt, setLastSearchAt] = useState<string | null>(null);
  const [nextCheckAt, setNextCheckAt] = useState<string | null>(null);
  const [monitoringFrequency, setMonitoringFrequency] = useState<string | null>(null);
  const [verifyPrices, setVerifyPrices] = useState<boolean>(true);
  const [exclusions, setExclusions] = useState<ProductExclusion[]>([]);
  const [showExclusions, setShowExclusions] = useState(false);

  const loadExclusions = useCallback(async () => {
    if (isDemo) return;
    try {
      const data = await listProductExclusions(productId);
      setExclusions(data);
    } catch (e) {
      console.error('Failed to load exclusions', e);
    }
  }, [productId, isDemo]);

  useEffect(() => {
    loadExclusions();
  }, [loadExclusions]);

  // ─── Data loading ────────────────────────────────────────────────────────
  const loadSources = useCallback(async () => {
    if (isDemo) {
      const demo = getDemoCompetitorSources(productId) as any;
      const demoPrices = getDemoCompetitorPrices(productId, currentPrice || 45.99, currency);
      const priceByName = new Map<string, number>(demoPrices.map((p: any) => [p.source_name, p.price]));
      setSources(
        demo.map((s: any) => ({
          ...s,
          source_type: 'firecrawl_url',
          current_price: priceByName.get(s.source_name) ?? null,
          current_original_price: null,
          current_price_verified: true,
          current_currency: currency,
          current_availability: 'in_stock',
          current_price_updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })),
      );
      setMonitoringEnabled(getDemoMonitoringConfig().monitoring_enabled);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Read the internal tracked_query summary (one per product, may not exist yet).
      const tq = await getProductMonitoring(productId);
      if (tq) {
        setTrackedQueryId(tq.id);
        setMonitoringEnabled(Boolean(tq.is_active));
        setLastSearchAt(tq.last_refreshed_at);
        setNextCheckAt(tq.next_check_at);
        // Volatility-based cadence — surfaced as text. The legacy fixed
        // 'daily/weekly' enum is gone.
        if (tq.consecutive_stable_refreshes >= 7) {
          setMonitoringFrequency('every 72h (stable)');
        } else if (tq.consecutive_stable_refreshes >= 3) {
          setMonitoringFrequency('every 48h (stable)');
        } else {
          setMonitoringFrequency('every 24h');
        }
        setVerifyPrices(Boolean(tq.verify_prices ?? true));
      } else {
        setTrackedQueryId(null);
        setMonitoringEnabled(false);
        setLastSearchAt(null);
        setNextCheckAt(null);
        setMonitoringFrequency(null);
      }

      // Read the latest retailer rows (split into primary + family) and the
      // pinned URL-only entries for the Custom Monitoring section. Adapt the
      // RetailerRow shape to the legacy CompetitorSource shape so the rest of
      // the component renders without further changes.
      const split = await getProductSources(productId);
      const urlOnly = await listUrlOnlyForProduct(productId);

      const sourceTypeOf = (raw: string): CompetitorSource['source_type'] => {
        switch ((raw || '').toLowerCase()) {
          case 'dataforseo': return 'dataforseo_shopping';
          case 'skroutz': return 'marketplace_skroutz';
          case 'bestprice': return 'marketplace_bestprice';
          case 'shopflix': return 'marketplace_shopflix';
          case 'idealo': return 'perplexity_web_search'; // bucket idealo under "discovered" in the UI
          default: return 'perplexity_web_search';
        }
      };

      const adaptRow = (r: RetailerRow): CompetitorSource => ({
        id: r.id || `${r.product_url}-${r.scraped_at || ''}`,
        source_name: r.retailer_name,
        source_url: r.product_url,
        source_type: sourceTypeOf(r.source),
        current_price: r.price,
        current_original_price: r.original_price,
        current_price_verified: Boolean(r.verified),
        current_currency: r.currency,
        current_availability: r.availability,
        current_price_updated_at: r.scraped_at ?? null,
        last_seen_at: r.scraped_at ?? null,
        is_active: true,
        current_metadata: { product_title: r.product_title ?? undefined, notes: r.notes ?? undefined },
        match_kind: r.match_kind as CompetitorSource['match_kind'],
        match_score: r.match_score ?? null,
        match_note: r.match_note,
        is_anomaly: r.is_anomaly ?? null,
        anomaly_reason: r.anomaly_reason ?? null,
        rolling_median_at_check: r.rolling_median_at_check ?? null,
        manual_override: r.manual_override ?? null,
        pending_reading_price: r.is_anomaly ? r.price : null,
      });

      const adaptUrlOnly = (q: TrackedQuery): CompetitorSource => ({
        id: q.id,
        source_name: q.pinned_url ? new URL(q.pinned_url).hostname.replace(/^www\./, '') : q.search_query,
        source_url: q.pinned_url ?? '',
        source_type: 'firecrawl_url',
        current_price: q.current_price,
        current_original_price: q.current_original_price,
        current_price_verified: Boolean(q.current_price_verified),
        current_currency: q.current_currency,
        current_availability: q.current_availability,
        current_price_updated_at: q.current_price_updated_at,
        last_seen_at: q.current_price_updated_at,
        is_active: Boolean(q.is_active),
        current_metadata: (q.current_metadata as CompetitorSource['current_metadata']) ?? null,
        match_kind: null,
        match_score: null,
        match_note: null,
        is_anomaly: null,
        anomaly_reason: null,
        rolling_median_at_check: null,
        manual_override: null,
        pending_reading_price: null,
      });

      const adapted: CompetitorSource[] = [
        ...split.results.map(adaptRow),
        ...split.family_results.map(adaptRow),
        ...urlOnly.map(adaptUrlOnly),
      ];
      setSources(adapted);
    } catch (err) {
      console.error('Failed to load tracked-query data', err);
      toast({ title: 'Error', description: 'Could not load retailer list', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [productId, currentPrice, currency, isDemo, toast]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // ─── Perplexity discovery ────────────────────────────────────────────────
  const runDiscovery = useCallback(
    async (forceRefresh: boolean) => {
      if (isDemo) {
        toast({ title: 'Demo mode', description: 'Discovery is disabled for demo products' });
        return;
      }
      try {
        setIsDiscovering(true);
        const outcome = await refreshProduct(productId, {
          force_refresh: forceRefresh,
          verify_prices: verifyPrices,
        });
        if (outcome.status === 'error') {
          toast({
            title: 'Discovery failed',
            description: outcome.error ?? 'Unknown error',
            variant: 'destructive',
          });
          return;
        }
        setThrottleUntil(outcome.throttle_until ?? null);
        setSummary(outcome.summary ?? null);
        if (outcome.status === 'throttled') {
          toast({
            title: 'Using cached results',
            description: outcome.throttle_until
              ? `Next allowed ${timeAgo(outcome.throttle_until)}.`
              : 'Volatility cadence not yet elapsed.',
          });
        } else {
          toast({
            title: 'Discovery complete',
            description: `${outcome.results?.length ?? 0} retailers, ${outcome.credits_used ?? 0} credits used.`,
          });
        }
        await loadSources();
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message ?? 'Failed', variant: 'destructive' });
      } finally {
        setIsDiscovering(false);
      }
    },
    [productId, isDemo, loadSources, toast, verifyPrices],
  );

  const handleToggleMonitoring = useCallback(async () => {
    if (isDemo) return;
    try {
      setIsToggling(true);
      if (!monitoringEnabled) {
        await trackProduct(productId);
        setMonitoringEnabled(true);
        toast({ title: 'Monitoring enabled', description: 'Discovering retailers…' });
        await loadSources();
      } else {
        await untrackProduct(productId);
        setMonitoringEnabled(false);
        toast({ title: 'Monitoring paused' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Toggle failed', variant: 'destructive' });
    } finally {
      setIsToggling(false);
    }
  }, [monitoringEnabled, productId, loadSources, isDemo, toast]);

  // ─── Derived data ────────────────────────────────────────────────────────
  // Family rows split out: they're the same series but different SKU and live
  // under "Similar Products in this series". They never feed the chart/median.
  const isFamily = (s: CompetitorSource) => (s.match_kind as string | null) === 'family';
  const trackedSources = useMemo(() => sources.filter((s) => !isFamily(s)), [sources]);
  const familySources = useMemo(() => sources.filter(isFamily), [sources]);

  const discovered = useMemo(
    () =>
      trackedSources
        .filter(
          (s) => s.source_type === 'perplexity_web_search' || s.source_type === 'claude_web_search',
        )
        .slice(0, 10),
    [trackedSources],
  );
  const marketplaces = useMemo(
    () => trackedSources.filter((s) =>
      s.source_type === 'marketplace_skroutz' ||
      s.source_type === 'marketplace_bestprice' ||
      s.source_type === 'marketplace_shopflix',
    ),
    [trackedSources],
  );

  const merchants = useMemo(
    () => trackedSources.filter((s) => s.source_type === 'dataforseo_shopping').slice(0, 10),
    [trackedSources],
  );
  const custom = useMemo(() => trackedSources.filter((s) => s.source_type === 'firecrawl_url'), [trackedSources]);

  const priceDiff = (p: number | null) => {
    if (!currentPrice || p == null) return null;
    return ((p - currentPrice) / currentPrice) * 100;
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isDemo && (
        <Alert className="border-yellow-300 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-900">
            <strong>Demo Mode:</strong> Sample price monitoring data.
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Header: Enable + Admin Refresh ─── */}
      <Card className="dashboard-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-medium">Price Monitoring</h3>
                  {monitoringEnabled ? (
                    <Badge className="bg-green-500/20 text-green-700 border-green-500/30 text-[10px]">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Paused
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lastSearchAt
                    ? `Retailers last discovered ${timeAgo(lastSearchAt)}`
                    : 'Enable to discover retailers and track prices'}
                </p>
                {monitoringEnabled && nextCheckAt && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Next automated refresh{' '}
                    {new Date(nextCheckAt) <= new Date()
                      ? 'on the next cron tick (within the hour)'
                      : timeAgo(nextCheckAt)}
                    {monitoringFrequency ? ` · ${monitoringFrequency}` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isAdmin && monitoringEnabled && !isDemo && (
                <>
                  <label
                    className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
                    title={
                      verifyPrices
                        ? 'Every retailer URL will be re-fetched via Firecrawl to confirm the price on the live page. More accurate, ~30s slower, ~3× credits.'
                        : 'Skip the Firecrawl verification pass. Faster and cheaper, but prices come only from Perplexity/DataForSEO snippets — may be stale or hallucinated.'
                    }
                  >
                    <Switch
                      checked={verifyPrices}
                      onCheckedChange={setVerifyPrices}
                      disabled={isDiscovering}
                    />
                    <span>Verify</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runDiscovery(true)}
                    disabled={isDiscovering}
                    title="Admin: bypass 6h throttle and force a fresh discovery"
                  >
                    <Shield className="h-3.5 w-3.5 mr-1.5" />
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                    Refresh now
                  </Button>
                  {(() => {
                    const unverifiedUrls = sources
                      .filter((s) => !s.current_price_verified)
                      .map((s) => s.source_url);
                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDiscovering || unverifiedUrls.length === 0}
                          title={
                            unverifiedUrls.length === 0
                              ? 'Every retailer row is already verified.'
                              : `Re-fetch only the ${unverifiedUrls.length} retailer row${unverifiedUrls.length === 1 ? '' : 's'} that came back unverified. ~1 Firecrawl credit per row.`
                          }
                          onClick={async () => {
                            if (unverifiedUrls.length === 0) return;
                            try {
                              const out = await verifyProductSources({
                                productId,
                                urls: unverifiedUrls,
                              });
                              toast({
                                title: 'Re-verified',
                                description: `${out.verified_count}/${out.rows_processed} now verified · ${out.credits_used} credits`,
                              });
                              loadSources();
                            } catch (e) {
                              console.error('Verify unverified failed', e);
                              toast({
                                title: 'Verify failed',
                                description: e instanceof Error ? e.message : 'Unknown error',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
                          Verify unverified
                          {unverifiedUrls.length > 0 && (
                            <span className="ml-1 text-[10px] opacity-75">({unverifiedUrls.length})</span>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDiscovering}
                          title="Re-verify ALL current retailer rows by re-fetching each URL via Firecrawl. Cheaper than a full Refresh — no new retailers, just price + verified flag updates. ~1 Firecrawl credit per row."
                          onClick={async () => {
                            try {
                              const out = await verifyProductSources({ productId });
                              toast({
                                title: 'Verified',
                                description: `${out.verified_count}/${out.rows_processed} rows verified · ${out.credits_used} credits`,
                              });
                              loadSources();
                            } catch (e) {
                              console.error('Verify all failed', e);
                              toast({
                                title: 'Verify failed',
                                description: e instanceof Error ? e.message : 'Unknown error',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
                          Verify all
                        </Button>
                      </>
                    );
                  })()}
                </>
              )}
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-muted-foreground">Enable</span>
                <Switch
                  checked={monitoringEnabled}
                  onCheckedChange={handleToggleMonitoring}
                  disabled={isToggling || isDemo}
                />
              </div>
            </div>
          </div>
          {throttleUntil && !isDiscovering && monitoringEnabled && (
            <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Next auto-refresh allowed {timeAgo(throttleUntil)}.
              {isAdmin ? ' Admins can override above.' : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Chart (top) ─── */}
      {monitoringEnabled && sources.length > 0 && (
        <PriceHistoryChart productId={productId} productName={productName} timeRange="30d" />
      )}

      {/* ─── Notification preferences (module-gated) ─── */}
      {monitoringEnabled && <PriceAlertPreferences productId={productId} />}

      {/* ─── Discovered retailers (Perplexity) ─── */}
      {monitoringEnabled && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Discovered retailers
                {discovered.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {discovered.length}
                  </Badge>
                )}
              </CardTitle>
              {isDiscovering && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Searching the web…
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {summary && (
              <div className="px-6 pb-3 text-xs text-muted-foreground italic border-b">
                {summary}
              </div>
            )}
            {discovered.length === 0 && !isDiscovering && (
              <div className="px-6 py-6 text-sm text-muted-foreground text-center">
                No retailers discovered yet. {isAdmin && 'Click Refresh now above to try.'}
              </div>
            )}
            {discovered.length > 0 && <RetailerTable rows={discovered} currentPrice={currentPrice} priceDiff={priceDiff} isAdmin={isAdmin} productId={productId} trackedQueryId={trackedQueryId} onChange={() => { loadSources(); loadExclusions(); }} />}
          </CardContent>
        </Card>
      )}

      {/* ─── Merchants (Google Shopping via DataForSEO) ─── */}
      {monitoringEnabled && merchants.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Merchants
                <Badge variant="outline" className="text-[10px]">
                  {merchants.length}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-normal">via Google Shopping</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <RetailerTable rows={merchants} currentPrice={currentPrice} priceDiff={priceDiff} isAdmin={isAdmin} productId={productId} trackedQueryId={trackedQueryId} onChange={() => { loadSources(); loadExclusions(); }} />
          </CardContent>
        </Card>
      )}

      {/* ─── Marketplaces (Greek Marketplaces module) ─── */}
      {monitoringEnabled && marketplaces.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-emerald-500" />
                Marketplaces
                <Badge variant="outline" className="text-[10px]">
                  {marketplaces.length}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-normal">
                  via Skroutz / Bestprice / Shopflix
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <RetailerTable rows={marketplaces} currentPrice={currentPrice} priceDiff={priceDiff} isAdmin={isAdmin} productId={productId} trackedQueryId={trackedQueryId} onChange={() => { loadSources(); loadExclusions(); }} />
          </CardContent>
        </Card>
      )}

      {/* ─── Custom Monitoring (Firecrawl) ─── */}
      {monitoringEnabled && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Custom Monitoring
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddSource(true)} disabled={isDemo}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add URL
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {custom.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Paste a specific retailer URL to track its price via Firecrawl. Useful when the auto-discovery
                missed a retailer you know sells this product.
              </p>
            ) : (
              <RetailerTable rows={custom} currentPrice={currentPrice} priceDiff={priceDiff} isAdmin={isAdmin} productId={productId} trackedQueryId={trackedQueryId} onChange={() => { loadSources(); loadExclusions(); }} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Similar Products in this series (family rows) ─── */}
      {monitoringEnabled && familySources.length > 0 && (
        <SimilarProductsSection
          rows={familySources}
          isAdmin={isAdmin}
          onChange={() => { loadSources(); loadExclusions(); }}
        />
      )}

      {/* ─── Exclusions section ─── */}
      {monitoringEnabled && isAdmin && exclusions.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <button
              type="button"
              className="flex items-center justify-between gap-3 w-full text-left"
              onClick={() => setShowExclusions((s) => !s)}
            >
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="font-medium">
                  Excluded Results
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {exclusions.length}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {showExclusions ? 'Hide' : 'Show'}
              </span>
            </button>
          </CardHeader>
          {showExclusions && (
            <CardContent className="p-0">
              <div className="divide-y">
                {exclusions.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-start justify-between gap-3 px-6 py-2.5 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {ex.url ? new URL(ex.url).host.replace(/^www\./, '') : ex.domain}
                      </div>
                      {ex.url && (
                        <div className="text-[10px] text-muted-foreground truncate">{ex.url}</div>
                      )}
                      {ex.reason && (
                        <div className="text-[10px] text-muted-foreground italic mt-0.5">
                          {ex.reason}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Excluded {timeAgo(ex.excluded_at)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={async () => {
                        try {
                          await includeProductResult({
                            productId,
                            url: ex.url ?? undefined,
                            domain: ex.domain ?? undefined,
                          });
                          await loadExclusions();
                          await loadSources();
                        } catch (e) {
                          console.error('Re-include failed', e);
toast({ title: 'Could not re-include retailer', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                        }
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 text-[10px] text-muted-foreground border-t bg-muted/20">
                Excluded URLs and domains never appear in this product's chart, median,
                alerts, or refreshes. Other products tracking the same retailer are unaffected.
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <CompetitorSourceManager
        productId={productId}
        isOpen={showAddSource}
        onClose={() => setShowAddSource(false)}
        onSourceAdded={loadSources}
      />
    </div>
  );
};

// ─── SimilarProductsSection — shows family rows (different SKU, same series) ──
// Family rows are rendered separately so they don't pollute the price chart /
// median / alerts. Admin can promote a family row to tracked if the classifier
// was wrong. Internal product flow (competitor_sources); the tracked-query
// flow has the same UI rendered by the external API consumer.

const SimilarProductsSection: React.FC<{
  rows: CompetitorSource[];
  isAdmin: boolean;
  onChange: () => void;
}> = ({ rows, isAdmin, onChange }) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handlePromote = useCallback(
    async (row: CompetitorSource, kind: 'exact' | 'variant') => {
      const reason = window.prompt(
        kind === 'exact'
          ? 'Why is this an exact match? (optional)'
          : 'Why is this a variant? (optional)',
      );
      // null = cancelled
      if (reason === null) return;
      try {
        setPendingId(row.id);
        const { promoteFamilyRow } = await import('@/services/priceMonitoringApi');
        // CompetitorSource.id is sourced from RetailerRow.id, which IS the
        // tracked_query_price_history.id (see adaptRow at line ~231). Pass it
        // through under the API's expected key.
        await promoteFamilyRow({
          trackedQueryHistoryId: row.id,
          overrideKind: kind,
          reason: reason || undefined,
        });
        toast({ title: 'Promoted', description: `${row.source_name} now tracked as ${kind}.` });
        onChange();
      } catch (e: any) {
        toast({ title: 'Promote failed', description: e?.message || 'Try again', variant: 'destructive' });
      } finally {
        setPendingId(null);
      }
    },
    [onChange, toast],
  );

  return (
    <Card className="dashboard-card border-yellow-500/30">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Similar Products in This Series
            <Badge variant="outline" className="text-[10px]">
              {rows.length}
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </button>
        <p className="text-xs text-muted-foreground mt-1.5">
          Same brand &amp; series but a different SKU. These don&apos;t feed the price chart or
          alerts. {isAdmin ? 'If a row was misclassified, click "Promote to tracked" to fold it back into the main list.' : ''}
        </p>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {row.source_name}
                    {row.current_metadata?.product_title && (
                      <span className="ml-2 text-xs text-muted-foreground italic">
                        {row.current_metadata.product_title}
                      </span>
                    )}
                  </div>
                  <a
                    href={safeHref(row.source_url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {new URL(row.source_url).host.replace(/^www\./, '')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {row.match_note && (
                    <div className="text-[11px] text-yellow-600 mt-0.5">{row.match_note}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {row.current_price != null
                        ? `${row.current_currency || '€'}${row.current_price.toFixed(2)}`
                        : '—'}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === row.id}
                        onClick={() => handlePromote(row, 'exact')}
                        className="text-xs h-6 px-2"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Exact
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === row.id}
                        onClick={() => handlePromote(row, 'variant')}
                        className="text-xs h-6 px-2"
                      >
                        Variant
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

// ─── RetailerTable subcomponent ──────────────────────────────────────────────

/**
 * Per-row admin actions (post-consolidation: every internal product is a
 * tracked_query, so all DB writes target tracked_query_price_history).
 *
 *   - Thumb-down: POST /classifier-correction with the row's id from
 *     tracked_query_price_history. Next classifier run pulls it in as
 *     a few-shot example.
 *   - "Trust this reading": flips manual_override=true on the anomaly row
 *     so the median sees it on the next refresh.
 *   - "Dismiss reading": clears is_anomaly so the yellow banner goes away.
 */
const correctClassifier = async (historyRowId: string, kind: string, note?: string) => {
  await submitClassifierCorrection({
    trackedQueryHistoryId: historyRowId,
    correctedMatchKind: kind as 'exact' | 'variant' | 'family' | 'mismatch' | 'unverifiable' | 'should_drop',
    correctionNote: note,
  });
};

const trustAnomalyReading = async (
  trackedQueryId: string,
  productUrl: string,
) => {
  // Mark the most recent anomaly row for this URL as manually trusted —
  // the median sees the price on the next refresh.
  const { error } = await supabase
    .from('tracked_query_price_history')
    .update({ manual_override: true })
    .eq('tracked_query_id', trackedQueryId)
    .eq('product_url', productUrl)
    .eq('is_anomaly', true);
  if (error) throw error;
};

const dismissAnomalyReading = async (
  trackedQueryId: string,
  productUrl: string,
) => {
  // Checks the error, like its sibling trustAnomalyReading above. Without it a denied update
  // resolved quietly, the caller ran onChange() regardless, and the row looked dismissed until
  // the next refresh brought it straight back.
  const { error } = await supabase
    .from('tracked_query_price_history')
    .update({ is_anomaly: false, manual_override: false })
    .eq('tracked_query_id', trackedQueryId)
    .eq('product_url', productUrl)
    .eq('is_anomaly', true);
  if (error) throw error;
};

const RetailerTable: React.FC<{
  rows: CompetitorSource[];
  currentPrice?: number;
  priceDiff: (p: number | null) => number | null;
  isAdmin: boolean;
  productId: string;
  trackedQueryId: string | null;
  onChange?: () => void;
}> = ({ rows, priceDiff, isAdmin, productId, trackedQueryId, onChange }) => {
  // RetailerTable never imported useToast, so seven admin actions had console.error as their
  // ENTIRE user feedback: clicking "Exclude this retailer" on a row that failed looked exactly
  // like one that succeeded, until the next refresh brought the row back.
  const { toast } = useToast();
  return (
  <div className="divide-y">
    {rows.map((r) => {
      const diff = priceDiff(r.current_price);
      const currSym = r.current_currency === 'EUR' ? '€' : r.current_currency === 'GBP' ? '£' : '$';
      const stale = r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() > 1000 * 60 * 60 * 24 * 7;
      const meta = r.current_metadata ?? {};
      const notesStr = typeof meta.notes === 'string' ? meta.notes : null;
      const discrepancy = notesStr && notesStr.includes('verify:') ? notesStr : null;
      const viaMarketplace = notesStr?.match(/via (Skroutz|Bestprice|Shopflix|Google Shopping)/i)?.[1] ?? null;
      const thumb = typeof meta.image_url === 'string' ? meta.image_url : null;
      const rating = typeof meta.rating_value === 'number' ? meta.rating_value : null;
      const ratingVotes = typeof meta.rating_votes === 'number' ? meta.rating_votes : null;
      let favicon: string | null = null;
      try {
        favicon = `https://www.google.com/s2/favicons?domain=${new URL(r.source_url).hostname}&sz=64`;
      } catch {
        favicon = null;
      }
      const isAnomaly = Boolean(r.is_anomaly);
      const rowClasses = [
        'flex items-start justify-between px-6 py-3 gap-3',
        stale ? 'opacity-60' : '',
        isAnomaly ? 'bg-amber-500/5 border-l-4 border-amber-400 -ml-1 pl-5' : '',
      ].filter(Boolean).join(' ');

      return (
        <div key={r.id} className={rowClasses}>
          {thumb && (
            <a href={safeHref(r.source_url)} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img
                src={thumb}
                alt={r.source_name}
                loading="lazy"
                className="h-12 w-12 rounded object-cover bg-muted"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </a>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={safeHref(r.source_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:underline truncate flex items-center gap-1.5"
              >
                {favicon && (
                  <img
                    src={favicon}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 rounded-sm shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <span className="truncate">{r.source_name}</span>
              </a>
              {r.current_price_verified ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-green-400 text-green-700 flex items-center gap-0.5"
                  title={
                    discrepancy
                      ? `Price confirmed by Firecrawl — ${discrepancy}`
                      : "Price confirmed by fetching the retailer's live page"
                  }
                >
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] border-orange-400 text-orange-700 flex items-center gap-0.5"
                  title={
                    'Price could not be confirmed from the retailer\'s live page on the last refresh. ' +
                    'Possible causes: page blocked, captcha, 404, JS-only price that didn\'t hydrate, ' +
                    'or (on first refresh) two scrapes 30s apart disagreed by >5%. ' +
                    'Click "Verify" on this row to retry on demand.'
                  }
                >
                  Unverified
                </Badge>
              )}
              {r.match_kind === 'variant' && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-400 text-amber-700"
                  title={r.match_note ?? 'Different variant (color/finish/size). Excluded from price statistics.'}
                >
                  Variant
                </Badge>
              )}
              {r.match_kind === 'unverifiable' && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-gray-400 text-gray-600"
                  title={r.match_note ?? 'Product identity could not be confirmed from the page.'}
                >
                  Unverified
                </Badge>
              )}
              {discrepancy && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-400 text-amber-700"
                  title={discrepancy}
                >
                  Corrected
                </Badge>
              )}
              {viaMarketplace && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-blue-400 text-blue-700"
                  title={`Discovered through ${viaMarketplace}`}
                >
                  via {viaMarketplace}
                </Badge>
              )}
              {rating !== null && (
                <span
                  className="text-[11px] text-muted-foreground flex items-center gap-0.5"
                  title={ratingVotes ? `${rating.toFixed(1)} / 5 — ${formatNumber(ratingVotes)} reviews` : `${rating.toFixed(1)} / 5`}
                >
                  ★ {rating.toFixed(1)}
                  {ratingVotes !== null && (
                    <span className="ml-0.5">({formatNumber(ratingVotes)})</span>
                  )}
                </span>
              )}
              {r.current_availability === 'out_of_stock' && (
                <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700">
                  Out of stock
                </Badge>
              )}
              {r.current_availability === 'limited' && (
                <Badge variant="outline" className="text-[10px] border-yellow-300 text-yellow-700">
                  Limited
                </Badge>
              )}
              {stale && (
                <Badge variant="outline" className="text-[10px]">
                  Stale
                </Badge>
              )}
            </div>
            {meta.product_title && (
              <div
                className="text-[11px] text-muted-foreground/80 mt-0.5 truncate"
                title={meta.product_title}
              >
                {meta.product_title}
              </div>
            )}
            {isAnomaly && (
              <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-400/40 px-3 py-2 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-amber-900">Anomalous reading flagged</p>
                    {r.anomaly_reason && (
                      <p className="text-amber-800/80 mt-0.5">{r.anomaly_reason}</p>
                    )}
                    {r.rolling_median_at_check != null && (
                      <p className="text-amber-800/70 mt-0.5">
                        7-day median: {currSym}{Number(r.rolling_median_at_check).toFixed(2)}
                        {r.pending_reading_price != null && (
                          <> · rejected reading: {currSym}{Number(r.pending_reading_price).toFixed(2)}</>
                        )}
                      </p>
                    )}
                    {isAdmin && (
                      <div className="flex gap-2 mt-2">
                        {r.pending_reading_price != null && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1 border-amber-500 text-amber-900"
                            onClick={async () => {
                              if (!trackedQueryId) return;
                              try {
                                await trustAnomalyReading(trackedQueryId, r.source_url);
                                onChange?.();
                              } catch (e) {
                                console.error('Trust reading failed', e);
toast({ title: 'Could not trust this reading', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                              }
                            }}
                          >
                            <Check className="h-3 w-3" /> Trust this reading
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] gap-1 text-amber-800"
                          onClick={async () => {
                            if (!trackedQueryId) return;
                            try {
                              await dismissAnomalyReading(trackedQueryId, r.source_url);
                              onChange?.();
                            } catch (e) {
                              console.error('Dismiss reading failed', e);
toast({ title: 'Could not dismiss this reading', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                            }
                          }}
                        >
                          <X className="h-3 w-3" /> Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <a
              href={safeHref(r.source_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:underline flex items-center gap-1 mt-0.5 truncate"
            >
              {new URL(r.source_url).host.replace(/^www\./, '')}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <div className="text-right shrink-0 ml-4 flex flex-col items-end gap-1">
            {isAdmin && r.match_kind && r.match_kind !== 'unverifiable' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                title="Mark this match as wrong — feeds into classifier as a correction example."
                onClick={async () => {
                  const note = window.prompt(
                    `Why is this row classified incorrectly?\n\nCurrent: ${r.match_kind}\nProduct: ${meta.product_title || r.source_name}`,
                    '',
                  );
                  if (note === null) return;
                  try {
                    await correctClassifier(r.id, 'should_drop', note || undefined);
                    onChange?.();
                  } catch (e) {
                    console.error('Correction failed', e);
toast({ title: 'Could not save the correction', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                  }
                }}
              >
                <ThumbsDown className="h-3 w-3" />
                Wrong match
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                title="Re-fetch this URL via Firecrawl now to refresh price + verified flag. Costs 1 Firecrawl credit."
                onClick={async () => {
                  try {
                    await verifyProductSources({ productId, urls: [r.source_url] });
                    onChange?.();
                  } catch (e) {
                    console.error('Verify failed', e);
toast({ title: 'Could not verify this price', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                  }
                }}
              >
                <BadgeCheck className="h-3 w-3" />
                Verify
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                title="Exclude this URL from this product's monitoring (won't reappear on refresh, doesn't affect other products)."
                onClick={async () => {
                  const reason = window.prompt(
                    `Exclude ${r.source_name} from this product's monitoring?\n\nThe row will disappear from the chart, median, and alerts. It won't be re-fetched on refreshes. Other products tracking the same retailer are unaffected.\n\nOptional reason (audit trail):`,
                    '',
                  );
                  if (reason === null) return;
                  try {
                    await excludeProductResult({
                      productId,
                      url: r.source_url,
                      reason: reason || undefined,
                    });
                    onChange?.();
                  } catch (e) {
                    console.error('Exclude failed', e);
toast({ title: 'Could not exclude retailer', description: String((e as Error)?.message ?? e), variant: 'destructive' });
                  }
                }}
              >
                <Ban className="h-3 w-3" />
                Exclude
              </Button>
            )}
            {r.current_price != null ? (
              <>
                <div className="flex items-baseline justify-end gap-2">
                  {r.current_original_price != null &&
                    r.current_original_price > (r.current_price ?? 0) && (
                      <span
                        className="text-xs text-muted-foreground line-through"
                        title="Retailer's 'was' / pre-promo price on the page"
                      >
                        {currSym}
                        {Number(r.current_original_price).toFixed(2)}
                      </span>
                    )}
                  <div className="text-base font-semibold">
                    {currSym}
                    {Number(r.current_price).toFixed(2)}
                  </div>
                </div>
                {diff !== null && (
                  <div className="flex items-center justify-end gap-1 text-[11px]">
                    {diff > 0 ? (
                      <>
                        <TrendingUp className="h-3 w-3 text-red-600" />
                        <span className="text-red-600">+{diff.toFixed(1)}%</span>
                      </>
                    ) : diff < 0 ? (
                      <>
                        <TrendingDown className="h-3 w-3 text-green-600" />
                        <span className="text-green-600">{diff.toFixed(1)}%</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Same</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No price</span>
            )}
          </div>
        </div>
      );
    })}
  </div>
  );
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const mins = Math.round(-diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    return `in ${hrs}h`;
  }
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
