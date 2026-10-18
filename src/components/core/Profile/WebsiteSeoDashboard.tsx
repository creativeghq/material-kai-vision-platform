import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { timeAgo } from '@/utils/datetime';
import { Globe, ExternalLink, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { WebsiteGscPanel } from '@/components/core/Profile/WebsiteGscPanel';
import { WebsiteLlmsTxtPanel } from '@/components/core/Profile/WebsiteLlmsTxtPanel';
import { WebsiteHealthPanel } from '@/components/core/Profile/WebsiteHealthPanel';
import { WebsiteDomainIntelPanel } from '@/components/core/Profile/WebsiteDomainIntelPanel';
import { WebsiteSeoOverviewPanel } from '@/components/core/Profile/WebsiteSeoOverviewPanel';
import { TopicPlanCard } from '@/components/core/Profile/seo/TopicPlanCard';
import { WebsiteAiVisibilityPanel } from '@/components/core/Profile/WebsiteAiVisibilityPanel';
import { WebsiteCompetitorsPanel } from '@/components/core/Profile/WebsiteCompetitorsPanel';
import { WebsiteRankTrackerPanel } from '@/components/core/Profile/WebsiteRankTrackerPanel';
import { WebsiteSerpFeaturesPanel } from '@/components/core/Profile/WebsiteSerpFeaturesPanel';
import { WebsiteReportsPanel } from '@/components/core/Profile/WebsiteReportsPanel';
import { WebsiteCrawlPanel } from '@/components/core/Profile/WebsiteCrawlPanel';
import { WebsitePagesPanel } from '@/components/core/Profile/seo/WebsitePagesPanel';
import { WebsiteAnalyticsPanel } from '@/components/core/Profile/WebsiteAnalyticsPanel';
import { WebsiteAnalyticsPagesPanel } from '@/components/core/Profile/WebsiteAnalyticsPagesPanel';
import { WebsiteAnalyticsGeoPanel } from '@/components/core/Profile/WebsiteAnalyticsGeoPanel';
import { WebsiteAnalyticsTechPanel } from '@/components/core/Profile/WebsiteAnalyticsTechPanel';
import { WebsiteAnalyticsCommercePanel } from '@/components/core/Profile/WebsiteAnalyticsCommercePanel';
import { WebsiteAnalyticsFunnelPanel } from '@/components/core/Profile/WebsiteAnalyticsFunnelPanel';
import { WebsiteAnalyticsRetentionPanel } from '@/components/core/Profile/WebsiteAnalyticsRetentionPanel';
import { WebsiteArticlesPanel } from '@/components/core/Profile/WebsiteArticlesPanel';
import { WebsiteKeywordResearchPanel } from '@/components/core/Profile/WebsiteKeywordResearchPanel';
import { WebsiteToolkitRunsPanel } from '@/components/core/Profile/WebsiteToolkitRunsPanel';
import { WebsiteDomainAuditsPanel } from '@/components/core/Profile/WebsiteDomainAuditsPanel';
import { WebsiteCannibalisationPanel } from '@/components/core/Profile/WebsiteCannibalisationPanel';
import { WebsiteBrandProfilePanel } from '@/components/core/Profile/WebsiteBrandProfilePanel';
import { HubRailSectionLabel, HubStatGrid, HubStatTile, HubTabNav } from '@/components/core/hub';
import { resolveSeoTarget, seoRailRows, seoSectionViews, type SeoSectionId } from '@/components/core/Profile/seo/sections';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  describeCrawlResult,
  type UserWebsite,
  type WebsiteSeoOverview,
} from '@/services/userWebsitesService';

