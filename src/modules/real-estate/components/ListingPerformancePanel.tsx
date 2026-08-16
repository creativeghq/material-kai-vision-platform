import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, type ListingPerformance, type ListingViewPoint, type VendorReport } from '../services/realEstateService';
import { formatDate, localISODateOffset } from '@/utils/datetime';
/**
 * Listing performance (#281 gap 8). Everything here is READ from
 * `get_property_performance` — days-on-market included. Nothing on this panel recomputes a metric
 * from columns; that is the whole point of the derivation existing.
 *
 * Form choices, deliberately:
 *  • The headline metrics are single numbers with no trend to show → stat tiles, not charts.
 *  • Views over time is one series → a sparkline with no legend (the heading names it).
 *  • Lead sources is magnitude across a handful of named categories → ONE hue with the source name
 *    carrying identity, so there is no categorical palette to get wrong and identity is never
 *    color-alone.
 * Colour comes from the theme's `--primary` token, so light and dark are the design system's
 * problem rather than a second hardcoded palette.
 */

const Tile: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border bg-card px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

/** 90-day daily views. 2px line, recessive baseline, hover crosshair + tooltip. */
const Sparkline: React.FC<{ points: { day: string; views: number }[] }> = ({ points }) => {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 96, PAD = 4;
  const max = Math.max(1, ...points.map((p) => p.views));
  const x = (i: number) => PAD + (points.length <= 1 ? 0 : (i * (W - PAD * 2)) / (points.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(' ');
  const area = points.length ? `${path} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z` : '';
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" role="img"
        aria-label={`Daily views over the last ${points.length} days`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - PAD) / Math.max(1, W - PAD * 2)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="currentColor" className="text-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {area && <path d={area} fill="hsl(var(--primary))" opacity={0.12} />}
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <>
            <line x1={x(hover)} y1={PAD} x2={x(hover)} y2={H - PAD} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />
            <circle cx={x(hover)} cy={y(points[hover].views)} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute -top-1 left-0 rounded-md border bg-popover px-2 py-1 text-[11px] shadow-sm">
          <span className="font-medium tabular-nums">{hp.views}</span> view{hp.views === 1 ? '' : 's'} · {formatDate(hp.day)}
        </div>
      )}
    </div>
  );
};

export const ListingPerformancePanel: React.FC<{ ws: string | null; propertyId: string; canManage?: boolean }> = ({ ws, propertyId, canManage }) => {
  const { toast } = useToast();
  const [perf, setPerf] = useState<ListingPerformance | null | undefined>(undefined);
  const [series, setSeries] = useState<ListingViewPoint[]>([]);
  const [vendor, setVendor] = useState<VendorReport | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ws) return;
      try {
        const r = await realEstateService.listingPerformance(ws, propertyId);
        if (cancelled) return;
        setPerf(r.performance[0] ?? null); setSeries(r.series);
      } catch { if (!cancelled) setPerf(null); }
      // The vendor report is a separate, heavier read (comps) — it must not delay the tab, and its
      // failure must not blank the metrics above it.
      try {
        const v = await realEstateService.vendorReport(ws, propertyId);
        if (!cancelled) setVendor(v);
      } catch { /* preview simply stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [ws, propertyId]);

  const sendReport = async () => {
    if (!ws) return;
    setSending(true);
    try { const r = await realEstateService.sendVendorReport(ws, propertyId); toast({ title: 'Vendor report sent', description: r.to }); }
    catch (e) { toast({ title: 'Could not send', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSending(false); }
  };

  // Fill the gaps: a day with no traffic has no row, and skipping it would compress the x-axis and
  // draw a flat line through a quiet week as if it were busy.
  const points = useMemo(() => {
    const byDay = new Map(series.map((s) => [s.day, s.views]));
    const out: { day: string; views: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = localISODateOffset(-i);
      out.push({ day: d, views: byDay.get(d) ?? 0 });
    }
    return out;
  }, [series]);

  if (perf === undefined) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (perf === null) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No performance data yet.</div>;

  const sources = Object.entries(perf.lead_sources ?? {}).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...sources.map(([, n]) => n));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Days on market" value={perf.days_on_market ?? '—'} hint={perf.days_on_market == null ? 'not published' : undefined} />
        <Tile label="Views (30d)" value={perf.views_30d} hint={`${perf.views_total} all time`} />
        <Tile label="Views (7d)" value={perf.views_7d} />
        <Tile label="Leads" value={perf.inquiries_total} hint={`${perf.inquiries_30d} in 30d`} />
        <Tile label="Viewings" value={perf.viewings_total} hint={`${perf.viewings_completed} completed`} />
        <Tile
          label="Price change"
          value={perf.price_change_pct != null ? `${perf.price_change_pct > 0 ? '+' : ''}${perf.price_change_pct}%` : '—'}
          hint={perf.price_changes ? `${perf.price_changes} change${perf.price_changes === 1 ? '' : 's'}` : 'unchanged'}
        />
      </div>

      <Card><CardContent className="p-4">
        <div className="mb-1 text-sm font-semibold">Daily views — last 90 days</div>
        <Sparkline points={points} />
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <div className="mb-2 text-sm font-semibold">Where the leads came from</div>
        {sources.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No leads yet.</div>
        ) : (
          <div className="space-y-1.5">
            {sources.map(([source, n]) => (
              <div key={source} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 capitalize text-muted-foreground">{source.replace(/_/g, ' ')}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(n / maxSource) * 100}%`, background: 'hsl(var(--primary))' }} />
                </div>
                <span className="w-8 text-right tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>

      {/* The vendor report — what the seller is told, and the button that tells them. Shown as a
          preview first: an agent should never send a client a number they haven't seen. */}
      {vendor && (
        <Card><CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Vendor report</div>
              <div className="text-xs text-muted-foreground">
                {vendor.vendor?.email
                  ? <>Goes to {vendor.vendor.name || vendor.vendor.email} · sent automatically every Monday</>
                  : <>No vendor contact with an email on this listing — set one to enable the weekly report.</>}
              </div>
            </div>
            {canManage && vendor.vendor?.email && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={sending} onClick={sendReport}>
                {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />} Send now
              </Button>
            )}
          </div>
          {vendor.recommendation && (
            <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">{vendor.recommendation}</p>
          )}
          {vendor.market.suggestion && (
            <p className="mt-2 text-xs text-muted-foreground">
              Based on {vendor.market.comps_count} comparable local propert{vendor.market.comps_count === 1 ? 'y' : 'ies'}
              {vendor.market.avg_days_on_market != null ? `, which took an average of ${vendor.market.avg_days_on_market} days to sell` : ''}.
            </p>
          )}
          {vendor.feedback.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Viewer feedback included</div>
              <div className="space-y-1">
                {vendor.feedback.slice(0, 3).map((f, i) => (
                  <div key={i} className="text-sm text-muted-foreground">“{f.feedback.slice(0, 160)}”</div>
                ))}
              </div>
            </div>
          )}
        </CardContent></Card>
      )}
    </div>
  );
};
