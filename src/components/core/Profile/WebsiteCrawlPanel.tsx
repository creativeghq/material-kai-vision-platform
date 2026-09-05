import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PlayCircle, RefreshCw, ScanSearch } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { userWebsitesService, type CrawlIssueDetail, type CrawlReport, type UserWebsite } from '@/services/userWebsitesService';
import { compact } from './seo/seoMetrics';

/**
 * Websites → Site Health → the full crawl.
 *
 * The audit beside this one reads ONE page. Broken links, redirect chains,
 * duplicate titles and pages told not to index are properties of the SET of pages
 * — none of them is visible one page at a time, which is why a single-page audit
 * always reads as thin no matter how many checks it runs.
 *
 * The rule this panel keeps: **a section that failed is UNKNOWN, never clean.**
 * The crawler pulls each issue class separately, and any of those pulls can fail
 * on its own. Printing "0 broken links" because the broken-links call errored is
 * the same defect as reporting 0 backlinks for a failed fetch — a confident number
 * that reassures the reader about a check that never ran.
 */

const SEVERITY_ORDER: Array<'error' | 'warning' | 'notice'> = ['error', 'warning', 'notice'];

const ISSUE_COPY: Record<string, { label: string; why: string; fix: string }> = {
  non_indexable: {
    label: 'Cannot be indexed',
    why: 'Google is being told not to list these pages. If that is not deliberate, they cannot rank at all.',
    fix: 'Find the instruction named per page below and remove it: the Disallow line in robots.txt, the <meta name="robots" content="noindex"> tag, the X-Robots-Tag response header, or the rel="nofollow"/noindex attribute. Keep it only where the page really should stay out of search (cart, account, internal search).',
  },
  broken_link: {
    label: 'Broken links',
    why: 'Links pointing at pages that no longer resolve. They waste crawl budget and dead-end real visitors.',
    fix: 'On each source page, point the link at the page that replaced the target, or remove it. If the target should exist, restore it or 301-redirect the old URL.',
  },
  redirect_chain: {
    label: 'Redirect chains',
    why: 'A page redirecting to a page that redirects again. Each hop loses a little ranking signal and adds latency.',
    fix: 'Make the first URL redirect straight to the final one (a single 301), then update internal links, the sitemap and canonical tags to use the final URL so nothing goes through the chain at all. A loop must be broken by hand.',
  },
  duplicate_tags: {
    label: 'Duplicate titles or descriptions',
    why: 'Two pages claiming the same title compete with each other, and Google picks one — not necessarily the one you want.',
    fix: 'Give each listed page its own title and description that name what is different about it (the city, the product line, the use). If two pages are really the same thing, canonicalise one to the other or merge them.',
  },
  duplicate_content: {
    label: 'Duplicate content',
    why: 'Near-identical pages split the ranking signal that should have gone to one of them.',
    fix: 'Pick the page that should rank, add <link rel="canonical"> on the others pointing at it, and rewrite the ones that need to exist in their own right so they say something the canonical does not.',
  },
  error_page: {
    label: 'Pages returning an error',
    why: 'The crawler received a 4xx or 5xx status for these URLs, so they cannot be indexed and any link to them is a dead end.',
    fix: 'For a 404, restore the page or 301 it to its replacement and remove links to it. For a 5xx, read the server or application log for that URL — it is a crash, not a content problem.',
  },
};

/** DataForSEO's `reason` values for a non-indexable page, in plain words. */
const NON_INDEXABLE_REASON: Record<string, string> = {
  robots_txt: 'blocked by robots.txt',
  meta_tag: 'meta robots noindex on the page',
  http_header: 'X-Robots-Tag noindex response header',
  attribute: 'a nofollow / noindex attribute',
  too_many_redirects: 'too many redirects to reach it',
};

function severityTone(s: string): 'error' | 'warning' | 'neutral' {
  return s === 'error' ? 'error' : s === 'warning' ? 'warning' : 'neutral';
}

function pageUrl(p: string | { url: string | null; similarity: number | null }): string | null {
  return typeof p === 'string' ? p : p?.url ?? null;
}

