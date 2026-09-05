import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, timeAgo } from '@/utils/datetime';
import {
  ArrowLeft, Globe, ExternalLink, RefreshCw, Loader2, FileText, Search,
  FlaskConical, Radar, AlertTriangle, LineChart, Gauge, TrendingUp, CalendarClock, Check, Bot,
  LayoutDashboard, Sparkles, Swords, Plus, Target, FileBarChart, Trash2,
} from 'lucide-react';
import { WebsiteGscPanel } from '@/components/core/Profile/WebsiteGscPanel';
import { WebsiteLlmsTxtPanel } from '@/components/core/Profile/WebsiteLlmsTxtPanel';
import { WebsiteHealthPanel } from '@/components/core/Profile/WebsiteHealthPanel';
import { WebsiteDomainIntelPanel } from '@/components/core/Profile/WebsiteDomainIntelPanel';
import { WebsiteSeoOverviewPanel } from '@/components/core/Profile/WebsiteSeoOverviewPanel';
import { WebsiteAiVisibilityPanel } from '@/components/core/Profile/WebsiteAiVisibilityPanel';
import { KeywordResearchDetail } from '@/components/core/Profile/KeywordResearchDetail';
import { WebsiteCompetitorsPanel } from '@/components/core/Profile/WebsiteCompetitorsPanel';
import { WebsiteRankTrackerPanel } from '@/components/core/Profile/WebsiteRankTrackerPanel';
import { WebsiteReportsPanel } from '@/components/core/Profile/WebsiteReportsPanel';
import { WebsiteCrawlPanel } from '@/components/core/Profile/WebsiteCrawlPanel';
import { WebsiteAnalyticsPanel } from '@/components/core/Profile/WebsiteAnalyticsPanel';
import { WebsiteCannibalisationPanel } from '@/components/core/Profile/WebsiteCannibalisationPanel';
import { HubEmptyState, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  describeCrawlResult,
  type UserWebsite,
  type WebsiteSeoOverview,
  type SeoArticleRow,
  type SeoArticleFreshnessRow,
  type SeoKeywordResearchRow,
  type SeoResearchRunRow,
  type SeoTrackedDomainRow,
} from '@/services/userWebsitesService';
import SEOArticleViewer from '@/components/features/ai/SEOArticleViewer';
import { formatNumber } from '@/utils/decimal';
import { listAuditHistory, triggerAuditNow, type SeoDomainAuditSnapshot } from '@/services/seoToolkitApi';


const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-[hsl(var(--error))]',
  researching: 'text-amber-600 dark:text-amber-400',
  writing: 'text-amber-600 dark:text-amber-400',
  planning: 'text-amber-600 dark:text-amber-400',
  analyzing: 'text-amber-600 dark:text-amber-400',
};


