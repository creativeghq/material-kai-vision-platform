import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PlayCircle, RefreshCw, ScanSearch } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { userWebsitesService, type CrawlReport, type UserWebsite } from '@/services/userWebsitesService';
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

const ISSUE_COPY: Record<string, { label: string; why: string }> = {
  non_indexable: {
    label: 'Cannot be indexed',
    why: 'Google is being told not to list these pages. If that is not deliberate, they cannot rank at all.',
  },
  broken_link: {
    label: 'Broken links',
    why: 'Links pointing at pages that no longer resolve. They waste crawl budget and dead-end real visitors.',
  },
  redirect_chain: {
    label: 'Redirect chains',
    why: 'A page redirecting to a page that redirects again. Each hop loses a little ranking signal and adds latency.',
  },
  duplicate_tags: {
    label: 'Duplicate titles or descriptions',
    why: 'Two pages claiming the same title compete with each other, and Google picks one — not necessarily the one you want.',
  },
  duplicate_content: {
    label: 'Duplicate content',
    why: 'Near-identical pages split the ranking signal that should have gone to one of them.',
  },
};

function severityTone(s: string): 'error' | 'warning' | 'neutral' {
  return s === 'error' ? 'error' : s === 'warning' ? 'warning' : 'neutral';
}

export const WebsiteCrawlPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<CrawlReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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

  const start = async () => {
    setBusy('start');
    try {
      await userWebsitesService.startCrawl(website.id, 100);
      toast({ title: 'Crawl started', description: 'It reads up to 100 pages. Refresh to follow progress.' });
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
          <div className="flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
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
                      {g.sample.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {g.sample.filter((sm) => sm.url).slice(0, 4).map((sm, i) => (
                            <li key={i} className="truncate text-[11px] text-muted-foreground">
                              <a href={sm.url!} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                                {sm.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
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