/** The provider's detail for one issue, said in words — what is wrong on THIS page. */
function IssueDetailLine({ type, detail }: { type: string; detail: CrawlIssueDetail | null | undefined }) {
  if (!detail) return null;
  switch (type) {
    case 'non_indexable':
      return detail.reason
        ? <p className="text-[11px] text-muted-foreground">Reason: {NON_INDEXABLE_REASON[detail.reason] ?? detail.reason.replace(/_/g, ' ')}</p>
        : null;
    case 'redirect_chain': {
      const hops = detail.hops ?? [];
      if (hops.length === 0) return null;
      const path = [hops[0]?.from, ...hops.map((h) => h.to)].filter(Boolean) as string[];
      return (
        <p className="break-all text-[11px] text-muted-foreground">
          {detail.is_redirect_loop ? <Badge variant="error">loop</Badge> : null}
          {detail.is_redirect_loop ? ' ' : ''}
          {path.length} URLs: {path.join(' → ')}
        </p>
      );
    }
    case 'duplicate_tags':
      return (
        <div className="text-[11px] text-muted-foreground">
          {detail.accumulator ? <p className="truncate">Shared text: “{detail.accumulator}”</p> : null}
          {(detail.pages?.length ?? 0) > 0 && (
            <p className="truncate">
              {detail.total_count ?? detail.pages!.length} pages: {detail.pages!.map(pageUrl).filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      );
    case 'duplicate_content':
      return (detail.pages?.length ?? 0) > 0
        ? (
          <p className="truncate text-[11px] text-muted-foreground">
            Near-identical to {detail.pages!.map((p) => {
              const u = pageUrl(p);
              const sim = typeof p === 'object' && p?.similarity != null ? ` (${p.similarity}/10)` : '';
              return u ? `${u}${sim}` : null;
            }).filter(Boolean).join(', ')}
          </p>
        )
        : null;
    case 'broken_link':
      return (
        <p className="break-all text-[11px] text-muted-foreground">
          Links to {detail.link_to ?? '—'}{detail.status_code ? ` (HTTP ${detail.status_code})` : ''}
        </p>
      );
    case 'error_page':
      return detail.status_code ? <p className="text-[11px] text-muted-foreground">HTTP {detail.status_code}</p> : null;
    default:
      return null;
  }
}

export const WebsiteCrawlPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<CrawlReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await userWebsitesService.crawlReport(website.id));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  // The site's own page cap, not a flat 100: a 100-page read of a 5,000-page site
  // reports on the homepage's neighbourhood and calls it the site.
  const crawlPages = Math.max(100, Math.min(website.max_pages || 100, 6000));
  const start = async () => {
    setBusy('start');
    try {
      await userWebsitesService.startCrawl(website.id, crawlPages);
      toast({ title: 'Crawl started', description: `It reads up to ${crawlPages.toLocaleString()} pages. Refresh to follow progress.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not start the crawl', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const r = await userWebsitesService.syncCrawl(website.id);
      toast({
        title: r.status === 'finished' ? 'Crawl finished' : 'Still crawling',
        description: r.status === 'finished' ? `${r.issues ?? 0} issues found.` : 'Check back shortly.',
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not refresh', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const running = report?.status === 'running';
  const failedSections = Object.entries(report?.section_status ?? {}).filter(([, v]) => v === 'failed');
  const delta =
    report?.total_issues != null && report?.previous_total_issues != null
      ? report.total_issues - report.previous_total_issues
      : null;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4 text-primary" />
            Full site crawl
          </CardTitle>
          <CardDescription>
            Reads every page it can reach and reports what a single-page check cannot see.
            {report?.finished_at ? <> · last crawl {timeAgo(report.finished_at)}</> : null}
            {report?.pages_crawled != null ? <> · {compact(report.pages_crawled)} pages read</> : null}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {running && (
            <Button size="sm" variant="outline" onClick={sync} disabled={!!busy}>
              {busy === 'sync' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
              Refresh
            </Button>
          )}
          <Button size="sm" variant={running ? 'ghost' : 'outline'} onClick={start} disabled={!!busy || running}>
            {busy === 'start' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-1 h-4 w-4" />}
            {report?.crawl_count ? 'Crawl again' : 'Crawl the site'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {report?.note && (
          <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
            {report.note}
          </p>
        )}

        {/* A failed section is stated. Silence here would read as "nothing found". */}
        {failedSections.length > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {failedSections.length} check{failedSections.length === 1 ? '' : 's'} could not be fetched
              ({failedSections.map(([k]) => ISSUE_COPY[k]?.label ?? k).join(', ')}). Those are UNKNOWN, not clean —
              re-run the crawl to fill them in.
            </span>
          </div>
        )}

        {report?.status === 'not_collected' ? (
          <HubEmptyState
            variant="empty"
            title="This site has never been crawled"
            description="A crawl reads every page it can reach and reports the problems a homepage check cannot see."
            action={<Button size="sm" onClick={start} disabled={!!busy}>Crawl the site</Button>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Pages read</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                  {report?.pages_crawled != null ? compact(report.pages_crawled) : '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">of {report?.requested_pages ?? '—'} requested</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">On-page score</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                  {report?.onpage_score != null ? Math.round(report.onpage_score) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Issues</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                  {report?.total_issues != null ? compact(report.total_issues) : '—'}
                </p>
                {delta != null && delta !== 0 && (
                  <p className={`text-[11px] tabular-nums ${delta < 0 ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--error))]'}`}>
                    {delta < 0 ? '−' : '+'}{Math.abs(delta)} vs last crawl
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Pages affected</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                  {report?.pages_with_issues != null ? compact(report.pages_with_issues) : '—'}
                </p>
              </div>
            </div>

            {(report?.issue_groups?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {running
                  ? 'No issues recorded yet — the crawl is still reading pages.'
                  : 'No issues found in the checks that ran.'}
              </p>
            ) : (
              <div className="space-y-2">
                {SEVERITY_ORDER.flatMap((sev) =>
                  (report?.issue_groups ?? []).filter((g) => g.severity === sev),
                ).map((g) => {
                  const copy = ISSUE_COPY[g.issue_type];
                  return (
                    <div key={g.issue_type} className="rounded-sm border border-hairline p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={severityTone(g.severity)}>{g.severity}</Badge>
                          <span className="text-sm font-medium text-foreground">
                            {copy?.label ?? g.issue_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{compact(g.count)}</span>
                      </div>
                      {copy?.why && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{copy.why}</p>}
                      {copy?.fix && (
                        <p className="mt-1 text-[11px] leading-snug text-foreground">
                          <span className="font-semibold">Fix: </span>{copy.fix}
                        </p>
                      )}
                      {(() => {
                        // Every row carries something to act on: the URL where the provider
                        // gave one, and the detail either way. Rows with neither are the
                        // envelope bug and are filtered by the collector now.
                        const rows = g.sample.filter((sm) => sm.url || sm.detail);
                        if (rows.length === 0) return null;
                        const open = !!expanded[g.issue_type];
                        const shown = open ? rows : rows.slice(0, 4);
                        return (
                          <>
                            <ul className="mt-2 space-y-1.5">
                              {shown.map((sm, i) => (
                                <li key={i} className="min-w-0 text-[11px]">
                                  {sm.url ? (
                                    <a href={sm.url} target="_blank" rel="noopener noreferrer" className="block truncate text-foreground hover:text-primary hover:underline">
                                      {sm.url}
                                    </a>
                                  ) : null}
                                  <IssueDetailLine type={g.issue_type} detail={sm.detail} />
                                </li>
                              ))}
                            </ul>
                            {rows.length > 4 && (
                              <button
                                type="button"
                                className="mt-1.5 text-[11px] text-primary hover:underline"
                                onClick={() => setExpanded((e) => ({ ...e, [g.issue_type]: !open }))}
                              >
                                {open ? 'Show fewer' : `Show all ${rows.length}${g.count > rows.length ? ` of ${g.count}` : ''}`}
                              </button>
                            )}
                            {open && g.count > rows.length && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                The first {rows.length} of {g.count} are listed; the rest are in the crawl record.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteCrawlPanel;