export const WebsiteSeoDashboard: React.FC<{ website: UserWebsite; onBack: () => void; initialTab?: string }> = ({ website, onBack, initialTab }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState(initialTab || 'overview');
  const [overview, setOverview] = useState<WebsiteSeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recrawling, setRecrawling] = useState(false);

  const launchQuickStart = useLaunchQuickStart();
  const [openResearchId, setOpenResearchId] = useState<string | null>(null);
  const [articles, setArticles] = useState<SeoArticleRow[]>([]);
  const [freshness, setFreshness] = useState<SeoArticleFreshnessRow[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [research, setResearch] = useState<SeoKeywordResearchRow[]>([]);
  const [runs, setRuns] = useState<SeoResearchRunRow[]>([]);
  const [domains, setDomains] = useState<SeoTrackedDomainRow[]>([]);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  // Formatted from the derived view. `is_due` already accounts for the article's own
  // cadence and any snooze, so there is no second opinion about what "due" means here.
  const dueForRefresh = freshness.filter((f) => f.is_due);
  const freshnessById = new Map(freshness.map((f) => [f.article_id, f]));

  const markReviewed = async (articleId: string) => {
    setReviewing(articleId);
    try {
      await userWebsitesService.markArticleReviewed(articleId);
      setFreshness(await userWebsitesService.freshness(website.id));
      toast({ title: 'Marked reviewed', description: 'The refresh clock starts again from today.' });
    } catch (e: any) {
      toast({ title: 'Could not mark reviewed', description: e.message, variant: 'destructive' });
    } finally {
      setReviewing(null);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, ar, fr, kr, rr, td] = await Promise.all([
        userWebsitesService.overview(website.id),
        userWebsitesService.articles(website.id),
        userWebsitesService.freshness(website.id),
        userWebsitesService.keywordResearch(website.id),
        userWebsitesService.toolkitRuns(website.id),
        userWebsitesService.trackedDomains(website.id),
      ]);
      setOverview(ov);
      setArticles(ar);
      setFreshness(fr);
      setResearch(kr);
      setRuns(rr);
      setDomains(td);
    } catch (e: any) {
      toast({ title: 'Failed to load dashboard', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  const navigate = useNavigate();
  const siteHost = website.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

  // ── Research → rank tracker ─────────────────────────────────────────────
  // Research answers "is this keyword worth it"; the tracker answers "are we
  // winning it". The two were separate boxes with retyping in between.
  const [trackingKeywords, setTrackingKeywords] = useState<string | null>(null);
  const trackKeywords = async (keywords: string[], origin: string) => {
    if (!website.workspace_id) return;
    setTrackingKeywords(origin);
    try {
      const n = await userWebsitesService.addTrackedKeywords(website.id, website.workspace_id, keywords, 'GR', 'el');
      toast({ title: `Tracking ${n} keyword${n === 1 ? '' : 's'}`, description: 'Positions arrive on the next check, under Rankings.' });
      setTracked((prev) => { const next = new Set(prev); keywords.forEach((k) => next.add(k.trim().toLowerCase())); return next; });
    } catch (e: any) {
      toast({ title: 'Could not track them', description: e.message, variant: 'destructive' });
    } finally {
      setTrackingKeywords(null);
    }
  };

  // ── Research suggestions from the site's own pages ─────────────────────
  // A page's title is the keyword its author chose for it. Suggest those the
  // site neither tracks nor has researched, so "what should I look at next"
  // starts from what the site says it is about rather than a blank box.
  const [pageTitles, setPageTitles] = useState<{ url: string; title: string }[]>([]);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [titles, trackedSet] = await Promise.allSettled([
        userWebsitesService.pageTitles(website.id),
        userWebsitesService.trackedKeywordStrings(website.id),
      ]);
      if (cancelled) return;
      setPageTitles(titles.status === 'fulfilled' ? titles.value : []);
      setTracked(trackedSet.status === 'fulfilled' ? trackedSet.value : new Set());
    })();
    return () => { cancelled = true; };
  }, [website.id]);
  const researched = new Set(research.map((r) => r.target_keyword.trim().toLowerCase()));
  const suggestions = (() => {
    const seen = new Set<string>();
    const out: { keyword: string; url: string }[] = [];
    for (const p of pageTitles) {
      // "Πλακάκια Θεσσαλονίκη | MaterialsHub" → "Πλακάκια Θεσσαλονίκη"
      const keyword = p.title.split(/\s+[|–—-]\s+/)[0].replace(/\s+/g, ' ').trim();
      const key = keyword.toLowerCase();
      if (keyword.length < 4 || keyword.length > 80 || seen.has(key)) continue;
      if (tracked.has(key) || researched.has(key)) continue;
      if (/materialshub|materials hub/i.test(keyword)) continue;
      seen.add(key);
      out.push({ keyword, url: p.url });
      if (out.length >= 24) break;
    }
    return out;
  })();
  const researchKeyword = (keyword: string) => {
    const prompt = `Research the keyword "${keyword}" for ${siteHost} in the Greek market (GR, el): search volume, difficulty, what the results page shows, keyword clusters and who ranks now.`;
    navigate(`/agent-hub?agent=kai&prompt=${encodeURIComponent(prompt)}`);
  };

  // ── Domain audit history ────────────────────────────────────────────────
  const [openDomain, setOpenDomain] = useState<SeoTrackedDomainRow | null>(null);
  const [domainHistory, setDomainHistory] = useState<SeoDomainAuditSnapshot[] | null>(null);
  const openDomainHistory = async (d: SeoTrackedDomainRow) => {
    setOpenDomain(d);
    setDomainHistory(null);
    try {
      setDomainHistory(await listAuditHistory(d.id, 30));
    } catch (e: any) {
      toast({ title: 'Could not load the audit history', description: e.message, variant: 'destructive' });
      setDomainHistory([]);
    }
  };
  const [auditingDomain, setAuditingDomain] = useState(false);
  const auditDomainNow = async () => {
    if (!openDomain) return;
    setAuditingDomain(true);
    try {
      const r = await triggerAuditNow(openDomain.id);
      if (!r.ok) throw new Error(r.error || 'Audit failed');
      toast({ title: 'Audit complete', description: `${openDomain.domain} audited.` });
      setDomainHistory(await listAuditHistory(openDomain.id, 30));
      setDomains(await userWebsitesService.trackedDomains(website.id));
    } catch (e: any) {
      toast({ title: 'Audit failed', description: e.message, variant: 'destructive' });
    } finally {
      setAuditingDomain(false);
    }
  };

  const [deletingResearchId, setDeletingResearchId] = useState<string | null>(null);
  const deleteResearch = async (r: SeoKeywordResearchRow) => {
    if (!confirm(`Delete the research for "${r.target_keyword}"? The captured results page goes with it.`)) return;
    setDeletingResearchId(r.id);
    try {
      await userWebsitesService.deleteKeywordResearch(r.id);
      setResearch((rows) => rows.filter((x) => x.id !== r.id));
    } catch (e: any) {
      toast({ title: 'Could not delete it', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingResearchId(null);
    }
  };

  const [trackingDomain, setTrackingDomain] = useState(false);
  /**
   * The Domain Audits tab is about THIS website's domain, so the button tracks
   * exactly that. It used to open the agent's "Snapshot a domain" flow, which asked
   * the operator to type the domain they were already standing on and left the row
   * unattached to the website — so this tab stayed empty after they had done it.
   */
  const trackOwnDomain = async () => {
    setTrackingDomain(true);
    try {
      const row = await userWebsitesService.trackOwnDomain(website);
      toast({
        title: `Tracking ${row.domain}`,
        description: 'The first rank and backlink audit runs within the hour, then weekly.',
      });
      setDomains(await userWebsitesService.trackedDomains(website.id));
    } catch (e: any) {
      toast({ title: 'Could not track the domain', description: e.message, variant: 'destructive' });
    } finally {
      setTrackingDomain(false);
    }
  };

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const result = await userWebsitesService.crawl(website.id);
      toast({ title: 'Crawl complete', description: describeCrawlResult(result) });
      loadAll();
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
    } finally {
      setRecrawling(false);
    }
  };

  const domainLabel = website.display_name || website.url.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} title="Back to websites">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{domainLabel}</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <a href={website.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground min-w-0">
                <span className="truncate max-w-[280px]">{website.url}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <span>·</span>
              <span>{website.page_count} pages indexed</span>
              <span>·</span>
              <span>Last crawl: {timeAgo(website.last_crawled_at)}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRecrawl} disabled={recrawling}>
          {recrawling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Recrawl
        </Button>
      </div>

      {website.last_crawl_error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--error-bg))] border border-[hsl(var(--error)/0.25)] text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--error))] mt-0.5 flex-shrink-0" />
          <span className="break-all">{website.last_crawl_error}</span>
        </div>
      )}

      {/* Four counters, each of which names a section of this page — so each one opens it.
          `HubStatGrid` auto-fits rather than hard-coding four columns (no orphan tile), and
          `HubStatTile` puts the figures on a `tabular-nums` grid so the column can be compared
          down the page instead of read one at a time. */}
      <HubStatGrid>
        <HubStatTile label="Articles" value={loading ? '—' : overview?.articles.total ?? 0} onClick={() => setTab('articles')} />
        <HubStatTile label="Keyword research" value={loading ? '—' : overview?.keyword_research.total ?? 0} onClick={() => setTab('research')} />
        <HubStatTile label="Toolkit runs" value={loading ? '—' : overview?.toolkit_runs.total ?? 0} onClick={() => setTab('runs')} />
        <HubStatTile label="Tracked domains" value={loading ? '—' : overview?.tracked_domains.total ?? 0} onClick={() => setTab('domains')} />
      </HubStatGrid>

      {/* Eleven sections. That is a RAIL, not a tab row — the same call SocialHubPanel made at
          the same count. Eleven triggers in one horizontal strip is a row nobody can scan, and
          `bg-muted` on the list put them in a filled padding box, which is the one thing the tab
          treatment is defined not to be (see TabsList in components/core/ui/tabs.tsx).
          `.section-rail` collapses it back to a single swipeable strip below `lg`. */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="flex flex-col gap-4 lg:flex-row lg:items-start"
      >
        <TabsList className="section-rail flex h-auto w-full shrink-0 flex-row gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
          <TabsTrigger value="overview" className="w-full justify-start gap-2"><LayoutDashboard className="w-3.5 h-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="ai" className="w-full justify-start gap-2"><Sparkles className="w-3.5 h-3.5" /> AI Visibility</TabsTrigger>
          {/* "Rank Tracker", not "Rankings" — `rankings` is already taken by the
              domain-intel + backlinks tab below. Two tabs both called Rankings that
              answer different questions is worse than a slightly longer label. */}
          <TabsTrigger value="ranks" className="w-full justify-start gap-2"><Target className="w-3.5 h-3.5" /> Rank Tracker</TabsTrigger>
          <TabsTrigger value="reports" className="w-full justify-start gap-2"><FileBarChart className="w-3.5 h-3.5" /> Reports</TabsTrigger>
          <TabsTrigger value="competitors" className="w-full justify-start gap-2"><Swords className="w-3.5 h-3.5" /> Competitors</TabsTrigger>
          <TabsTrigger value="articles" className="w-full justify-start gap-2"><FileText className="w-3.5 h-3.5" /> Articles</TabsTrigger>
          <TabsTrigger value="research" className="w-full justify-start gap-2"><Search className="w-3.5 h-3.5" /> Keyword Research</TabsTrigger>
          <TabsTrigger value="runs" className="w-full justify-start gap-2"><FlaskConical className="w-3.5 h-3.5" /> Toolkit Runs</TabsTrigger>
          <TabsTrigger value="domains" className="w-full justify-start gap-2"><Radar className="w-3.5 h-3.5" /> Domain Audits</TabsTrigger>
          <TabsTrigger value="gsc" className="w-full justify-start gap-2"><LineChart className="w-3.5 h-3.5" /> Search Performance</TabsTrigger>
          <TabsTrigger value="rankings" className="w-full justify-start gap-2"><TrendingUp className="w-3.5 h-3.5" /> Rankings &amp; Links</TabsTrigger>
          <TabsTrigger value="health" className="w-full justify-start gap-2"><Gauge className="w-3.5 h-3.5" /> Site Health</TabsTrigger>
          <TabsTrigger value="llms" className="w-full justify-start gap-2"><Bot className="w-3.5 h-3.5" /> llms.txt</TabsTrigger>
        </TabsList>

        <div className="min-w-0 flex-1 space-y-4">

        {/*
          Overview — the derived metric strip. Everything on it comes from
          `get_website_seo_overview` / `seo_website_*_summary`, which decide both the
          number AND whether the number can be trusted, so a tile can say "the
          backlink source failed" instead of quietly not rendering. See
          `seo/seoMetrics.ts`.
        */}
        <TabsContent value="overview">
          <WebsiteSeoOverviewPanel website={website} onOpenTab={setTab} />
        </TabsContent>

        {/* AI Visibility — what assistants say about you (llm_mention_probes). */}
        <TabsContent value="ai">
          <WebsiteAiVisibilityPanel website={website} />
        </TabsContent>

        {/* Rankings — the keywords the operator CHOSE, followed daily. Everything
            else in this module is discovery ("what do we rank for"); this is the
            only surface that answers "did what I care about move". */}
        <TabsContent value="ranks">
          <WebsiteRankTrackerPanel website={website} />
        </TabsContent>

        {/* Reports — a saved selection of the SAME derivations every other tab reads,
            frozen per build so an old report still shows its own period. */}
        <TabsContent value="reports">
          <WebsiteReportsPanel website={website} />
        </TabsContent>

        {/* Competitors — your line beside theirs, same metric, same window. */}
        <TabsContent value="competitors">
          <WebsiteCompetitorsPanel website={website} />
        </TabsContent>

        {/* Articles */}
        <TabsContent value="articles" className="space-y-4">
          {/*
            Content decay (issue #349 C1). An article does not break when it goes stale —
            it keeps ranking, keeps reading well, and simply stops being the page an
            answer engine reaches for. Nothing in the platform revisited one, so this
            queue is the only place the fact is visible.

            `refresh_due_at` and `age_days` are DERIVED in SQL by
            seo_article_refresh_due_at(); this component formats them and never recomputes.
          */}
          {dueForRefresh.length > 0 && (
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  Due for a refresh
                  <Badge variant="warning">{dueForRefresh.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Content updated inside the last three months is cited noticeably more often by
                  answer engines. Refresh the figures and examples, then mark it reviewed.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead className="text-right">Age</TableHead>
                      <TableHead>Last reviewed</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dueForRefresh.map((f) => (
                      <TableRow key={f.article_id}>
                        <TableCell className="font-medium max-w-[280px] truncate">
                          <button
                            type="button"
                            onClick={() => setOpenArticleId(f.article_id)}
                            className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {f.title || f.target_keyword || 'Untitled article'}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[180px] truncate">
                          {f.target_keyword || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{f.age_days}d</TableCell>
                        <TableCell className="text-muted-foreground">
                          {/* Never reviewed is a different fact from reviewed a long time ago. */}
                          {f.last_reviewed_at ? timeAgo(f.last_reviewed_at) : 'never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reviewing === f.article_id}
                            onClick={() => void markReviewed(f.article_id)}
                          >
                            {reviewing === f.article_id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5" />}
                            <span className="ml-1">Mark reviewed</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card className="dashboard-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
              <CardTitle>SEO Articles</CardTitle>
              <CardDescription>Articles generated for this website. Click one to open the full viewer.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="shrink-0"
                onClick={() => launchQuickStart('seo-article', 'Generate full article')}>
                <Plus className="w-3.5 h-3.5 mr-1" />New article
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : articles.length === 0 ? (
                <HubEmptyState
                  variant="empty"
                  title="No articles yet"
                  description="The article pipeline researches a keyword, plans the piece and writes it. Start one and it files itself here."
                  action={
                    <Button size="sm" onClick={() => launchQuickStart('seo-article', 'Generate full article')}>
                      <Plus className="w-3.5 h-3.5 mr-1" />New article
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead className="text-right">SEO</TableHead>
                      <TableHead className="text-right">Words</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Content age</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((a) => (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer"
                        // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                        // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                        // row is invalid ARIA and yields a focus stop with no name.
                        onClick={() => setOpenArticleId(a.id)}
                      >
                        <TableCell className="font-medium max-w-[280px] truncate">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setOpenArticleId(a.id); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{a.title || a.target_keyword}</button>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[180px] truncate">{a.target_keyword}</TableCell>
                        <TableCell className="text-right">{a.seo_score ?? '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(a.word_count)}</TableCell>
                        <TableCell className={STATUS_COLOR[a.status] || 'text-muted-foreground'}>{a.status}</TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(a.created_at)}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {freshnessById.get(a.id)
                            ? (
                              <span className={freshnessById.get(a.id)!.is_due ? 'text-destructive' : undefined}>
                                {freshnessById.get(a.id)!.age_days}d
                              </span>
                            )
                            // An unpublished draft has no content age — that is not the same
                            // as being fresh, and it is not the same as being stale either.
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keyword Research */}
        <TabsContent value="research">
          <Card className="dashboard-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
              <CardTitle>Keyword Research</CardTitle>
              <CardDescription>
                Open a run to read the whole results page it captured — AI Overview citations, image and
                local packs, People Also Ask, clusters and who ranks now.
              </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="shrink-0"
                onClick={() => launchQuickStart('seo-research', 'Research a keyword')}>
                <Plus className="w-3.5 h-3.5 mr-1" />New research
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : research.length === 0 ? (
                <HubEmptyState
                  variant="empty"
                  title="No keyword research yet"
                  description="A research pass captures the whole results page for a keyword — AI Overview citations, image and local packs, People Also Ask, and who ranks now."
                  action={
                    <Button size="sm" onClick={() => launchQuickStart('seo-research', 'Research a keyword')}>
                      <Plus className="w-3.5 h-3.5 mr-1" />New research
                    </Button>
                  }
                />
              ) : (
                <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Target keyword</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Difficulty</TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                      <TableHead className="text-right">Competition</TableHead>
                      <TableHead className="text-right">Opportunity</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead className="text-right">Related</TableHead>
                      <TableHead className="text-right">Addressable</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Figures are the researched keyword's own (recommendedPrimary); "Related" and
                        "Addressable" describe the expanded set the run found around it. A dash is
                        "the source did not return it" — difficulty is unscored for many Greek terms —
                        never a zero. */}
                    {research.map((r) => (
                      <TableRow
                        key={r.id}
                        onClick={() => setOpenResearchId(r.id)}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-medium max-w-[220px] truncate">
                          {r.target_keyword}
                          {r.language_code ? <span className="ml-1 text-[11px] text-muted-foreground">{r.language_code}</span> : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">{r.topic}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.primary?.search_volume != null ? formatNumber(r.primary.search_volume) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.primary?.difficulty != null ? r.primary.difficulty : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.primary?.cpc != null ? `$${r.primary.cpc.toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.primary?.competition != null ? `${Math.round(r.primary.competition * 100)}%` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.primary?.opportunity != null ? r.primary.opportunity : '—'}</TableCell>
                        <TableCell>
                          {r.primary?.trend
                            ? (
                              <Badge variant={r.primary.trend === 'up' ? 'success' : r.primary.trend === 'down' ? 'warning' : 'neutral'}>
                                {r.primary.trend}{r.primary.trend_delta != null ? ` ${r.primary.trend_delta > 0 ? '+' : ''}${r.primary.trend_delta}%` : ''}
                              </Badge>
                            )
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.total_keywords_found)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.total_addressable_volume)}</TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {tracked.has(r.target_keyword.trim().toLowerCase()) ? (
                              <span className="text-[11px] text-muted-foreground" title="Already in the rank tracker">tracked</span>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                aria-label={`Track ${r.target_keyword} in the rank tracker`}
                                title="Track in the rank tracker"
                                onClick={(e) => { e.stopPropagation(); void trackKeywords([r.target_keyword], r.id); }}
                                disabled={trackingKeywords === r.id}>
                                {trackingKeywords === r.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Target className="h-3.5 w-3.5 text-primary" />}
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              aria-label={`Delete research for ${r.target_keyword}`}
                              onClick={(e) => { e.stopPropagation(); void deleteResearch(r); }}
                              disabled={deletingResearchId === r.id}>
                              {deletingResearchId === r.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {suggestions.length > 0 && (
            <Card className="dashboard-card mt-4">
              <CardHeader>
                <CardTitle className="text-base">Suggested from your pages</CardTitle>
                <CardDescription>
                  Titles of pages this site already has, that are neither tracked nor researched yet. Research one
                  to size it up, or track it straight away to follow its position.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {suggestions.map((sg) => (
                    <div key={sg.keyword} className="flex items-center gap-2 rounded-sm border border-hairline px-2.5 py-1.5">
                      <a href={sg.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline" title={sg.url}>
                        {sg.keyword}
                      </a>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => researchKeyword(sg.keyword)}>
                        Research
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => void trackKeywords([sg.keyword], sg.keyword)}
                        disabled={trackingKeywords === sg.keyword}>
                        {trackingKeywords === sg.keyword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Track'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Toolkit Runs */}
        <TabsContent value="runs">
          <Card className="dashboard-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
              <CardTitle>Toolkit Runs</CardTitle>
              <CardDescription>SEO research + audit passes the agent and toolkit ran for this website.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="shrink-0"
                onClick={() => launchQuickStart('seo-research', 'Audit a URL')}>
                <Plus className="w-3.5 h-3.5 mr-1" />New run
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : runs.length === 0 ? (
                <HubEmptyState
                  variant="empty"
                  title="No toolkit runs yet"
                  description="Every audit or research pass the agent runs for this site is filed here so you can re-read it later."
                  action={
                    <Button size="sm" onClick={() => launchQuickStart('seo-research', 'Audit a URL')}>
                      <Plus className="w-3.5 h-3.5 mr-1" />New run
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Ran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium max-w-[240px] truncate">{r.label || r.subject}</TableCell>
                        <TableCell className="text-muted-foreground">{r.kind}</TableCell>
                        <TableCell className="text-muted-foreground">{r.country_code || '—'}</TableCell>
                        <TableCell className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-[hsl(var(--error))]'}>
                          {r.success ? 'success' : 'failed'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Domain Audits */}
        <TabsContent value="domains">
          <Card className="dashboard-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
              <CardTitle>Domain Audits</CardTitle>
              <CardDescription>
                Scheduled domain-rank tracking for this website's own domain. Rival domains are followed
                under the Competitors tab, measured on the same weekly run in the same market.
              </CardDescription>
              </div>
              {!loading && domains.length === 0 && (
                <Button size="sm" variant="outline" className="shrink-0"
                  onClick={trackOwnDomain} disabled={trackingDomain}>
                  {trackingDomain
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <Plus className="w-3.5 h-3.5 mr-1" />}
                  Track this domain
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : domains.length === 0 ? (
                <HubEmptyState
                  variant="empty"
                  title="This domain is not tracked yet"
                  description="Tracking takes a weekly rank and backlink snapshot so movement shows up as a trend rather than a surprise."
                  action={
                    <Button size="sm" onClick={trackOwnDomain} disabled={trackingDomain}>
                      {trackingDomain
                        ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        : <Plus className="w-3.5 h-3.5 mr-1" />}
                      Track this domain
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead className="text-right">Rank</TableHead>
                      <TableHead className="text-right">Organic traffic</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last audit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => (
                      <TableRow key={d.id} className="cursor-pointer" onClick={() => void openDomainHistory(d)}>
                        <TableCell className="font-medium">{d.display_label || d.domain}</TableCell>
                        <TableCell className="text-right">{d.current_domain_rank ?? '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.current_organic_traffic)}</TableCell>
                        <TableCell className={d.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                          {d.is_active ? 'active' : 'paused'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(d.last_audited_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Performance — both halves of the Google picture. Search Console
            says what Google SHOWED people; Analytics says what those people then
            DID. A page with rising impressions and flat sessions has a title
            problem; rising sessions and no conversions is a page problem. Neither
            is visible from one feed. */}
        <TabsContent value="gsc" className="space-y-4">
          <WebsiteGscPanel website={website} />
          <WebsiteAnalyticsPanel website={website} />
          {/* Cannibalisation lives here because it is derived entirely from Search
              Console's query+page pair — the same feed, read a different way. */}
          <WebsiteCannibalisationPanel website={website} />
        </TabsContent>

        {/* Rankings & Links (DataForSEO domain intel) */}
        <TabsContent value="rankings">
          <WebsiteDomainIntelPanel website={website} />
        </TabsContent>

        {/* Site Health — the homepage audit AND the full crawl. They answer
            different questions: one is "is my front door broken", the other is
            "is my site broken", and only the second can see a redirect chain. */}
        <TabsContent value="health" className="space-y-4">
          <WebsiteCrawlPanel website={website} />
          <WebsiteHealthPanel website={website} />
        </TabsContent>

        {/* llms.txt — derived from the crawled pages (#349 C2) */}
        <TabsContent value="llms">
          <WebsiteLlmsTxtPanel website={website} />
        </TabsContent>
        </div>
      </Tabs>

      {/* Domain audit history — every weekly audit for one tracked domain. */}
      <Dialog open={!!openDomain} onOpenChange={(o) => { if (!o) setOpenDomain(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{openDomain?.display_label || openDomain?.domain} · audit history</DialogTitle>
          {domainHistory == null ? (
            <Loading />
          ) : domainHistory.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No audits recorded yet"
              description="The first runs within the hour of tracking, then weekly. History is visible to the person who added the domain."
              action={
                <Button size="sm" disabled={auditingDomain} onClick={() => void auditDomainNow()}>
                  {auditingDomain ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                  Audit now
                </Button>
              }
            />
          ) : (
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audited</TableHead>
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead className="text-right">Keywords</TableHead>
                    <TableHead className="text-right">Traffic</TableHead>
                    <TableHead className="text-right">Ref. domains</TableHead>
                    <TableHead className="text-right">Backlinks</TableHead>
                    <TableHead className="text-right">Spam</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domainHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-muted-foreground">{formatDate(h.audited_at, { withTime: true })}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.domain_rank ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.ranking_keywords)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.organic_traffic)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.referring_domains)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.backlinks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.spam_score ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">${Number(h.cost_usd ?? 0).toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Keyword-research reader — the full captured SERP, not the 5-column summary. */}
      <Dialog open={!!openResearchId} onOpenChange={(o) => { if (!o) setOpenResearchId(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Keyword research</DialogTitle>
          {openResearchId && (
            <KeywordResearchDetail
              researchId={openResearchId}
              siteDomain={website.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
              tracked={tracked}
              onTrack={(keywords) => trackKeywords(keywords, 'detail')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Article viewer */}
      <Dialog open={!!openArticleId} onOpenChange={(o) => { if (!o) setOpenArticleId(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* sr-only because the design has no room for a visible heading. Radix logs a runtime
              warning without one and, more importantly, a screen reader announces the dialog with
              no name at all. (audit #302 finding 5) */}
          <DialogTitle className="sr-only">SEO article</DialogTitle>
          {openArticleId && <SEOArticleViewer articleId={openArticleId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Send the operator into the agent with a specific guided flow already open.
 *
 * `?quickstart=<toolkitId>:<label>` is the existing deep-link AgentHub already
 * honours — it dispatches through the SAME handleQuickStart the in-app picker
 * uses, so these buttons cannot drift from the flows themselves. A tab that lists
 * past runs with no way to start a new one makes the reader go and find the agent,
 * guess the toolkit, and guess the flow.
 */
function useLaunchQuickStart() {
  const navigate = useNavigate();
  return (toolkitId: string, label: string) =>
    navigate(`/agent-hub?quickstart=${encodeURIComponent(toolkitId)}:${encodeURIComponent(label)}`);
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}


export default WebsiteSeoDashboard;
