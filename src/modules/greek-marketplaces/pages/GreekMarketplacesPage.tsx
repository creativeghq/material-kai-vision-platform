import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  ShoppingCart,
  Store,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useModule } from '@/modules/_core';
import { MIVAA_API_URL as MIVAA_BASE_URL } from '@/config/mivaa';

interface SourceStatus {
  key: string;
  name: string;
  configured: boolean;
  details: string;
}

interface ModuleStats {
  queries_7d: number;
  credits_7d: number;
  per_source_7d: Record<string, number>;
}

interface ModuleStatusPayload {
  slug: string;
  enabled: boolean;
  sources: SourceStatus[];
  stats: ModuleStats;
}

interface PriceHit {
  retailer_name: string;
  product_url: string;
  price: number | null;
  original_price: number | null;
  currency: string | null;
  availability: string | null;
  source: string;
  verified: boolean;
}

interface SearchResponse {
  hits: PriceHit[];
  counts: Record<string, number>;
  elapsed_ms: number;
}

async function callModuleApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${MIVAA_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

const GreekMarketplacesPage: React.FC = () => {
  const { enabled, isLoading: moduleLoading } = useModule('greek-marketplaces');
  const { toast } = useToast();

  const [status, setStatus] = useState<ModuleStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const payload = await callModuleApi<ModuleStatusPayload>('/api/v1/modules/greek-marketplaces/status');
      setStatus(payload);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const result = await callModuleApi<SearchResponse>(
        '/api/v1/modules/greek-marketplaces/search',
        {
          method: 'POST',
          body: JSON.stringify({ query: query.trim(), country_code: 'GR', limit: 15 }),
        },
      );
      setSearchResult(result);
      toast({
        title: `${result.hits.length} hits in ${result.elapsed_ms}ms`,
        description: Object.entries(result.counts).map(([s, n]) => `${s}: ${n}`).join(' · ') || 'No sources returned hits',
      });
    } catch (err) {
      toast({
        title: 'Search failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const moduleEnabled = enabled && !moduleLoading;

  return (
    <div>
      <PageHeader
        icon={ShoppingCart}
        title="Greek Marketplaces"
        subtitle="Always-on discovery sources for price monitoring on Greek-market products"
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/admin/modules">
              <ArrowLeft className="h-4 w-4" />
              Back to Modules
            </Link>
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* Module state */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>How it works</CardTitle>
                <CardDescription className="mt-2">
                  When enabled, this module runs Skroutz + Bestprice + Shopflix in parallel with Perplexity and
                  DataForSEO on every price discovery refresh — only for products with{' '}
                  <code>country_code = "GR"</code>. Their hits override Perplexity/DataForSEO rows for the same
                  retailer domain.
                </CardDescription>
              </div>
              <Badge variant={moduleEnabled ? 'default' : 'secondary'}>
                {moduleLoading ? 'Loading' : moduleEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* 7-day usage stats */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Usage · last 7 days</CardTitle>
              <CardDescription>From <code>ai_usage_logs</code> tagged with this module.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={loadStatus} disabled={statusLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Queries</p>
                <p className="text-2xl font-light">{status?.stats.queries_7d ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credits used</p>
                <p className="text-2xl font-light">{status?.stats.credits_7d.toFixed(2) ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">By source</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {status && Object.keys(status.stats.per_source_7d).length > 0 ? (
                    Object.entries(status.stats.per_source_7d).map(([s, n]) => (
                      <Badge key={s} variant="outline">{s}: {n}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No tagged events yet.</span>
                  )}
                </div>
              </div>
            </div>
            {statusError && (
              <p className="text-xs text-destructive mt-3">Could not load status: {statusError}</p>
            )}
          </CardContent>
        </Card>

        {/* Source-status cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(status?.sources ?? [
            { key: 'skroutz', name: 'Skroutz', configured: false, details: 'Loading…' },
            { key: 'bestprice', name: 'Bestprice.gr', configured: false, details: 'Loading…' },
            { key: 'shopflix', name: 'Shopflix.gr', configured: false, details: 'Loading…' },
          ]).map((source) => (
            <Card key={source.key}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{source.name}</CardTitle>
                  </div>
                  {source.configured ? (
                    <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-500/30">
                      <XCircle className="h-3 w-3 mr-1" /> Missing credentials
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{source.details}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Test search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test search</CardTitle>
            <CardDescription>
              Run a one-off query against all three sources. Does not write to <code>tracked_queries</code> or{' '}
              <code>tracked_query_price_history</code>. Credits debit normally.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <Label htmlFor="query" className="mb-1">Product query</Label>
                <Input
                  id="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Maidtec 7012ΜΤ απορροφητήρας"
                  disabled={searching || !moduleEnabled}
                  onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                />
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <Label className="mb-1">Country</Label>
                  <div className="h-9 px-3 flex items-center rounded-md border border-white/10 bg-white/5 text-sm text-muted-foreground">
                    GR
                  </div>
                </div>
                <Button
                  onClick={runSearch}
                  disabled={!query.trim() || searching || !moduleEnabled}
                  className="gap-2"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run
                </Button>
              </div>
            </div>

            {!moduleEnabled && (
              <p className="text-xs text-muted-foreground">
                Module must be enabled to run a test search. Toggle it on from{' '}
                <Link to="/admin/modules" className="text-primary hover:underline">Modules</Link>.
              </p>
            )}

            {searchResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{searchResult.hits.length} hits</span>
                  <span>·</span>
                  <span>{searchResult.elapsed_ms}ms</span>
                  <span>·</span>
                  <span>{Object.entries(searchResult.counts).map(([s, n]) => `${s}: ${n}`).join(' · ') || 'no sources'}</span>
                </div>

                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Source</th>
                        <th className="text-left px-3 py-2 font-medium">Retailer</th>
                        <th className="text-right px-3 py-2 font-medium">Price</th>
                        <th className="text-left px-3 py-2 font-medium">Availability</th>
                        <th className="text-left px-3 py-2 font-medium">URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResult.hits.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                            No hits returned.
                          </td>
                        </tr>
                      )}
                      {searchResult.hits.map((hit, idx) => (
                        <tr key={`${hit.source}-${hit.product_url}-${idx}`} className="border-t border-white/5">
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="capitalize">{hit.source}</Badge>
                          </td>
                          <td className="px-3 py-2">{hit.retailer_name}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {hit.price != null
                              ? `${hit.price.toFixed(2)} ${hit.currency || ''}`.trim()
                              : '—'}
                            {hit.original_price != null && hit.original_price !== hit.price && (
                              <span className="ml-2 line-through text-muted-foreground">
                                {hit.original_price.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground capitalize">
                            {hit.availability || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <a
                              href={hit.product_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Open
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GreekMarketplacesPage;
