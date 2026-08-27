import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Gauge, Globe, Link2, Loader2, RefreshCw, Search, TrendingUp } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubStatGrid } from '@/components/core/hub/HubStatTile';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  type AiVisibility,
  type SeoGscSummary,
  type SeoHealthSummary,
  type SeoOverview,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { timeAgo } from '@/utils/datetime';
import { SeoMetricTile } from './seo/SeoMetricTile';
import {
  DOMAIN_METRICS,
  GSC_METRICS,
  HEALTH_METRICS,
  compact,
  statusPresentation,
  type SeoMetric,
} from './seo/seoMetrics';

/**
 * Websites → Overview.
 *
 * The one screen that answers "how is this site doing in search", built to the
 * density of the tools people already read: a strip of headline numbers, each
 * with its movement and its own trend, then the position distribution, then the
 * feeds behind them (Search Console, technical health, AI assistants).
 *
 * What makes it different from those tools, and the reason it exists: **it never
 * hides a metric it could not fetch.** Every tile in the grid is always present.
 * A number we have is a number; a number we could not get says so, and says why.
 * The panel this replaces rendered four tiles when it had four and eight when it
 * had eight, so a backlink collector that has never once succeeded looked exactly
 * like a site with no backlinks.
 */

/** How stale is too stale to present as "current". */
const STALE_DAYS = 14;
function isStale(iso: string | null | undefined, days = STALE_DAYS): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > days * 86400000;
}