export const WebsiteSeoDashboard: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();

  // The open pane is `?section=`, the site is `?website=` (WebsitesTab writes it). In `useState`
  // neither had an address: a reload dropped you at the site list and no pane could be linked to.
  const [params, setParams] = useSearchParams();
  const rawSection = params.get('section');
  const rawView = params.get('view');
  const { section: tab, view } = resolveSeoTarget(rawSection, rawView);

  const writeTarget = (section: SeoSectionId, nextView: string | null) => {
    const next = new URLSearchParams(params);
    next.set('section', section);
    if (nextView) next.set('view', nextView); else next.delete('view');
    setParams(next, { replace: true });
  };

  // Normalise only when `?section=` was SET — its absence is the default, not a stale bookmark.
  useEffect(() => {
    if (rawSection && (rawSection !== tab || (rawView ?? null) !== view)) writeTarget(tab, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSection, rawView, tab, view]);

  /** A section id, a legacy id, or `section/view`. */
  const setTab = (id: string) => {
    const target = resolveSeoTarget(id);
    writeTarget(target.section, target.view);
  };
  const viewStrip = (section: SeoSectionId) => (
    <HubTabNav
      items={seoSectionViews(section).map((v) => ({ id: v.value, label: v.label }))}
      activeId={view ?? undefined}
      onSelect={(id) => writeTarget(section, id)}
      aria-label="Views"
    />
  );
  const [overview, setOverview] = useState<WebsiteSeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recrawling, setRecrawling] = useState(false);

  // Only the counters. Every pane below loads its own rows, so opening Geography no longer fetches
  // articles, research, runs and domains to render none of them.
  const loadOverview = async () => {
    setLoading(true);
    try {
      setOverview(await userWebsitesService.overview(website.id));
    } catch (e: any) {
      toast({ title: 'Failed to load the dashboard', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);


  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const result = await userWebsitesService.crawl(website.id);
      toast({ title: 'Crawl complete', description: describeCrawlResult(result) });
      void loadOverview();
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
    } finally {
      setRecrawling(false);
    }
  };

  const domainLabel = website.display_name || website.url.replace(/^https?:\/\//, '');

  return (
    <div className="min-h-screen">
      {/* `recordTitle` — a domain is a stored string, and Aleo has no Greek. */}
      <PageHeader
        icon={Globe}
        title={domainLabel}
        recordTitle
        subtitle={`${website.page_count} pages indexed · Last crawl: ${timeAgo(website.last_crawled_at)}`}
        breadcrumbs={[
          { label: 'My Profile', to: '/profile' },
          { label: 'Websites', to: '/profile?tab=websites' },
          { label: domainLabel },
        ]}
        actions={(
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={website.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-1" /> Visit
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={handleRecrawl} disabled={recrawling}>
              {recrawling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Recrawl
            </Button>
          </>
        )}
      />

      <div className="p-3 sm:p-6 space-y-6">
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
        <HubStatTile label="Articles" value={loading || !overview ? '—' : overview.articles.total} onClick={() => setTab('articles')} />
        <HubStatTile label="Keyword research" value={loading || !overview ? '—' : overview.keyword_research.total} onClick={() => setTab('keywords/research')} />
        <HubStatTile label="Toolkit runs" value={loading || !overview ? '—' : overview.toolkit_runs.total} onClick={() => setTab('reports/runs')} />
        <HubStatTile label="Domain audits" value={loading || !overview ? '—' : overview.tracked_domains.total} onClick={() => setTab('authority/history')} />
      </HubStatGrid>

      {/* Rendered from `SEO_SECTIONS` — seo/sections.ts. `HubRailSectionLabel` is how a group
          heading sits inside a Radix `TabsList`; `.section-rail` collapses it below `lg`. */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="flex flex-col gap-4 lg:flex-row lg:items-start"
      >
        <TabsList className="section-rail flex h-auto w-full shrink-0 flex-row gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
          {seoRailRows().map((row) => (row.kind === 'heading' ? (
            <HubRailSectionLabel key={`group:${row.label}`}>{row.label}</HubRailSectionLabel>
          ) : (
            <TabsTrigger key={row.section.value} value={row.section.value} className="w-full justify-start gap-2">
              <row.section.icon className="w-3.5 h-3.5 shrink-0" /> {row.section.label}
            </TabsTrigger>
          )))}
        </TabsList>

        <div className="min-w-0 flex-1 space-y-4">

        {/* `get_website_seo_overview` decides the number AND whether it can be trusted, so a tile
            says "the backlink source failed" rather than quietly not rendering. See seoMetrics.ts. */}
        <TabsContent value="overview">
          <WebsiteSeoOverviewPanel website={website} onOpenTab={setTab} />
        </TabsContent>

        <TabsContent value="ai">
          <WebsiteAiVisibilityPanel website={website} />
        </TabsContent>

        <TabsContent value="gsc" className="space-y-4">
          {viewStrip('gsc')}
          {view === 'cannibalisation' ? <WebsiteCannibalisationPanel website={website} /> : <WebsiteGscPanel website={website} />}
        </TabsContent>

        {/* Tracked = the keywords the operator CHOSE. Every other view here is discovery. */}
        <TabsContent value="keywords" className="space-y-4">
          {viewStrip('keywords')}
          {view === 'serp' && <WebsiteSerpFeaturesPanel website={website} onOpenRanks={() => setTab('keywords/tracked')} />}
          {view === 'research' && <WebsiteKeywordResearchPanel website={website} />}
          {view === 'tracked' && <WebsiteRankTrackerPanel website={website} />}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {viewStrip('analytics')}
          {view === 'overview' && <WebsiteAnalyticsPanel website={website} />}
          {view === 'pages' && <WebsiteAnalyticsPagesPanel website={website} />}
          {view === 'geo' && <WebsiteAnalyticsGeoPanel website={website} />}
          {view === 'tech' && <WebsiteAnalyticsTechPanel website={website} />}
          {view === 'commerce' && <WebsiteAnalyticsCommercePanel website={website} />}
          {view === 'funnel' && <WebsiteAnalyticsFunnelPanel website={website} />}
          {view === 'retention' && <WebsiteAnalyticsRetentionPanel website={website} />}
        </TabsContent>

        <TabsContent value="authority" className="space-y-4">
          {viewStrip('authority')}
          {view === 'history' ? <WebsiteDomainAuditsPanel website={website} /> : <WebsiteDomainIntelPanel website={website} />}
        </TabsContent>

        <TabsContent value="competitors">
          <WebsiteCompetitorsPanel website={website} />
        </TabsContent>

        <TabsContent value="articles" className="space-y-4">
          {viewStrip('articles')}
          {view === 'brand' ? (
            <WebsiteBrandProfilePanel websiteId={website.id} onOpenCompetitors={() => setTab('competitors')} />
          ) : (
            <>
              <WebsiteArticlesPanel website={website} />
              <TopicPlanCard websiteId={website.id} onOpenResearch={() => setTab('keywords/research')} />
            </>
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          {viewStrip('health')}
          {view === 'crawl' && <WebsiteCrawlPanel website={website} />}
          {view === 'pages' && <WebsitePagesPanel website={website} />}
          {view === 'homepage' && <WebsiteHealthPanel website={website} />}
          {view === 'llms' && <WebsiteLlmsTxtPanel website={website} />}
        </TabsContent>

        {/* Reports are the same derivations, frozen per build so an old report keeps its own period. */}
        <TabsContent value="reports" className="space-y-4">
          {viewStrip('reports')}
          {view === 'runs' ? <WebsiteToolkitRunsPanel website={website} /> : <WebsiteReportsPanel website={website} />}
        </TabsContent>
        </div>
      </Tabs>
      </div>
    </div>
  );
};

export default WebsiteSeoDashboard;
