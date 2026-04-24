/**
 * ProductMonitorTab — per-product price monitoring view.
 *
 * Layout (top → bottom, per the rebuilt architecture 2026-04-24):
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
  BadgeCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CompetitorSourceManager } from './CompetitorSourceManager';
import { PriceHistoryChart } from './PriceHistoryChart';
import {
  discoverRetailers,
  startMonitoring,
  stopMonitoring,
  type PerplexityHit,
  type DiscoverResponse,
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
  source_type: 'firecrawl_url' | 'perplexity_web_search' | 'claude_web_search' | 'dataforseo_shopping';
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
  } | null;
  /** Product-identity verdict. null = row created before identity classification shipped. */
  match_kind?: 'exact' | 'variant' | 'unverifiable' | null;
  match_score?: number | null;
  match_note?: string | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [throttleUntil, setThrottleUntil] = useState<string | null>(null);
  const [lastSearchAt, setLastSearchAt] = useState<string | null>(null);
  const [verifyPrices, setVerifyPrices] = useState<boolean>(true);

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
        }))
      );
      setMonitoringEnabled(getDemoMonitoringConfig().monitoring_enabled);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const { data: monitoring } = await supabase
        .from('price_monitoring_products')
        .select('monitoring_enabled, status, last_claude_search_at')
        .eq('product_id', productId)
        .maybeSingle();

      if (monitoring) {
        setMonitoringEnabled(monitoring.monitoring_enabled ?? false);
        setLastSearchAt(monitoring.last_claude_search_at ?? null);
      }

      const { data: rows } = await supabase
        .from('competitor_sources')
        .select(
          'id, source_name, source_url, source_type, current_price, current_original_price, current_price_verified, current_currency, current_availability, current_metadata, match_kind, match_score, match_note, current_price_updated_at, last_seen_at, is_active'
        )
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('current_price', { ascending: true, nullsFirst: false });

      setSources((rows as CompetitorSource[]) || []);
    } catch (err) {
      console.error('Failed to load competitor sources', err);
      toast({ title: 'Error', description: 'Could not load retailer list', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [productId, currentPrice, currency, isDemo, toast]);

  const loadAdminRole = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role_id')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (!profile?.role_id) return;
    const { data: role } = await supabase
      .from('roles')
      .select('name')
      .eq('id', profile.role_id)
      .maybeSingle();
    setIsAdmin(['admin', 'super_admin'].includes((role?.name as string) || ''));
  }, []);

  useEffect(() => {
    loadSources();
    loadAdminRole();
  }, [loadSources, loadAdminRole]);

  // ─── Perplexity discovery ────────────────────────────────────────────────
  const runDiscovery = useCallback(
    async (forceRefresh: boolean) => {
      if (isDemo) {
        toast({ title: 'Demo mode', description: 'Discovery is disabled for demo products' });
        return;
      }
      try {
        setIsDiscovering(true);
        const result: DiscoverResponse = await discoverRetailers(productId, forceRefresh, verifyPrices);
        if (!result.success) {
          toast({
            title: 'Discovery failed',
            description: result.error ?? 'Unknown error',
            variant: 'destructive',
          });
          return;
        }
        setThrottleUntil(result.throttle_until);
        setLastSearchAt(result.last_search_at);
        setSummary(result.summary ?? null);
        if (result.throttled) {
          toast({
            title: 'Using cached results',
            description: `Last refresh ${timeAgo(result.last_search_at)}. Next allowed ${timeAgo(result.throttle_until)}.`,
          });
        } else {
          toast({
            title: 'Discovery complete',
            description: `${result.total_results} retailers, ${result.credits_used} credits used.`,
          });
        }
        await loadSources();
      } catch (err: any) {
        toast({ title: 'Error', description: err?.message ?? 'Failed', variant: 'destructive' });
      } finally {
        setIsDiscovering(false);
      }
    },
    [productId, isDemo, loadSources, toast, verifyPrices]
  );

  const handleToggleMonitoring = useCallback(async () => {
    if (isDemo) return;
    try {
      setIsToggling(true);
      if (!monitoringEnabled) {
        await startMonitoring(productId, 'daily');
        setMonitoringEnabled(true);
        toast({ title: 'Monitoring enabled', description: 'Discovering retailers…' });
        await runDiscovery(false);
      } else {
        await stopMonitoring(productId);
        setMonitoringEnabled(false);
        toast({ title: 'Monitoring paused' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Toggle failed', variant: 'destructive' });
    } finally {
      setIsToggling(false);
    }
  }, [monitoringEnabled, productId, runDiscovery, isDemo, toast]);

  // ─── Derived data ────────────────────────────────────────────────────────
  const discovered = useMemo(
    () =>
      sources
        .filter(
          (s) => s.source_type === 'perplexity_web_search' || s.source_type === 'claude_web_search'
        )
        .slice(0, 10),
    [sources]
  );
  const merchants = useMemo(
    () => sources.filter((s) => s.source_type === 'dataforseo_shopping').slice(0, 10),
    [sources]
  );
  const custom = useMemo(() => sources.filter((s) => s.source_type === 'firecrawl_url'), [sources]);

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
              </div>
            </div>
            <div className="flex items-center gap-2">
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

      {/* ─── Discovered retailers (Perplexity) ─── */}
      {monitoringEnabled && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
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
            {discovered.length > 0 && <RetailerTable rows={discovered} currentPrice={currentPrice} priceDiff={priceDiff} />}
          </CardContent>
        </Card>
      )}

      {/* ─── Merchants (Google Shopping via DataForSEO) ─── */}
      {monitoringEnabled && merchants.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
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
            <RetailerTable rows={merchants} currentPrice={currentPrice} priceDiff={priceDiff} />
          </CardContent>
        </Card>
      )}

      {/* ─── Custom Monitoring (Firecrawl) ─── */}
      {monitoringEnabled && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
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
              <RetailerTable rows={custom} currentPrice={currentPrice} priceDiff={priceDiff} />
            )}
          </CardContent>
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

