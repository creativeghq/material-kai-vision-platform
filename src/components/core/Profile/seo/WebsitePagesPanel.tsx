import React, { useCallback, useEffect, useState } from 'react';
import { Copy, FileSearch, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';

import {
  HubCellEmpty, HubDataTable, HubEmptyState, HubFilterSelect, HubStatGrid, HubToolbar, type HubColumn,
} from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { pageReviewService, type PageReviewSummary, type WebsitePageDetail, type WebsitePageRow } from '@/services/seo/pageReviewService';
import {
  PAGE_LIST_FILTERS, PAGE_LIST_FILTER_LABELS, PAGE_RECOMMENDATION_KIND_LABELS, PAGE_RECOMMENDATION_STATUS_LABELS,
  PAGE_REVIEW_VERDICT_LABELS, type PageListFilter, type PageRecommendationStatus, type PageReviewVerdict,
} from '@/services/seo/pageReviewVocabulary';
import type { UserWebsite } from '@/services/userWebsitesService';
import { userWebsitesService, type PageGscQuery } from '@/services/userWebsitesService';
import { formatNumber } from '@/utils/decimal';
import { timeAgo } from '@/utils/datetime';
import { humanEdgeRefusal } from '@/utils/edgeError';
import { CheckInventoryList } from './CheckInventoryList';
import { SeoMetricTile } from './SeoMetricTile';
import type { SeoMetricDescriptor } from './seoMetrics';

const PAGE_SIZE = 50;
/** The reserve ceiling in seo-api page_review (16k in / 3k out on Sonnet 5); the settle charges the real cost. */
const REVIEW_MAX_CREDITS = 10;

const SUMMARY_TILES: SeoMetricDescriptor[] = [
  { key: 'pages_known', label: 'Pages known', format: 'count', upIsGood: true, help: 'URLs listed in the sitemap that are still live.' },
  { key: 'pages_fetched', label: 'Pages read', format: 'count', upIsGood: true, help: 'Pages the crawler has read at least once. The rest are known but not fetched yet.' },
  { key: 'pages_reviewed', label: 'Pages reviewed', format: 'count', upIsGood: true, help: 'Pages with at least one page review.' },
  { key: 'recommendations_open', label: 'Open proposals', format: 'count', upIsGood: false, help: 'Proposals not yet seen on the live page by the crawler, and not dismissed.' },
  { key: 'recommendations_applied', label: 'Applied', format: 'count', upIsGood: true, help: 'Proposals the crawler found on the live page after they were made.' },
];

const VERDICT_TONE: Record<PageReviewVerdict, 'success' | 'warning' | 'error'> = { fine: 'success', improve: 'warning', rewrite: 'error' };
const STATUS_TONE: Record<PageRecommendationStatus, 'info' | 'success' | 'neutral'> = {
  open: 'info', applied: 'success', dismissed: 'neutral', stale: 'neutral',
};

const errorText = (e: unknown) => humanEdgeRefusal(e) ?? (e instanceof Error ? e.message : String(e));
const path = (url: string) => { try { return new URL(url).pathname || '/'; } catch { return url; } };

/** Website → Site health → Pages: every crawled page, its facts, and the review that proposes what to change. */
export const WebsitePagesPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const [summary, setSummary] = useState<PageReviewSummary | null>(null);
  const [rows, setRows] = useState<WebsitePageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [openPage, setOpenPage] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!website.workspace_id) return;
    pageReviewService.weeklyReview(website.workspace_id).then(setWeekly).catch(() => setWeekly(null));
  }, [website.workspace_id]);

  const saveWeekly = async (on: boolean) => {
    if (!website.workspace_id) return;
    setWeekly(on);
    try {
      await pageReviewService.setWeeklyReview(website.workspace_id, on);
    } catch (e) {
      setWeekly(!on);
      toast({ title: 'Not saved', description: errorText(e), variant: 'destructive' });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        pageReviewService.list(website.id, {
          filter: filter === 'all' ? null : (filter as PageListFilter), search, limit: PAGE_SIZE, offset,
        }),
        pageReviewService.summary(website.id),
      ]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      setError(errorText(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [website.id, filter, search, offset]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const total = rows[0]?.total_count ?? 0;
  const filtered = filter !== 'all' || !!search.trim();

  const columns: HubColumn<WebsitePageRow>[] = [
    {
      id: 'url', header: 'Page',
      cell: (r) => (
        <div className="min-w-0 max-w-md">
          <div className="truncate text-sm font-medium">{r.title || <span className="text-muted-foreground">{path(r.url)}</span>}</div>
          <div className="truncate text-xs text-muted-foreground">{path(r.url)}</div>
        </div>
      ),
    },
    {
      id: 'fetched', header: 'Read', hideBelow: 'md',
      cell: (r) => (r.fetched_at
        ? <span className="text-xs text-muted-foreground">{timeAgo(r.fetched_at)}</span>
        : <Badge variant="neutral">Not fetched</Badge>),
    },
    { id: 'clicks', header: 'Clicks 28d', align: 'right', cell: (r) => (r.gsc_clicks_28d == null ? <HubCellEmpty /> : formatNumber(r.gsc_clicks_28d)) },
    { id: 'impr', header: 'Impressions 28d', align: 'right', hideBelow: 'sm', cell: (r) => (r.gsc_impressions_28d == null ? <HubCellEmpty /> : formatNumber(r.gsc_impressions_28d)) },
    { id: 'score', header: 'On-page', align: 'right', hideBelow: 'lg', cell: (r) => (r.onpage_score == null ? <HubCellEmpty /> : Math.round(r.onpage_score)) },
    {
      id: 'review', header: 'Review', hideBelow: 'md',
      cell: (r) => (r.last_verdict
        ? <Badge variant={VERDICT_TONE[r.last_verdict]}>{PAGE_REVIEW_VERDICT_LABELS[r.last_verdict]}</Badge>
        : <HubCellEmpty />),
    },
    { id: 'open', header: 'Open', align: 'right', cell: (r) => (r.open_recommendations ? r.open_recommendations : <HubCellEmpty />) },
  ];

  return (
    <div className="space-y-4">
      <HubStatGrid>
        {SUMMARY_TILES.map((d) => (
          <SeoMetricTile key={d.key} descriptor={d} metric={summary?.[d.key as keyof PageReviewSummary]} />
        ))}
      </HubStatGrid>

      <Card className="dashboard-card overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Pages</CardTitle>
          <CardDescription>
            Every page the sitemap lists. Open one to see what the crawl read, what Google shows it for, and a review
            that proposes a better title, description and content. A proposal closes itself when the next crawl sees it live.
          </CardDescription>
          {weekly !== null && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={weekly} onCheckedChange={(v) => void saveWeekly(v)} />
              Review up to 25 pages a week across this workspace&apos;s sites: the pages with the most impressions (or the
              most internal links without Search Console) not reviewed in 30 days. Each review is charged like one run by hand.
            </label>
          )}
        </CardHeader>
        <HubToolbar
          search={search}
          onSearchChange={(v) => { setSearch(v); setOffset(0); }}
          searchPlaceholder="Search URL or title"
          filters={(
            <HubFilterSelect
              label="Show"
              value={filter}
              onChange={(v) => { setFilter(v); setOffset(0); }}
              options={[{ value: 'all', label: 'All pages' }, ...PAGE_LIST_FILTERS.map((f) => ({ value: f, label: PAGE_LIST_FILTER_LABELS[f] }))]}
            />
          )}
        />
        <CardContent className="p-0">
          {error ? (
            <p className="p-4 text-sm text-muted-foreground">Could not load the pages: {error}</p>
          ) : (
            <HubDataTable
              className="rounded-none border-0"
              rows={rows}
              columns={columns}
              rowId={(r) => r.page_id}
              onRowClick={(r) => setOpenPage(r.page_id)}
              loading={loading}
              empty={filtered ? (
                <HubEmptyState
                  variant="filtered" title="No page matches"
                  description="Nothing on this site matches the search or filter."
                  action={<Button size="sm" variant="outline" onClick={() => { setFilter('all'); setSearch(''); }}>Clear filters</Button>}
                />
              ) : (
                <HubEmptyState
                  icon={FileSearch} title="No pages yet"
                  description="The sitemap has not been read for this site. A crawl lists its pages and reads the ones Google shows."
                  action={<Button size="sm" variant="outline" onClick={() => void userWebsitesService.crawl(website.id).then(load)}>Crawl now</Button>}
                />
              )}
              footer={total > PAGE_SIZE ? (
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {formatNumber(total)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
                  </div>
                </div>
              ) : undefined}
            />
          )}
        </CardContent>
      </Card>

      <PageDrawer
        websiteId={website.id}
        pageId={openPage}
        onClose={() => setOpenPage(null)}
        onChanged={load}
      />
    </div>
  );
};

const PageDrawer: React.FC<{ websiteId: string; pageId: string | null; onClose: () => void; onChanged: () => void }> = ({
  websiteId, pageId, onClose, onChanged,
}) => {
  const { toast } = useToast();
  const [detail, setDetail] = useState<WebsitePageDetail | null>(null);
  const [queries, setQueries] = useState<PageGscQuery[] | null>(null);
  const [busy, setBusy] = useState<'review' | 'audit' | 'refetch' | null>(null);

  const load = useCallback(async () => {
    if (!pageId) return;
    setDetail(null);
    setQueries(null);
    try {
      const d = await pageReviewService.detail(pageId);
      setDetail(d);
      if (d) setQueries(await userWebsitesService.pageGscQueries(websiteId, d.page.url, 90).catch(() => []));
    } catch (e) {
      toast({ title: 'Could not open the page', description: errorText(e), variant: 'destructive' });
    }
  }, [pageId, websiteId, toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (kind: 'review' | 'audit' | 'refetch') => {
    if (!pageId || busy) return;
    setBusy(kind);
    try {
      if (kind === 'review') {
        const r = await pageReviewService.review(pageId);
        toast({ title: 'Page reviewed', description: `${PAGE_REVIEW_VERDICT_LABELS[r.data.verdict]} · ${r.data.credits_used} credits` });
      } else if (kind === 'audit') {
        await pageReviewService.audit(websiteId, pageId);
        toast({ title: 'Page audited' });
      } else {
        const r = await pageReviewService.refetch(websiteId, pageId);
        toast({ title: r.data?.pages_fetched ? 'Page read again' : 'The page could not be read' });
      }
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'That did not work', description: errorText(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (id: string) => {
    try {
      await pageReviewService.dismiss(id);
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'Could not dismiss', description: errorText(e), variant: 'destructive' });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied' });
    } catch {
      toast({ title: 'Copy failed', description: 'The browser refused clipboard access.', variant: 'destructive' });
    }
  };

  const p = detail?.page;
  const changedSinceReview = !!(detail?.review && p?.content_hash && detail.review.content_hash && detail.review.content_hash !== p.content_hash);

  return (
    <Sheet open={!!pageId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="break-all font-sans">{p?.title || (p ? path(p.url) : 'Page')}</SheetTitle>
          <SheetDescription className="break-all">
            {p ? <a className="text-primary underline" href={p.url} target="_blank" rel="noreferrer">{p.url}</a> : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        {!detail ? (
          <Loader2 className="mt-6 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void run('review')} disabled={!!busy || !p?.fetched_at}>
                {busy === 'review' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Review this page
              </Button>
              <Button size="sm" variant="outline" onClick={() => void run('audit')} disabled={!!busy}>
                {busy === 'audit' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1.5 h-3.5 w-3.5" />}
                Audit
              </Button>
              <Button size="sm" variant="outline" onClick={() => void run('refetch')} disabled={!!busy}>
                {busy === 'refetch' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Refetch
              </Button>
            </div>
            <p className="-mt-4 text-xs text-muted-foreground">
              A review costs up to {REVIEW_MAX_CREDITS} credits, charged at the real model cost.
              {!p?.fetched_at && ' This page has not been read yet: refetch it first.'}
            </p>

            <section>
              <h3 className="mb-2 text-sm font-semibold">What the crawl read</h3>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Read</dt><dd>{p?.fetched_at ? timeAgo(p.fetched_at) : 'Not fetched'}</dd>
                <dt className="text-muted-foreground">Status</dt><dd>{p?.http_status ?? '—'}</dd>
                <dt className="text-muted-foreground">Title</dt><dd>{p?.title || '—'}</dd>
                <dt className="text-muted-foreground">Description</dt><dd>{p?.description || '—'}</dd>
                <dt className="text-muted-foreground">H1</dt><dd>{p?.h1 || '—'}</dd>
                <dt className="text-muted-foreground">Canonical</dt><dd className="break-all">{p?.canonical_url || '—'}</dd>
                <dt className="text-muted-foreground">Language</dt><dd>{p?.lang || '—'}</dd>
                <dt className="text-muted-foreground">Words</dt><dd className="tabular-nums">{p?.word_count == null ? '—' : formatNumber(p.word_count)}</dd>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Review</h3>
              {detail.review ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={VERDICT_TONE[detail.review.verdict]}>{PAGE_REVIEW_VERDICT_LABELS[detail.review.verdict]}</Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(detail.review.created_at)} · {detail.review.credits} credits</span>
                    {changedSinceReview && <Badge variant="info">Page changed since</Badge>}
                  </div>
                  {detail.review.summary && <p className="text-sm">{detail.review.summary}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not reviewed yet.</p>
              )}
              {detail.recommendations.length > 0 && (
                <div className="mt-3 divide-y divide-hairline rounded-sm border border-hairline">
                  {detail.recommendations.map((r) => (
                    <div key={r.id} className="space-y-1 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{PAGE_RECOMMENDATION_KIND_LABELS[r.kind]}</span>
                        <Badge variant={STATUS_TONE[r.status]}>{PAGE_RECOMMENDATION_STATUS_LABELS[r.status]}</Badge>
                        <div className="ml-auto flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void copy(r.proposed_value)} aria-label="Copy">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {r.status === 'open' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void dismiss(r.id)} aria-label="Dismiss">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {r.kind === 'internal_link' ? (
                        <p className="text-sm">
                          Link “{r.evidence.anchor || '…'}” to <span className="break-all text-primary">{path(r.proposed_value)}</span>
                        </p>
                      ) : (
                        <p className="text-sm font-medium">{r.proposed_value}</p>
                      )}
                      {r.current_value && <p className="text-xs text-muted-foreground">Now: {r.current_value}</p>}
                      {r.rationale && <p className="text-xs text-muted-foreground">{r.rationale}</p>}
                      {r.evidence.source_query && <p className="text-xs text-muted-foreground">From the query “{r.evidence.source_query}”</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">What Google shows it for (90 days)</h3>
              {queries === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : queries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Search Console queries recorded for this page.</p>
              ) : (
                <ul className="divide-y divide-hairline rounded-sm border border-hairline text-sm">
                  {queries.slice(0, 15).map((q) => (
                    <li key={q.query} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        {q.query}
                        {q.position != null && q.position >= 4 && q.position <= 20 && <Badge variant="info" className="ml-2">Striking distance</Badge>}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatNumber(q.impressions)} impr · {formatNumber(q.clicks)} clicks · pos {q.position ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">On-page audit</h3>
              {detail.audit ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Score {detail.audit.onpage_score == null ? '—' : Math.round(detail.audit.onpage_score)} · {timeAgo(detail.audit.created_at)}
                    {detail.content_scores?.overall_score != null && ` · Content score ${Math.round(detail.content_scores.overall_score)} for “${detail.content_scores.keyword ?? ''}”`}
                  </p>
                  {Object.keys(detail.audit.source_errors ?? {}).length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Part of the audit could not be fetched: {Object.keys(detail.audit.source_errors).join(', ')}. Those checks are unknown, not passed.
                    </p>
                  )}
                  <CheckInventoryList checks={detail.audit.checks} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not audited yet. Audit runs the on-page checks for this URL.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
