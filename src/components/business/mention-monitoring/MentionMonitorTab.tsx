/**
 * MentionMonitorTab — one tracked subject's mention monitoring view.
 *
 * Takes a `MentionSubjectRef`, not a product id. `tracked_mentions` holds two kinds of
 * row — a product enrolment and a free brand/keyword subject — and this screen only ever
 * spoke the first, while every real row on this platform is the second. So the component
 * rendered nothing openable: the admin list showed 17 subjects and could open none of
 * them, and 636 probe rows across 50 runs had no screen at all.
 *
 * Everything below the `tracked` lookup was already ref-agnostic (it works off
 * `tracked.id`); only the six readers were product-shaped, and they are now one set that
 * takes the ref.
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  RefreshCw, ExternalLink, AlertCircle, Sparkles, Bell, Globe,
  TrendingUp, TrendingDown, MessageSquare, Bot, Newspaper, ThumbsDown, Ban, ThumbsUp,
  Link2, Ghost,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildMentionFeedFilters } from './mentionFilters';
import { formatDate } from '@/utils/datetime';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  TrackedMention, MentionRow, LlmVisibilitySnapshot, LlmVisibilityTrend, MentionExclusion,
  MentionSubjectRef, ShareOfVoice,
  trackProduct, untrackProduct, updateTrackedMention,
  getSubjectMonitoring, getSubjectFeed, getSubjectLlmVisibility,
  getSubjectLlmVisibilityTrend, probeSubjectLlm, refreshSubject,
  getSubjectOpportunities, Opportunity, OpportunitiesResponse,
  getSubjectAiOverviewHistory, AiOverviewHistory, MentionProbeTier,
  shareOfVoice, submitMentionClassifierCorrection,
  listExclusions, excludeMentionUrl, includeMentionUrl, promoteMentionUrl,
} from '@/services/mentionMonitoringApi';

interface Props {
  /** Which tracked row this is. A product enrolment or a free brand/keyword subject. */
  subject: MentionSubjectRef;
  /** What to call it on screen — product name, brand, or the subject label. */
  subjectName: string;
  manufacturer?: string | null;
}

/**
 * Human wording per opportunity type. A map, not a `.replace('_', ' ')`, because the
 * backend keys are internal (`pao_question`, `paid_competitor`) and reading one raw tells
 * an operator nothing about what they are being asked to do.
 */
const OPPORTUNITY_LABELS: Record<string, string> = {
  keyword_opportunity: 'Keyword gap',
  pao_question: 'People also ask',
  ai_overview: 'AI Overview',
  featured_snippet: 'Featured snippet',
  related_search: 'Related search',
  competitor_ranking: 'Competitor ranks here',
  video_carousel: 'Video carousel',
  news_carousel: 'News carousel',
  knowledge_graph: 'Knowledge panel',
  paid_competitor: 'Competitor is paying',
  shopping_listing: 'Shopping listing',
  llm_visibility: 'LLM visibility',
  domain_snapshot: 'Domain snapshot',
  trending_topic: 'Trending topic',
  outlet_pitch: 'Outlet to pitch',
  author_relationship: 'Author to know',
  sentiment_response: 'Needs a response',
};

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