// ─── RetailerTable subcomponent ──────────────────────────────────────────────

const RetailerTable: React.FC<{
  rows: CompetitorSource[];
  currentPrice?: number;
  priceDiff: (p: number | null) => number | null;
}> = ({ rows, priceDiff }) => (
  <div className="divide-y">
    {rows.map((r) => {
      const diff = priceDiff(r.current_price);
      const currSym = r.current_currency === 'EUR' ? '€' : r.current_currency === 'GBP' ? '£' : '$';
      const stale = r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() > 1000 * 60 * 60 * 24 * 7;
      const meta = r.current_metadata ?? {};
      const discrepancy = typeof meta.notes === 'string' && meta.notes.includes('verify:') ? meta.notes : null;
      const thumb = typeof meta.image_url === 'string' ? meta.image_url : null;
      const rating = typeof meta.rating_value === 'number' ? meta.rating_value : null;
      const ratingVotes = typeof meta.rating_votes === 'number' ? meta.rating_votes : null;
      return (
        <div key={r.id} className={`flex items-center justify-between px-6 py-3 gap-3 ${stale ? 'opacity-60' : ''}`}>
          {thumb && (
            <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
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
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sm hover:underline truncate"
              >
                {r.source_name}
              </a>
              {r.current_price_verified && (
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
              {rating !== null && (
                <span
                  className="text-[11px] text-muted-foreground flex items-center gap-0.5"
                  title={ratingVotes ? `${rating.toFixed(1)} / 5 — ${ratingVotes.toLocaleString()} reviews` : `${rating.toFixed(1)} / 5`}
                >
                  ★ {rating.toFixed(1)}
                  {ratingVotes !== null && (
                    <span className="ml-0.5">({ratingVotes.toLocaleString()})</span>
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
            <a
              href={r.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:underline flex items-center gap-1 mt-0.5 truncate"
            >
              {new URL(r.source_url).host.replace(/^www\./, '')}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <div className="text-right shrink-0 ml-4">
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
