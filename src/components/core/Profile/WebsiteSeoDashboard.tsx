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
import { WebsiteAiVisibilityPanel } from '@/components/core/Profile/WebsiteAiVisibilityPanel';
import { WebsiteCompetitorsPanel } from '@/components/core/Profile/WebsiteCompetitorsPanel';
import { WebsiteRankTrackerPanel } from '@/components/core/Profile/WebsiteRankTrackerPanel';
import { WebsiteReportsPanel } from '@/components/core/Profile/WebsiteReportsPanel';
import { WebsiteCrawlPanel } from '@/components/core/Profile/WebsiteCrawlPanel';
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
import { HubRailSectionLabel, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { resolveSeoSection, seoRailRows, type SeoSectionId } from '@/components/core/Profile/seo/sections';
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
  const tab = resolveSeoSection(rawSection);

  // Normalise only when `?section=` was SET — its absence is the default, not a stale bookmark.
  useEffect(() => {
    if (rawSection && rawSection !== tab) {
      const next = new URLSearchParams(params);
      next.set('section', tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSection, tab]);

  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('section', id as SeoSectionId);
    setParams(next, { replace: true });
  };
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
        <HubStatTile label="Articles" value={loading ? '—' : overview?.articles.total ?? 0} onClick={() => setTab('articles')} />
        <HubStatTile label="Keyword research" value={loading ? '—' : overview?.keyword_research.total ?? 0} onClick={() => setTab('research')} />
        <HubStatTile label="Toolkit runs" value={loading ? '—' : overview?.toolkit_runs.total ?? 0} onClick={() => setTab('runs')} />
        <HubStatTile label="Tracked domains" value={loading ? '—' : overview?.tracked_domains.total ?? 0} onClick={() => setTab('domains')} />
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

        {/* The keywords the operator CHOSE. Every other pane here is discovery. */}
        <TabsContent value="ranks">
          <WebsiteRankTrackerPanel website={website} />
        </TabsContent>

        {/* The same derivations, frozen per build so an old report keeps its own period. */}
        <TabsContent value="reports">
          <WebsiteReportsPanel website={website} />
        </TabsContent>

        <TabsContent value="competitors">
          <WebsiteCompetitorsPanel website={website} />
        </TabsContent>

        <TabsContent value="brand" className="space-y-4">
          <WebsiteBrandProfilePanel />
        </TabsContent>

        <TabsContent value="articles" className="space-y-4">
          <WebsiteArticlesPanel website={website} />
        </TabsContent>

        <TabsContent value="research">
          <WebsiteKeywordResearchPanel website={website} />
        </TabsContent>

        <TabsContent value="runs">
          <WebsiteToolkitRunsPanel website={website} />
        </TabsContent>

        <TabsContent value="domains">
          <WebsiteDomainAuditsPanel website={website} />
        </TabsContent>

        <TabsContent value="gsc" className="space-y-4">
          <WebsiteGscPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <WebsiteAnalyticsPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-pages" className="space-y-4">
          <WebsiteAnalyticsPagesPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-geo" className="space-y-4">
          <WebsiteAnalyticsGeoPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-tech" className="space-y-4">
          <WebsiteAnalyticsTechPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-commerce" className="space-y-4">
          <WebsiteAnalyticsCommercePanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-funnel" className="space-y-4">
          <WebsiteAnalyticsFunnelPanel website={website} />
        </TabsContent>

        <TabsContent value="analytics-retention" className="space-y-4">
          <WebsiteAnalyticsRetentionPanel website={website} />
        </TabsContent>

        <TabsContent value="cannibalisation" className="space-y-4">
          <WebsiteCannibalisationPanel website={website} />
        </TabsContent>

        <TabsContent value="rankings">
          <WebsiteDomainIntelPanel website={website} />
        </TabsContent>

        <TabsContent value="crawl" className="space-y-4">
          <WebsiteCrawlPanel website={website} />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <WebsiteHealthPanel website={website} />
        </TabsContent>

        <TabsContent value="llms">
          <WebsiteLlmsTxtPanel website={website} />
        </TabsContent>
        </div>
      </Tabs>
      </div>
    </div>
  );
};

export default WebsiteSeoDashboard;