function SectionNote({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
        tone === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          : 'border-hairline bg-surface-sunken text-muted-foreground'
      }`}
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Position distribution — the shape of the ranking profile, not just its size. */
function PositionDistribution({ positions }: { positions: SeoOverview['positions'] }) {
  const presentation = statusPresentation(positions.status);
  if (positions.status !== 'ok') {
    return <SectionNote tone={presentation.tone === 'warning' ? 'warning' : 'info'}>{positions.note || presentation.explain}</SectionNote>;
  }
  if (!positions.total) {
    return (
      <p className="text-sm text-muted-foreground">
        The site does not rank in the top 100 for any tracked keyword in this market yet. The first thing that
        changes this number is publishing for queries you can realistically win.
      </p>
    );
  }

  const tones = [
    'bg-[hsl(var(--success))]',
    'bg-[hsl(var(--success))]/70',
    'bg-primary',
    'bg-primary/50',
    'bg-amber-500',
    'bg-muted-foreground/40',
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-sm">
        {positions.buckets.map((b, i) =>
          b.value ? (
            <div
              key={b.key}
              className={tones[i]}
              style={{ width: `${(b.value / positions.total) * 100}%` }}
              title={`${b.label}: ${b.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
        {positions.buckets.map((b, i) => (
          <div key={b.key}>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${tones[i]}`} aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground">{b.label}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-foreground">{b.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const WebsiteSeoOverviewPanel: React.FC<{
  website: UserWebsite;
  onOpenTab?: (tab: string) => void;
}> = ({ website, onOpenTab }) => {
  const { toast } = useToast();
  const [overview, setOverview] = useState<SeoOverview | null>(null);
  const [health, setHealth] = useState<SeoHealthSummary | null>(null);
  const [gsc, setGsc] = useState<SeoGscSummary | null>(null);
  const [ai, setAi] = useState<AiVisibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Four independent reads. `allSettled`, not `all`: one failing feed must
      // degrade its own section to "unavailable", never blank the whole screen.
      const [o, h, g, a] = await Promise.allSettled([
        userWebsitesService.seoOverview(website.id, 180),
        userWebsitesService.seoHealthSummary(website.id),
        userWebsitesService.seoGscSummary(website.id, 28),
        userWebsitesService.aiVisibility(website.id, 90),
      ]);
      setOverview(o.status === 'fulfilled' ? o.value : null);
      setHealth(h.status === 'fulfilled' ? h.value : null);
      setGsc(g.status === 'fulfilled' ? g.value : null);
      setAi(a.status === 'fulfilled' ? a.value : null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSnapshot = async () => {
    setRunning(true);
    try {
      await userWebsitesService.domainTrackRun(website.id);
      toast({ title: 'Snapshot updated' });
      await load();
    } catch (e: any) {
      toast({ title: 'Snapshot failed', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const metric = (key: string): SeoMetric | null =>
    (overview?.metrics?.[key] as SeoMetric | undefined) ?? null;

  const capturedAt = overview?.website.captured_at ?? null;
  const neverCaptured = !overview || overview.website.snapshot_count === 0;
  const stale = isStale(capturedAt);

  return (
    <div className="space-y-4">
      {/* ── Search presence ─────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              Search presence
            </CardTitle>
            <CardDescription>
              How this domain performs in organic search
              {overview?.website.country_code ? <> in {overview.website.country_code}</> : null}
              {capturedAt ? <> · captured {timeAgo(capturedAt)}</> : null}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runSnapshot} disabled={running}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            {neverCaptured ? 'Take first snapshot' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {neverCaptured && (
            <SectionNote tone="info">
              No snapshot has been taken for this site yet. Take one to pull ranking keywords, estimated traffic
              and backlinks — or leave it to the weekly tracker.
            </SectionNote>
          )}
          {stale && (
            <SectionNote tone="warning">
              These figures are from {timeAgo(capturedAt)} and may no longer reflect the site. Refresh for a
              current read.
            </SectionNote>
          )}

          <HubStatGrid>
            {DOMAIN_METRICS.map((d) => (
              <SeoMetricTile
                key={d.key}
                descriptor={d}
                metric={metric(d.key)}
                deltaCaption="vs last capture"
              />
            ))}
          </HubStatGrid>
        </CardContent>
      </Card>

      {/* ── Ranking profile ─────────────────────────────────────────────── */}
      {overview && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Ranking profile
            </CardTitle>
            <CardDescription>
              Where the site's {compact(overview.positions.total)} ranking keywords actually sit. Movement below
              is week over week.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PositionDistribution positions={overview.positions} />

            {overview.positions.status === 'ok' && (
              <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 sm:grid-cols-4">
                {(
                  [
                    ['Improved', overview.positions.movement.up, 'text-[hsl(var(--success))]'],
                    ['Declined', overview.positions.movement.down, 'text-[hsl(var(--error))]'],
                    ['New', overview.positions.movement.new, 'text-primary'],
                    ['Lost', overview.positions.movement.lost, 'text-muted-foreground'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label}>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Search Console ──────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" />
              Search Console
            </CardTitle>
            <CardDescription>
              First-party Google data — what you were actually shown and clicked for, over the last{' '}
              {gsc?.window_days ?? 28} days.
            </CardDescription>
          </div>
          {onOpenTab && gsc?.connected && (
            <Button variant="ghost" size="sm" onClick={() => onOpenTab('gsc')}>
              Queries &amp; pages
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {gsc && gsc.status !== 'ok' && (
            <SectionNote tone={statusPresentation(gsc.status).tone === 'warning' ? 'warning' : 'info'}>
              {gsc.note || statusPresentation(gsc.status).explain}
            </SectionNote>
          )}
          <HubStatGrid>
            {GSC_METRICS.map((d) => (
              <SeoMetricTile
                key={d.key}
                descriptor={d}
                metric={(gsc?.metrics?.[d.key] as SeoMetric | undefined) ?? null}
                deltaCaption="vs previous period"
              />
            ))}
          </HubStatGrid>
        </CardContent>
      </Card>

      {/* ── AI assistants ───────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              AI assistants
            </CardTitle>
            <CardDescription>
              Whether AI assistants name you when someone asks about what you sell — measured by probing them
              directly, over the last {ai?.window_days ?? 90} days.
            </CardDescription>
          </div>
          {onOpenTab && (
            <Button variant="ghost" size="sm" onClick={() => onOpenTab('ai')}>
              Full report
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {ai && ai.status !== 'ok' && (
            <SectionNote tone={statusPresentation(ai.status).tone === 'warning' ? 'warning' : 'info'}>
              {ai.note || statusPresentation(ai.status).explain}
            </SectionNote>
          )}
          {ai && ai.status === 'ok' && isStale(ai.totals.last_run_at, 21) && (
            <SectionNote tone="warning">
              The last AI probe ran {timeAgo(ai.totals.last_run_at)}. These figures describe that moment, not
              today.
            </SectionNote>
          )}
          {ai && (
            <HubStatGrid>
              <SeoMetricTile
                descriptor={{
                  key: 'sov',
                  label: 'Share of voice',
                  format: 'percent',
                  upIsGood: true,
                  help: 'Share of AI answers that named you, counted against probes that ANSWERED — never against probes that failed, which would report a broken model as zero visibility.',
                }}
                metric={{
                  value: ai.totals.share_of_voice,
                  previous: null,
                  delta: null,
                  delta_pct: null,
                  status: ai.totals.answered > 0 ? 'ok' : ai.status,
                  note: ai.note,
                  series: ai.trend.filter((t) => t.v != null).map((t) => ({ date: t.date, v: t.v as number })),
                }}
              />
              <SeoMetricTile
                descriptor={{
                  key: 'answered',
                  label: 'Answered probes',
                  format: 'count',
                  upIsGood: true,
                  help: 'Probes that returned a usable answer. The gap between this and probes sent is failed calls, not absent visibility.',
                }}
                metric={{
                  value: ai.totals.answered,
                  previous: null,
                  delta: null,
                  delta_pct: null,
                  status: ai.totals.probes > 0 ? 'ok' : 'not_collected',
                  note: null,
                  series: [],
                }}
              />
              <SeoMetricTile
                descriptor={{
                  key: 'avg_position',
                  label: 'Avg. mention rank',
                  format: 'position',
                  upIsGood: false,
                  help: 'Where you appear in the assistant\'s list when it does name you. Lower is better.',
                }}
                metric={{
                  value: ai.totals.avg_position,
                  previous: null,
                  delta: null,
                  delta_pct: null,
                  status: ai.totals.avg_position != null ? 'ok' : ai.status,
                  note: null,
                  series: [],
                }}
              />
              <SeoMetricTile
                descriptor={{
                  key: 'subjects',
                  label: 'Subjects tracked',
                  format: 'count',
                  upIsGood: true,
                  help: 'Brands and products being probed for this workspace.',
                }}
                metric={{
                  value: ai.subjects_tracked,
                  previous: null,
                  delta: null,
                  delta_pct: null,
                  status: ai.subjects_tracked > 0 ? 'ok' : 'not_collected',
                  note: null,
                  series: [],
                }}
              />
            </HubStatGrid>
          )}
        </CardContent>
      </Card>

      {/* ── Technical health ────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" />
              Technical health
            </CardTitle>
            <CardDescription>
              Lighthouse audit of the homepage
              {health?.audited_at ? <> · {timeAgo(health.audited_at)}</> : null}
              {health?.issue_count ? <> · {health.issue_count} open issues</> : null}
            </CardDescription>
          </div>
          {onOpenTab && (
            <Button variant="ghost" size="sm" onClick={() => onOpenTab('health')}>
              Issues
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {health && health.status !== 'ok' && (
            <SectionNote tone={statusPresentation(health.status).tone === 'warning' ? 'warning' : 'info'}>
              {health.note || statusPresentation(health.status).explain}
            </SectionNote>
          )}
          <HubStatGrid>
            {HEALTH_METRICS.map((d) => (
              <SeoMetricTile
                key={d.key}
                descriptor={d}
                metric={(health?.scores?.[d.key] as SeoMetric | undefined) ?? null}
                deltaCaption="vs last audit"
              />
            ))}
          </HubStatGrid>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebsiteSeoOverviewPanel;
