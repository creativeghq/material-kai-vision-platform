/**
 * MentionMonitorTab — per-product mention monitoring view.
 *
 * Layout (top → bottom):
 *   1. Header with Enable toggle + Admin "Refresh now" + alert prefs
 *   2. KPI strip: 7d count, 30d count, sentiment avg, top outlet
 *   3. Tabs: Feed | Sentiment | Outlets | LLM Visibility
 *   4. Footer: cadence + last refresh
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  RefreshCw, ExternalLink, AlertCircle, Sparkles, Bell, Globe,
  TrendingUp, TrendingDown, MessageSquare, Bot, Newspaper, ThumbsDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildMentionFeedFilters } from './mentionFilters';
import {
  TrackedMention, MentionRow, MentionSummary, LlmVisibilitySnapshot,
  trackProduct, untrackProduct, getProductMonitoring, refreshProduct,
  getProductFeed, getProductSummary, getProductLlmVisibility, probeProductLlm,
  updateTrackedMention, submitMentionClassifierCorrection,
} from '@/services/mentionMonitoringApi';

interface Props {
  productId: string;
  productName: string;
  manufacturer?: string | null;
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: 'bg-green-500/20 text-green-300 border-green-500/40',
  neutral: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  negative: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const OUTLET_ICON: Record<string, React.ReactNode> = {
  news: <Newspaper className="h-3 w-3" />,
  blog: <MessageSquare className="h-3 w-3" />,
  youtube: <Bot className="h-3 w-3" />,
  rss: <Globe className="h-3 w-3" />,
  forum: <MessageSquare className="h-3 w-3" />,
  other: <Globe className="h-3 w-3" />,
  llm: <Bot className="h-3 w-3" />,
  aggregator: <Globe className="h-3 w-3" />,
};

export const MentionMonitorTab: React.FC<Props> = ({ productId, productName }) => {
  const { toast } = useToast();
  // #195 — admin-only diagnostic actions (force-refresh, classifier correction, promote) are
  // operator-level platform controls. Resolved from the unified capability layer.
  const { can } = usePermissions();
  const admin = can('platform.admin');
  const [tracked, setTracked] = useState<TrackedMention | null>(null);
  const [summary, setSummary] = useState<MentionSummary | null>(null);
  const [feed, setFeed] = useState<MentionRow[]>([]);
  const [llm, setLlm] = useState<LlmVisibilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [probing, setProbing] = useState(false);

  const feedFilterGroups = useMemo(() => buildMentionFeedFilters(feed), [feed]);
  const {
    values: feedFilterValues, setValues: setFeedFilterValues,
    filtered: filteredFeed, previewCount: feedPreviewCount,
  } = useFilters<MentionRow>(feed, feedFilterGroups);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getProductMonitoring(productId);
      setTracked(t);
      if (t?.id) {
        const [s, f, v] = await Promise.all([
          getProductSummary(productId, 30),
          getProductFeed(productId, { limit: 100 }),
          getProductLlmVisibility(productId),
        ]);
        setSummary(s);
        setFeed(f);
        setLlm(v);
      } else {
        setSummary(null);
        setFeed([]);
        setLlm(null);
      }
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    try {
      if (enabled) {
        const t = await trackProduct(productId, { run_first_refresh: true });
        setTracked(t);
        toast({ title: 'Mention monitoring enabled', description: 'First refresh in progress...' });
      } else {
        await untrackProduct(productId);
        setTracked(null);
        setSummary(null);
        setFeed([]);
        setLlm(null);
      }
    } catch (e: any) {
      toast({ title: 'Toggle failed', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [productId, toast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const o = await refreshProduct(productId, { force: admin });
      toast({
        title: o.status === 'refreshed' ? `Refresh complete: ${o.hits_count || 0} mentions` : `Refresh ${o.status}`,
        description: o.errors && Object.keys(o.errors).length ? `Errors: ${Object.keys(o.errors).join(', ')}` : undefined,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [productId, admin, toast, load]);

  const handleProbeLlm = useCallback(async () => {
    setProbing(true);
    try {
      const r = await probeProductLlm(productId);
      toast({ title: 'LLM probe complete', description: `${r.probe_count} probes, $${r.total_cost_usd.toFixed(4)}` });
      const v = await getProductLlmVisibility(productId);
      setLlm(v);
    } catch (e: any) {
      toast({ title: 'Probe failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setProbing(false);
    }
  }, [productId, toast]);

  const handleUpdateAlerts = useCallback(async (patch: Partial<TrackedMention>) => {
    if (!tracked) return;
    try {
      const updated = await updateTrackedMention(tracked.id, patch as any);
      if (updated) setTracked(updated);
    } catch (e: any) {
      toast({ title: 'Update failed', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [tracked, toast]);

  const handleCorrect = useCallback(async (row: MentionRow, corrected: 'mismatch' | 'exact') => {
    try {
      await submitMentionClassifierCorrection({
        mentionHistoryId: row.id,
        correctedRelevance: corrected,
        correctionNote: `Admin corrected ${row.relevance} → ${corrected}`,
      });
      toast({ title: 'Correction recorded' });
      await load();
    } catch (e: any) {
      toast({ title: 'Correction failed', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [toast, load]);

  const enabled = !!tracked?.is_active;

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="p-6 text-sm text-muted-foreground">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Mention Monitoring
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              News, blogs, RSS, and LLM mentions of <span className="font-medium">{productName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <span className="text-xs text-muted-foreground">{enabled ? 'Active' : 'Off'}</span>
            <Switch checked={enabled} onCheckedChange={handleToggle} />
            {admin && enabled && (
              <Button onClick={handleRefresh} disabled={refreshing} size="sm" variant="outline" className="rounded-full">
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {!enabled && (
        <Alert className="dashboard-card">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Toggle on to start tracking mentions across news, blogs, RSS feeds, and LLM responses.
          </AlertDescription>
        </Alert>
      )}

      {enabled && tracked && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="dashboard-card"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Last 7 days</div>
              <div className="text-2xl font-medium">{tracked.current_mention_count_7d ?? 0}</div>
            </CardContent></Card>
            <Card className="dashboard-card"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Last 30 days</div>
              <div className="text-2xl font-medium">{tracked.current_mention_count_30d ?? 0}</div>
            </CardContent></Card>
            <Card className="dashboard-card"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Sentiment avg</div>
              <div className="text-2xl font-medium flex items-center gap-1">
                {tracked.current_sentiment_avg !== null && tracked.current_sentiment_avg !== undefined
                  ? tracked.current_sentiment_avg.toFixed(2) : '—'}
                {(tracked.current_sentiment_avg ?? 0) > 0.1 ? <TrendingUp className="h-4 w-4 text-green-500" />
                  : (tracked.current_sentiment_avg ?? 0) < -0.1 ? <TrendingDown className="h-4 w-4 text-red-500" /> : null}
              </div>
            </CardContent></Card>
            <Card className="dashboard-card"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Top outlet</div>
              <div className="text-sm font-medium truncate">
                {tracked.current_top_outlets?.[0]?.domain || '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {tracked.current_top_outlets?.[0]?.count
                  ? `${tracked.current_top_outlets[0].count} mentions`
                  : null}
              </div>
            </CardContent></Card>
          </div>

          {/* Alert preferences */}
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" /> Alert preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                ['Spike', 'alert_on_spike'],
                ['Negative', 'alert_on_negative_sentiment'],
                ['New outlet', 'alert_on_new_outlet'],
                ['LLM shift', 'alert_on_llm_visibility_change'],
              ] as const).map(([label, key]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch
                    checked={Boolean(tracked[key])}
                    onCheckedChange={(v) => handleUpdateAlerts({ [key]: v } as any)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Main tabs */}
          <Tabs defaultValue="feed">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="feed" className="flex items-center gap-2">Feed ({filteredFeed.length})</TabsTrigger>
              <TabsTrigger value="outlets" className="flex items-center gap-2">Outlets</TabsTrigger>
              <TabsTrigger value="llm" className="flex items-center gap-2">LLM Visibility</TabsTrigger>
            </TabsList>

            {/* Feed */}
            <TabsContent value="feed" className="space-y-3 mt-4">
              <FilterBar
                groups={feedFilterGroups}
                values={feedFilterValues}
                onChange={setFeedFilterValues}
                previewCount={feedPreviewCount}
                title="Filter mentions"
                searchPlaceholder="Search title, excerpt, outlet…"
              />

              <Card className="dashboard-card">
                <CardContent className="p-0">
                  {filteredFeed.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No mentions yet. {enabled && admin ? 'Click "Refresh" to discover.' : ''}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredFeed.map((row) => (
                        <li key={row.id} className="p-4 hover:bg-white/5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                                  {OUTLET_ICON[row.outlet_type] || OUTLET_ICON.other}
                                  {row.outlet_type}
                                </Badge>
                                {row.sentiment && (
                                  <Badge className={`text-[10px] ${SENTIMENT_BADGE[row.sentiment]}`}>
                                    {row.sentiment}
                                  </Badge>
                                )}
                                {row.is_anomaly && (
                                  <Badge className="text-[10px] bg-yellow-500/20 text-yellow-300 border-yellow-500/40">
                                    anomaly
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground truncate">
                                  {row.outlet_name || row.outlet_domain}
                                </span>
                                {row.published_at && (
                                  <span className="text-xs text-muted-foreground">
                                    · {new Date(row.published_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <a href={row.url} target="_blank" rel="noopener noreferrer"
                                 className="font-medium text-sm hover:underline flex items-center gap-1">
                                {row.title || row.url}
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </a>
                              {row.excerpt && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.excerpt}</p>
                              )}
                              {row.match_note && (
                                <p className="text-[10px] text-muted-foreground mt-1 italic">{row.match_note}</p>
                              )}
                            </div>
                            {admin && row.relevance !== 'mismatch' && (
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                                onClick={() => handleCorrect(row, 'mismatch')}
                                title="Mark as wrong match"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Outlets */}
            <TabsContent value="outlets" className="mt-4">
              <Card className="dashboard-card">
                <CardContent className="p-4">
                  {(tracked.current_top_outlets || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No outlets yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {(tracked.current_top_outlets || []).map((o) => (
                        <li key={o.domain} className="flex items-center justify-between text-sm">
                          <span>{o.domain}</span>
                          <Badge variant="outline">{o.count}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* LLM */}
            <TabsContent value="llm" className="mt-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                <div className="min-w-0">
                  <h4 className="text-sm font-medium">LLM Visibility</h4>
                  <p className="text-xs text-muted-foreground">
                    How this product appears in AI answers across cheap-tier models.
                  </p>
                </div>
                {admin && (
                  <Button size="sm" onClick={handleProbeLlm} disabled={probing} className="rounded-full">
                    <Bot className={`h-3 w-3 mr-1 ${probing ? 'animate-spin' : ''}`} />
                    {probing ? 'Probing...' : 'Run probe (2 cr)'}
                  </Button>
                )}
              </div>
              <Card className="dashboard-card">
                <CardContent className="p-4">
                  {!llm?.present ? (
                    <div className="text-sm text-muted-foreground">No probes run yet.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Share of voice</div>
                          <div className="text-2xl font-medium">
                            {((llm.share_of_voice || 0) * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Average rank</div>
                          <div className="text-2xl font-medium">
                            {llm.avg_position ? `#${llm.avg_position.toFixed(1)}` : '—'}
                          </div>
                        </div>
                      </div>
                      {llm.per_model && (
                        <div>
                          <div className="text-xs font-medium mb-1">Per model</div>
                          <ul className="text-xs space-y-1">
                            {Object.entries(llm.per_model).map(([model, stats]: any) => (
                              <li key={model} className="flex justify-between">
                                <span>{model}</span>
                                <span className="text-muted-foreground">
                                  {stats.mentioned}/{stats.probes} mentions
                                  {stats.positions?.length
                                    ? ` · avg #${(stats.positions.reduce((a: number, b: number) => a + b, 0) / stats.positions.length).toFixed(1)}`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {llm.top_competitors && llm.top_competitors.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">Top co-mentioned competitors</div>
                          <div className="flex flex-wrap gap-1">
                            {llm.top_competitors.slice(0, 8).map(([name, count]) => (
                              <Badge key={String(name)} variant="outline" className="text-[10px]">
                                {String(name)} · {count}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            Cadence: every {tracked.refresh_interval_hours || 24}h ·
            {tracked.last_refreshed_at ? ` last refreshed ${new Date(tracked.last_refreshed_at).toLocaleString()}` : ' never refreshed'}
          </div>
        </>
      )}
    </div>
  );
};

export default MentionMonitorTab;
