import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { userWebsitesService, type GscQueryPageRows } from '@/services/userWebsitesService';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { weeklySeries, type WeekPoint } from './gscWeeklySeries';

const DAYS = 90;

function Sparkline({ points }: { points: WeekPoint[] }) {
  const w = 160;
  const h = 36;
  const max = Math.max(1, ...points.map((p) => p.impressions));
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (p.impressions / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-primary" role="img" aria-label="Weekly impressions">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

type Load =
  | { kind: 'loading' }
  | { kind: 'reason'; text: string }
  | { kind: 'ok'; url: string; totals: GscQueryPageRows; weeks: WeekPoint[] };

/** The published URL: stated by the operator, else the crawled page the answer check matched by slug. */
async function resolveUrl(articleId: string, publishedUrl: string | null): Promise<string | null> {
  if (publishedUrl) return publishedUrl;
  const { data, error } = await supabase
    .from('seo_article_answer_checks')
    .select('page_url')
    .eq('article_id', articleId)
    .not('page_url', 'is', null)
    .order('checked_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.page_url as string | undefined) ?? null;
}

/** Search Console clicks, impressions, position and a weekly trend for an article's published URL. */
export function ArticleSearchPerformance({ articleId, websiteId, publishedUrl }: {
  articleId: string;
  websiteId: string | null;
  publishedUrl: string | null;
}) {
  const [state, setState] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    const set = (s: Load) => { if (live) setState(s); };
    (async () => {
      if (!websiteId) return set({ kind: 'reason', text: 'This article is not linked to a website, so there is no Search Console data for it.' });
      const status = await userWebsitesService.gscStatus(websiteId);
      if (!status.connected) return set({ kind: 'reason', text: 'Search Console is not connected for this website.' });
      const url = await resolveUrl(articleId, publishedUrl);
      if (!url) {
        return set({ kind: 'reason', text: 'Unknown: the article has no published URL and no crawled page of the site matches its slug yet.' });
      }
      const totals = await userWebsitesService.gscQueryPageRows(websiteId, DAYS, { groupBy: 'page', page: url, limit: 5 });
      if (!totals) return set({ kind: 'reason', text: 'Search Console data could not be read for this website.' });
      const base = url.replace(/\/+$/, '');
      const { data: daily, error } = await supabase
        .from('gsc_performance')
        .select('date, clicks, impressions')
        .eq('website_id', websiteId)
        .in('page', [base, `${base}/`])
        .gte('date', totals.from)
        .lte('date', totals.to)
        .limit(10000);
      if (error) throw new Error(error.message);
      set({ kind: 'ok', url, totals, weeks: weeklySeries((daily ?? []) as { date: string; clicks: number; impressions: number }[]) });
    })().catch((e: Error) => set({ kind: 'reason', text: `Could not read Search Console data: ${e.message}` }));
    return () => { live = false; };
  }, [articleId, websiteId, publishedUrl]);

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Search Console, last {DAYS} days</CardTitle>
        {state.kind === 'ok' && <CardDescription className="break-all">{state.url}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {state.kind === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading Search Console
          </p>
        )}
        {state.kind === 'reason' && <p className="text-sm text-muted-foreground">{state.text}</p>}
        {state.kind === 'ok' && <PerformanceBody totals={state.totals} weeks={state.weeks} />}
      </CardContent>
    </Card>
  );
}

function PerformanceBody({ totals, weeks }: { totals: GscQueryPageRows; weeks: WeekPoint[] }) {
  if (totals.status !== 'ok') {
    return (
      <p className="text-sm text-muted-foreground">
        {totals.note ?? (totals.status === 'not_collected'
          ? 'Search Console data has not been collected for this website yet.'
          : `Search Console has no rows for this website between ${formatDate(totals.from)} and ${formatDate(totals.to)}.`)}
      </p>
    );
  }
  const row = totals.rows[0];
  if (!row) {
    return (
      <p className="text-sm text-muted-foreground">
        Search Console reported no searches for this URL between {formatDate(totals.from)} and {formatDate(totals.to)}.
        It withholds low-volume queries, so this is not proof the page has no traffic.
      </p>
    );
  }
  const metric = (label: string, value: string) => (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">{value}</div>
    </div>
  );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {metric('Clicks', formatNumber(row.clicks ?? 0))}
        {metric('Impressions', formatNumber(row.impressions ?? 0))}
        {metric('Avg. position', row.position != null ? String(row.position) : '—')}
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Weekly impressions</div>
          {weeks.length >= 2
            ? <Sparkline points={weeks} />
            : <div className="text-xs text-muted-foreground">Trend not collected: fewer than two weeks of rows for this URL.</div>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatDate(totals.from)} to {formatDate(totals.to)}. Counted from the queries Search Console reports per page, so
        anonymised queries are not included and the totals undercount.
      </p>
    </>
  );
}