export const MentionMonitorTab: React.FC<Props> = ({ subject, subjectName }) => {
  const { toast } = useToast();
  // admin-only diagnostic actions (force-refresh, classifier correction, promote) are
  // operator-level platform controls. Resolved from the unified capability layer.
  const { can } = usePermissions();
  const admin = can('platform.admin');
  const [tracked, setTracked] = useState<TrackedMention | null>(null);
  const [feed, setFeed] = useState<MentionRow[]>([]);
  // Exclusions were reachable through the API and through nothing else: all four bindings
  // (list / exclude / include / promote) had exactly one reference each — their own definition.
  // A wrong or noisy outlet therefore stayed in the feed permanently, unlike the price-monitoring
  // twin which wires the same four on RetailerTable. (#310 item 5)
  const [exclusions, setExclusions] = useState<MentionExclusion[]>([]);
  const [showExclusions, setShowExclusions] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [llm, setLlm] = useState<LlmVisibilitySnapshot | null>(null);
  const [llmTrend, setLlmTrend] = useState<LlmVisibilityTrend | null>(null);
  const [sov, setSov] = useState<ShareOfVoice | null>(null);
  const [aio, setAio] = useState<AiOverviewHistory | null>(null);
  const [opps, setOpps] = useState<OpportunitiesResponse | null>(null);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [probing, setProbing] = useState(false);

  // Formatted here, derived in MIVAA: `change` comes off the same windowed read the
  // chart draws, so the headline delta and the line can never disagree.
  const sovDelta = llmTrend?.change?.share_of_voice ?? null;
  const rankDelta = llmTrend?.change?.avg_position ?? null;
  const trendChartData = useMemo(
    () => (llmTrend?.points || []).map((pt) => ({
      label: formatDate(pt.run_at),
      shareOfVoice: Math.round(pt.share_of_voice * 100),
      avgPosition: pt.avg_position,
    })),
    [llmTrend],
  );

  /**
   * The subject and its competitors on one scale, biggest first.
   *
   * Derived from `totals`, which MIVAA computes over the same probe rows the trend line
   * is drawn from — never re-counted here from `llm.top_competitors`, which is a second
   * tally over a different window and would disagree the moment the two windows differ.
   */
  const sovRows = useMemo(() => {
    const totals = sov?.totals;
    if (!totals) return [];
    const rows = [
      { name: sov?.subject_label || subjectName, count: totals.subject_mentions, isSubject: true },
      ...totals.competitor_mentions.map((c) => ({ name: c.name, count: c.count, isSubject: false })),
    ];
    const named = rows.reduce((sum, r) => sum + r.count, 0);
    if (!named) return [];
    return rows
      .map((r) => ({ ...r, share: r.count / named }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [sov, subjectName]);

  const feedFilterGroups = useMemo(() => buildMentionFeedFilters(feed), [feed]);
  const {
    values: feedFilterValues, setValues: setFeedFilterValues,
    filtered: filteredFeed, previewCount: feedPreviewCount,
  } = useFilters<MentionRow>(feed, feedFilterGroups);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getSubjectMonitoring(subject);
      setTracked(t);
      if (t?.id) {
        // getSubjectSummary is deliberately NOT fetched: it was called on every tab open and
        // its result never read — the KPI strip renders from `tracked.current_*`. A paid
        // round-trip per open, discarded.
        const [f, v, tr, sv, ao] = await Promise.all([
          getSubjectFeed(subject, { limit: 100 }),
          getSubjectLlmVisibility(subject),
          getSubjectLlmVisibilityTrend(subject, 90),
          // Share of voice is subject-addressed on the backend, so a product enrolment
          // reaches it through its own tracked id once we have the row.
          shareOfVoice(t.id, 90).catch(() => null),
          // A read of already-recorded checks — no SERP call, no credits.
          getSubjectAiOverviewHistory(subject, 90).catch(() => null),
        ]);
        setFeed(f);
        setLlm(v);
        setLlmTrend(tr);
        setSov(sv);
        setAio(ao);
      } else {
        setFeed([]);
        setLlm(null);
        setLlmTrend(null);
        setSov(null);
        setAio(null);
      }
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [subject, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    try {
      if (subject.kind === 'product') {
        // A product is ENROLLED or not — there is no row until you turn it on.
        if (enabled) {
          const t = await trackProduct(subject.productId, { run_first_refresh: true });
          setTracked(t);
          toast({ title: 'Mention monitoring enabled', description: 'First refresh in progress...' });
        } else {
          await untrackProduct(subject.productId);
          setTracked(null);
          setFeed([]);
          setLlm(null);
          setLlmTrend(null);
          setSov(null);
        }
        return;
      }
      // A brand/keyword subject already EXISTS — the toggle pauses it rather than
      // deleting it, so its probe history (and everything derived from it) survives.
      if (!tracked?.id) return;
      const updated = await updateTrackedMention(tracked.id, { is_active: enabled });
      if (updated) setTracked(updated);
      toast({ title: enabled ? 'Subject resumed' : 'Subject paused' });
    } catch (e: any) {
      toast({ title: 'Toggle failed', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [subject, tracked?.id, toast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const o = await refreshSubject(subject, { force: admin });
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
  }, [subject, admin, toast, load]);

  const handleProbeLlm = useCallback(async () => {
    setProbing(true);
    try {
      const r = await probeSubjectLlm(subject);
      toast({
        title: 'LLM probe complete',
        description: `${r.probe_count} probes, $${r.total_cost_usd.toFixed(4)}`
          // A run that silently dropped to fewer models is still billed as its tier.
          + (r.models_unavailable?.length ? ` · no key for ${r.models_unavailable.join(', ')}` : '')
          + (r.failed_calls ? ` · ${r.failed_calls} call(s) failed` : ''),
      });
      const [v, tr, sv] = await Promise.all([
        getSubjectLlmVisibility(subject),
        getSubjectLlmVisibilityTrend(subject, 90),
        tracked?.id ? shareOfVoice(tracked.id, 90).catch(() => null) : Promise.resolve(null),
      ]);
      setLlm(v);
      setLlmTrend(tr);
      setSov(sv);
    } catch (e: any) {
      toast({ title: 'Probe failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setProbing(false);
    }
  }, [subject, tracked?.id, toast]);

  /**
   * Opportunities are fetched ON DEMAND, never with the tab.
   *
   * The call is a live SERP round-trip against DataForSEO and it is metered. Firing it on
   * every tab open would bill the owner for a panel they may never scroll to — the exact
   * shape `getProductSummary` had before it was removed from `load`.
   */
  const loadOpportunities = useCallback(async () => {
    setOppsLoading(true);
    try {
      setOpps(await getSubjectOpportunities(subject, { days: 30, limit_per_type: 5 }));
    } catch (e: any) {
      toast({ title: 'Could not load opportunities', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setOppsLoading(false);
    }
  }, [subject, toast]);

  /**
   * Change which models the probe uses.
   *
   * Warns before switching, because the cost is not the only consequence: every run
   * already recorded was measured with the other set, so the trend line breaks here and
   * the platform will refuse to compare across it. That is the correct behaviour and it
   * is also surprising, so it gets said before rather than discovered after.
   */
  const handleTierChange = useCallback(async (tier: MentionProbeTier) => {
    if (!tracked?.id || tier === (tracked.probe_tier || 'cheap')) return;
    try {
      const updated = await updateTrackedMention(tracked.id, { probe_tier: tier });
      if (updated) setTracked(updated);
      toast({
        title: tier === 'frontier' ? 'Switched to the frontier tier' : 'Switched to the cheap tier',
        description:
          'Runs before and after this change were measured with different models, so the '
          + 'trend will not compare across it.',
      });
    } catch (e: any) {
      toast({ title: 'Could not change tier', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [tracked?.id, tracked?.probe_tier, toast]);

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

  const loadExclusions = useCallback(async (trackedId: string) => {
    try {
      setExclusions(await listExclusions(trackedId));
    } catch (e) {
      // Non-fatal: the feed is still usable without the exclusions panel. Logged rather than
      // swallowed so a broken endpoint is visible instead of looking like "nothing excluded".
      console.error('Could not load mention exclusions', e);
    }
  }, []);

  useEffect(() => {
    if (tracked?.id) void loadExclusions(tracked.id);
  }, [tracked?.id, loadExclusions]);

  /** Hide every future mention from this outlet. Domain-level, because the noisy unit is the
   *  outlet, not the individual article — excluding one URL from a syndicating site is whack-a-mole. */
  const handleExclude = useCallback(async (row: MentionRow) => {
    if (!tracked?.id) return;
    const domain = row.outlet_domain || undefined;
    setBusyUrl(row.url);
    try {
      await excludeMentionUrl({
        trackedMentionId: tracked.id,
        ...(domain ? { domain } : { url: row.url }),
        reason: `Excluded from ${subjectName} feed by an admin`,
      });
      toast({
        title: domain ? `Excluded ${domain}` : 'Excluded this URL',
        description: 'It will not appear in this subject\u2019s feed again. Restore it from Excluded sources.',
      });
      await Promise.all([load(), loadExclusions(tracked.id)]);
    } catch (e: any) {
      toast({ title: 'Could not exclude', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setBusyUrl(null);
    }
  }, [tracked?.id, subjectName, toast, load, loadExclusions]);

  /** Force a mention the classifier down-ranked back to `exact`. The counterpart to the existing
   *  "wrong match" thumbs-down: without it an operator could only ever push results DOWN. */
  const handlePromote = useCallback(async (row: MentionRow) => {
    if (!tracked?.id) return;
    setBusyUrl(row.url);
    try {
      await promoteMentionUrl({
        trackedMentionId: tracked.id,
        url: row.url,
        override_relevance: 'exact',
        reason: `Promoted by an admin from ${row.relevance ?? 'unclassified'}`,
      });
      toast({ title: 'Promoted to exact match' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not promote', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setBusyUrl(null);
    }
  }, [tracked?.id, toast, load]);

  const handleRestore = useCallback(async (ex: MentionExclusion) => {
    if (!tracked?.id) return;
    try {
      await includeMentionUrl({
        trackedMentionId: tracked.id,
        url: ex.url ?? undefined,
        domain: ex.domain ?? undefined,
      });
      toast({ title: 'Restored', description: 'Future refreshes will include this source again.' });
      await Promise.all([load(), loadExclusions(tracked.id)]);
    } catch (e: any) {
      toast({ title: 'Could not restore', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [tracked?.id, toast, load, loadExclusions]);

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
              News, blogs, RSS, and LLM mentions of <span className="font-medium">{subjectName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <span className="text-xs text-muted-foreground">{enabled ? 'Active' : 'Off'}</span>
            <Switch checked={enabled} onCheckedChange={handleToggle} />
            {admin && enabled && (
              <Button onClick={handleRefresh} disabled={refreshing} size="sm" variant="outline">
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
              <TabsTrigger value="opportunities" className="flex items-center gap-2">Opportunities</TabsTrigger>
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
                                    · {formatDate(row.published_at)}
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
                            {admin && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                {row.relevance !== 'mismatch' && (
                                  <Button
                                    size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                                    onClick={() => handleCorrect(row, 'mismatch')}
                                    title="Mark as wrong match"
                                    aria-label="Mark as wrong match"
                                  >
                                    <ThumbsDown className="h-3 w-3" />
                                  </Button>
                                )}
                                {row.relevance !== 'exact' && (
                                  <Button
                                    size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                                    disabled={busyUrl === row.url}
                                    onClick={() => handlePromote(row)}
                                    title="Promote to exact match"
                                    aria-label="Promote to exact match"
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 px-2 text-[11px] hover:text-destructive"
                                  disabled={busyUrl === row.url}
                                  onClick={() => handleExclude(row)}
                                  title={row.outlet_domain
                                    ? `Never show ${row.outlet_domain} again`
                                    : 'Never show this URL again'}
                                  aria-label={row.outlet_domain
                                    ? `Exclude ${row.outlet_domain}`
                                    : 'Exclude this URL'}
                                >
                                  <Ban className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Excluded sources — the undo half of the Ban button on each row. Without a
                  visible list an exclusion is a one-way door: an operator who muted the wrong
                  outlet would have no way to find or reverse it. Mirrors the Excluded Results
                  panel on ProductMonitorTab. (#310 item 5) */}
              {admin && exclusions.length > 0 && (
                <Card className="dashboard-card mt-3">
                  <CardHeader className="pb-3">
                    <button
                      type="button"
                      className="flex items-center justify-between gap-3 w-full text-left"
                      onClick={() => setShowExclusions((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="font-medium">Excluded sources</CardTitle>
                        <Badge variant="outline" className="text-[10px]">{exclusions.length}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {showExclusions ? 'Hide' : 'Show'}
                      </span>
                    </button>
                  </CardHeader>
                  {showExclusions && (
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {exclusions.map((ex) => (
                          <div key={ex.id} className="flex items-start justify-between gap-3 px-6 py-2.5 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {ex.domain || ex.url}
                              </div>
                              {ex.domain && ex.url && (
                                <div className="text-[10px] text-muted-foreground truncate">{ex.url}</div>
                              )}
                              {ex.reason && (
                                <div className="text-[10px] text-muted-foreground italic mt-0.5">{ex.reason}</div>
                              )}
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Excluded {formatDate(ex.excluded_at)}
                              </div>
                            </div>
                            <Button
                              size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1"
                              onClick={() => handleRestore(ex)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Restore
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="px-6 py-3 text-[10px] text-muted-foreground border-t bg-muted/20">
                        Excluded URLs and domains never appear in this subject&rsquo;s feed, outlet
                        counts or alerts. Other subjects tracking the same outlet are unaffected.
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}
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
                    How this product appears in AI answers across cheap-tier models — and
                    which sources those answers cite.
                  </p>
                </div>
                {admin && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={tracked?.probe_tier || 'cheap'}
                      onValueChange={(v) => void handleTierChange(v as MentionProbeTier)}
                    >
                      <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cheap">Cheap tier · ~$0.008/run</SelectItem>
                        <SelectItem value="frontier">Frontier tier · ~25x</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleProbeLlm} disabled={probing}>
                      <Bot className={`h-3 w-3 mr-1 ${probing ? 'animate-spin' : ''}`} />
                      {probing
                        ? 'Probing...'
                        : `Run probe (${tracked?.probe_tier === 'frontier' ? 60 : 15} cr)`}
                    </Button>
                  </div>
                )}
              </div>
              <Card className="dashboard-card">
                <CardContent className="p-4">
                  {!llm?.present ? (
                    <div className="text-sm text-muted-foreground">No probes run yet.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Share of voice</div>
                          <div className="text-2xl font-medium tabular-nums">
                            {((llm.share_of_voice || 0) * 100).toFixed(0)}%
                          </div>
                          {sovDelta !== null && (
                            <div className={`text-[11px] tabular-nums ${sovDelta >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {sovDelta >= 0 ? '+' : ''}{(sovDelta * 100).toFixed(0)} pts vs {llmTrend?.days}d ago
                            </div>
                          )}
                          {sovDelta === null && llmTrend?.model_set_changed && (
                            // The backend withheld the delta because the probe tier moved
                            // inside the window. Saying WHY beats a bare dash, which reads
                            // as "no data" — a different fact.
                            <div className="text-[11px] text-muted-foreground">
                              not comparable — probe models changed
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Average rank</div>
                          <div className="text-2xl font-medium tabular-nums">
                            {llm.avg_position ? `#${llm.avg_position.toFixed(1)}` : '—'}
                          </div>
                          {rankDelta !== null && rankDelta !== 0 && (
                            // A SMALLER rank number is better, so a negative delta is good news.
                            <div className={`text-[11px] tabular-nums ${rankDelta < 0 ? 'text-success' : 'text-destructive'}`}>
                              {rankDelta < 0 ? '▲' : '▼'} {Math.abs(rankDelta).toFixed(1)} ranks
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Sentiment</div>
                          <div className="text-2xl font-medium tabular-nums">
                            {llm.sentiment?.score == null
                              ? '—'
                              : `${llm.sentiment.score > 0 ? '+' : ''}${llm.sentiment.score.toFixed(2)}`}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {llm.sentiment?.score == null
                              // Never mentioned is not the same fact as "the verdict was neutral".
                              ? 'never mentioned'
                              : `${llm.sentiment.positive}+ / ${llm.sentiment.neutral}· / ${llm.sentiment.negative}−`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Ghost citations</div>
                          <div className="text-2xl font-medium tabular-nums">
                            {llm.citations?.undecidable_no_homepage_domain
                              && !llm.citations?.brand_cited
                              ? '—'
                              : (llm.citations?.ghost_citations ?? 0)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {llm.citations?.undecidable_no_homepage_domain && !llm.citations?.brand_cited
                              ? 'set a homepage domain'
                              : 'cited, never named'}
                          </div>
                        </div>
                      </div>

                      {llmTrend?.model_set_changed && (
                        <div className="text-[11px] text-warning flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            The probe model set changed inside this window, so the line is two
                            measurements rather than one trend. A different model gives a
                            different answer — the step is the instrument, not the brand.
                          </span>
                        </div>
                      )}
                      {llmTrend?.present && llmTrend.points.length > 1 && (
                        <div>
                          <div className="text-xs font-medium mb-1">
                            Visibility over {llmTrend.days} days · {llmTrend.points.length} runs
                          </div>
                          <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={trendChartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                                <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                <YAxis
                                  yAxisId="sov" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                                  domain={[0, 100]} width={44} unit="%"
                                />
                                <YAxis
                                  yAxisId="rank" orientation="right" tick={{ fontSize: 10 }}
                                  tickLine={false} axisLine={false} width={34}
                                  // Rank 1 is the best rank, so the axis runs the other way up.
                                  reversed domain={[1, 'dataMax']}
                                />
                                <Tooltip
                                  contentStyle={{ fontSize: 11 }}
                                  formatter={(value: any, name: string) =>
                                    name === 'Share of voice' ? [`${value}%`, name] : [`#${value}`, name]}
                                />
                                <Line
                                  yAxisId="sov" type="monotone" dataKey="shareOfVoice" name="Share of voice"
                                  stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }}
                                />
                                <Line
                                  yAxisId="rank" type="monotone" dataKey="avgPosition" name="Average rank"
                                  stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
                                  strokeDasharray="4 3" dot={{ r: 2 }} connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          {llmTrend.truncated && (
                            <div className="text-[11px] text-muted-foreground">
                              Window capped — older runs are not shown.
                            </div>
                          )}
                        </div>
                      )}
                      {llmTrend && !llmTrend.present && (
                        <div className="text-xs text-muted-foreground">
                          One run only so far — the trend line needs a second probe.
                        </div>
                      )}

                      {llm.per_model && (
                        <div>
                          <div className="text-xs font-medium mb-1">Per model</div>
                          <ul className="text-xs space-y-1">
                            {Object.entries(llm.per_model).map(([model, stats]) => (
                              <li key={model} className="flex justify-between gap-2">
                                <span className="truncate">{model}</span>
                                <span className="text-muted-foreground shrink-0 tabular-nums">
                                  {stats.mentioned}/{stats.probes} mentions
                                  {stats.positions?.length
                                    ? ` · avg #${(stats.positions.reduce((a: number, b: number) => a + b, 0) / stats.positions.length).toFixed(1)}`
                                    : ''}
                                  {stats.sentiment?.score != null
                                    ? ` · ${stats.sentiment.score > 0 ? '+' : ''}${stats.sentiment.score.toFixed(2)}`
                                    : ''}
                                  {stats.citations?.ghost_citations
                                    ? ` · ${stats.citations.ghost_citations} ghost`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {aio?.totals && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Google AI Overview · last {aio.days} days
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div>
                              <div className="text-xs text-muted-foreground">Overview shown</div>
                              <div className="text-lg font-medium tabular-nums">
                                {Math.round(aio.totals.present_rate * 100)}%
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {/* Denominator is CHECKS, not days — a subject nobody
                                    refreshed has no opinion about Google. */}
                                of {aio.totals.checks} check{aio.totals.checks === 1 ? '' : 's'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Named in it</div>
                              <div className="text-lg font-medium tabular-nums">
                                {aio.totals.brand_named}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                of {aio.totals.ai_overview_appeared} shown
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Cited, not named</div>
                              <div className="text-lg font-medium tabular-nums">
                                {aio.totals.ghost_citations}
                              </div>
                              <div className="text-[11px] text-muted-foreground">ghost citations</div>
                            </div>
                          </div>
                          {aio.totals.top_cited_domains.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {aio.totals.top_cited_domains.slice(0, 8).map(([domain, count]) => (
                                <Badge key={domain} variant="outline" className="text-[10px]">
                                  {domain} · {count}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {aio && !aio.totals && (
                        <div className="text-xs text-muted-foreground">
                          {/* Never asked is not the same as "Google does not show one". */}
                          No AI Overview checks recorded yet — they are written by the
                          opportunity scan, so run one from the Opportunities tab.
                        </div>
                      )}

                      {!!llm.citations?.top_cited_domains?.length && (
                        <div>
                          <div className="text-xs font-medium mb-1 flex items-center gap-1">
                            <Link2 className="h-3 w-3" />
                            Sources these answers cited
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {llm.citations.top_cited_domains.slice(0, 10).map(([domain, count]) => (
                              <Badge key={domain} variant="outline" className="text-[10px]">
                                {domain} · {count}
                              </Badge>
                            ))}
                          </div>
                          {!!llm.citations.ghost_citations && (
                            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Ghost className="h-3 w-3" />
                              {llm.citations.ghost_citations} answer(s) used your page as a source without
                              naming you — the citation is earned, the mention is not.
                            </div>
                          )}
                        </div>
                      )}
                      {sovRows.length > 0 && (
                        <div>
                          <div className="text-xs font-medium mb-1">
                            Share of voice · last {sov?.days ?? 90} days
                          </div>
                          {/*
                            The subject is IN this list. It was a competitor tally before
                            #349 A4 — the one brand the page belongs to had no share of its
                            own voice, which is not a share of anything.
                          */}
                          <ul className="space-y-1">
                            {sovRows.map((row) => (
                              <li key={row.name} className="flex items-center gap-2 text-xs">
                                <span className={`w-40 shrink-0 truncate ${row.isSubject ? 'font-medium' : 'text-muted-foreground'}`}>
                                  {row.isSubject ? `${row.name} (you)` : row.name}
                                </span>
                                <span className="flex-1 h-1.5 rounded-sm bg-surface-sunken overflow-hidden">
                                  <span
                                    className={`block h-full ${row.isSubject ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                                    style={{ width: `${Math.round(row.share * 100)}%` }}
                                  />
                                </span>
                                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                                  {(row.share * 100).toFixed(0)}% · {row.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {sov?.truncated && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Window capped — older runs are not counted.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Opportunities */}
            <TabsContent value="opportunities" className="mt-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                <div className="min-w-0">
                  <h4 className="text-sm font-medium">Where the citations are going</h4>
                  <p className="text-xs text-muted-foreground">
                    AI Overview presence, People-Also-Ask gaps, featured snippets and the
                    competitors ranking on this subject's own terms.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void loadOpportunities()} disabled={oppsLoading}>
                  <Sparkles className={`h-3 w-3 mr-1 ${oppsLoading ? 'animate-spin' : ''}`} />
                  {oppsLoading ? 'Scanning…' : opps ? 'Rescan' : 'Scan now'}
                </Button>
              </div>
              <Card className="dashboard-card">
                <CardContent className="p-4">
                  {!opps ? (
                    // Deliberately NOT auto-run: this is a live, metered SERP call. An
                    // empty panel that costs nothing until asked is the honest default.
                    <div className="text-sm text-muted-foreground">
                      Not scanned yet. This runs a live search against the subject's terms and
                      is billed per scan.
                    </div>
                  ) : opps.opportunities.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Nothing surfaced for this subject in the last {opps.days} days.
                      {Object.keys(opps.errors || {}).length > 0 && (
                        <> Some sources failed: {Object.keys(opps.errors).join(', ')}.</>
                      )}
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {opps.opportunities.map((o: Opportunity, i: number) => (
                        <li key={`${o.type}-${i}`} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px]">
                                  {OPPORTUNITY_LABELS[o.type] || o.type}
                                </Badge>
                                <span className="text-sm font-medium">{o.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{o.rationale}</p>
                              <p className="text-xs mt-1"><strong>Do:</strong> {o.suggested_action}</p>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              {Math.round(o.priority_score)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            Cadence: every {tracked.refresh_interval_hours || 24}h ·
            {tracked.last_refreshed_at ? ` last refreshed ${formatDate(tracked.last_refreshed_at, { withTime: true })}` : ' never refreshed'}
          </div>
        </>
      )}
    </div>
  );
};

export default MentionMonitorTab;
