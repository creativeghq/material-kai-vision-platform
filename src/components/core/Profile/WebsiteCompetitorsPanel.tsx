import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Swords, Trash2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  type CompetitorLine,
  type CompetitorRow,
  type CompetitorSeries,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { compact } from './seo/seoMetrics';

/**
 * Websites → Competitors.
 *
 * Your domain and the ones you compete with, on the same metric over the same
 * window. The comparison is the point: an organic-traffic line means very little
 * on its own and a great deal beside three rivals.
 *
 * Two things this does that a naive chart does not:
 *
 *  - **A tracked-but-never-measured competitor is drawn as absent, not as zero.**
 *    A rival added five minutes ago has no snapshots; plotting it at the axis
 *    floor invents a story about a company we simply have not looked at yet.
 *  - **Lines are keyed to a fixed palette by index**, so a domain keeps its colour
 *    between renders and between metrics. A legend whose colours reshuffle when
 *    you switch metric is worse than no legend.
 */

const METRICS: { key: string; label: string }[] = [
  { key: 'organic_traffic', label: 'Organic traffic' },
  { key: 'ranking_keywords', label: 'Keywords' },
  { key: 'organic_traffic_value', label: 'Traffic value' },
  { key: 'referring_domains', label: 'Referring domains' },
  { key: 'domain_rank', label: 'Domain rank' },
];

/** Distinct in both themes and distinguishable for the common colour-vision deficiencies. */
const LINE_COLORS = [
  'hsl(var(--primary))',
  '#e8710a',
  '#1a73e8',
  '#12b886',
  '#c2255c',
  '#7048e8',
  '#f59f00',
];

interface Plot {
  line: CompetitorLine;
  color: string;
  latest: number | null;
}

function MultiLineChart({ plots }: { plots: Plot[] }) {
  const drawable = plots.filter((p) => p.line.points.length >= 2);
  if (drawable.length === 0) return null;

  // A shared date axis across every line — plotting each on its own x-scale would
  // put two different weeks at the same pixel and make the comparison a lie.
  const allDates = Array.from(
    new Set(drawable.flatMap((p) => p.line.points.map((pt) => pt.date))),
  ).sort();
  const xOf = (d: string) => allDates.indexOf(d) / Math.max(allDates.length - 1, 1);

  const values = drawable.flatMap((p) => p.line.points.map((pt) => pt.v));
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const w = 720;
  const h = 220;
  const padL = 8;
  const padY = 10;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full min-w-[520px]" role="img" aria-label="Competitor comparison">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={0} x2={w}
            y1={padY + t * (h - padY * 2)} y2={padY + t * (h - padY * 2)}
            stroke="hsl(var(--border))" strokeWidth="1"
          />
        ))}
        {drawable.map((p) => {
          const d = p.line.points
            .map((pt, i) => {
              const x = padL + xOf(pt.date) * (w - padL * 2);
              const y = h - padY - ((pt.v - min) / range) * (h - padY * 2);
              return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <path
              key={p.line.key}
              d={d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.line.is_self ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
    </div>
  );
}

export const WebsiteCompetitorsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [series, setSeries] = useState<CompetitorSeries | null>(null);
  const [rows, setRows] = useState<CompetitorRow[]>([]);
  const [metric, setMetric] = useState('organic_traffic');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.allSettled([
        userWebsitesService.competitorSeries(website.id, 365, metric),
        userWebsitesService.listCompetitors(website.id),
      ]);
      setSeries(s.status === 'fulfilled' ? s.value : null);
      setRows(r.status === 'fulfilled' ? r.value : []);
    } finally {
      setLoading(false);
    }
  }, [website.id, metric]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!website.workspace_id) return;
    setBusy(true);
    try {
      await userWebsitesService.addCompetitor(website.id, website.workspace_id, adding);
      setAdding('');
      toast({ title: 'Competitor added', description: 'It is measured on the next weekly snapshot.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not add it', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await userWebsitesService.removeCompetitor(id);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not remove it', description: e?.message, variant: 'destructive' });
    }
  };

  const plots = useMemo<Plot[]>(() => {
    const lines: CompetitorLine[] = [];
    if (series?.self) lines.push(series.self);
    lines.push(...(series?.competitors ?? []));
    return lines.map((line, i) => ({
      line,
      color: line.is_self ? LINE_COLORS[0] : LINE_COLORS[(i % (LINE_COLORS.length - 1)) + 1],
      latest: line.points.length ? line.points[line.points.length - 1].v : null,
    }));
  }, [series]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? metric;

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Swords className="h-4 w-4 text-primary" />
              Competitors
            </CardTitle>
            <CardDescription>
              {metricLabel} for your site and the domains you compete with, over the last year.
              {series?.competitors_tracked ? <> · {series.competitors_tracked} tracked</> : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {METRICS.map((m) => (
              <Button
                key={m.key}
                size="sm"
                variant={metric === m.key ? 'secondary' : 'ghost'}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {series?.note && (
                <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                  {series.note}
                </p>
              )}

              <MultiLineChart plots={plots} />

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {plots.map((p) => (
                  <div key={p.line.key} className="flex items-center gap-2 rounded-sm border border-hairline px-2.5 py-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {p.line.label}
                      {p.line.is_self && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {/* Never measured is stated, not drawn at the axis floor. */}
                      {p.line.status === 'not_collected'
                        ? 'not measured yet'
                        : p.latest != null
                          ? compact(p.latest)
                          : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base">Tracked domains</CardTitle>
          <CardDescription>
            Each one is measured on the same weekly run as your site, in the same market — a rival
            measured in a different country is a different question on the same axis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="flobali.gr"
              onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) void add(); }}
            />
            <Button onClick={add} disabled={busy || !adding.trim()}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add
            </Button>
          </div>

          {rows.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No competitors tracked"
              description="Add the domains you actually lose deals to. Two or three real rivals beat a long list of vaguely similar sites."
            />
          ) : (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-sm border border-hairline px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {r.display_label || r.competitor_domain}
                  </span>
                  {r.source === 'auto' && <Badge variant="neutral">suggested</Badge>}
                  {!r.is_active && <Badge variant="warning">paused</Badge>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => remove(r.id)} aria-label={`Remove ${r.competitor_domain}`}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WebsiteCompetitorsPanel;
