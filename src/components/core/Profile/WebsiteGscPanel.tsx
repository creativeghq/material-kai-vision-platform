import React, { useEffect, useState } from 'react';
import { timeAgo } from '@/utils/datetime';
import {
  Loader2, RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, LineChart, Unplug, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { HubSegmented, HubToolbar, HubEmptyState } from '@/components/core/hub';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import {
  TableColumnHeader, nextSort, type TableSort,
} from '@/components/core/ui/table-column-header';
import { useToast } from '@/hooks/use-toast';
import { sourceStatusPresentation } from '@/components/core/Profile/seo/seoMetrics';
import { formatNumber } from '@/utils/decimal';
import {
  userWebsitesService, type UserWebsite, type GscStatus, type GscSummary,
} from '@/services/userWebsitesService';


const fmt = (n: number) => formatNumber((n ?? 0));

/**
 * The windows, in days INCLUDING the anchor day.
 *
 * "Today" is the most recent day Search Console has REPORTED, which is two or three
 * days ago — Google's reporting lag is real and the panel says which day it landed on
 * rather than showing a guaranteed-empty window for the actual calendar day.
 */
const WINDOWS: { value: string; label: string; title: string }[] = [
  { value: '1', label: 'Day', title: 'The most recent day Search Console has reported' },
  { value: '7', label: 'Week', title: 'Seven reported days, ending on the most recent' },
  { value: '28', label: 'Month', title: 'Twenty-eight reported days, ending on the most recent' },
  { value: '90', label: 'Quarter', title: 'Ninety reported days, ending on the most recent' },
];

/** Search Console figures are a VALUE or a stated REASON (CLAUDE.md rule 3). */
function GscMetric({ label, value, status }: { label: string; value: string; status: string | undefined }) {
  const p = sourceStatusPresentation(status === 'ok' ? null : status);
  if (!p) return <Metric label={label} value={value} />;
  return (
    <Metric
      label={label}
      value={
        <span
          className={`text-base font-medium ${p.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
          title={p.explain}
        >
          {p.placeholder}
        </span>
      }
    />
  );
}

/**
 * The "Search Performance" tab — Google Search Console for one connected website.
 * States: not-connected → connect · connected-without-property → pick property ·
 * connected → totals + top queries + top pages.
 */
export const WebsiteGscPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<GscStatus | null>(null);
  const [summary, setSummary] = useState<GscSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [props, setProps] = useState<{ property: string; permission?: string }[] | null>(null);
  const [view, setView] = useState<'queries' | 'pages' | 'countries' | 'appearance'>('queries');
  const [days, setDays] = useState<number>(28);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Click a header to sort by it; click again to flip. Search Console's own order
  // (by clicks) is the default, but the question is usually "where do I have
  // impressions and no clicks" — which is a sort by impressions or by position.
  type SortKey = 'label' | 'clicks' | 'impressions' | 'ctr' | 'position';
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'clicks', dir: 'desc' });
  const toggleSort = (key: SortKey) => setSort((s) => nextSort(s, key, ['label']));

  const load = async () => {
    setLoading(true);
    try {
      const st = await userWebsitesService.gscStatus(website.id);
      setStatus(st);
      if (st.connected && st.property) {
        setSummary(await userWebsitesService.gscSummary(website.id, days));
      } else {
        setSummary(null);
      }
    } catch (e: any) {
      toast({ title: 'Could not load Search Console', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [website.id, days]);

  const connect = async () => {
    setConnecting(true);
    try {
      const url = await userWebsitesService.gscAuthorize(website.id);
      // Full-page redirect to Google; we return to /profile?tab=websites with ?code&state,
      // which WebsitesTab finishes via gscCallback and reopens this dashboard.
      window.location.href = url;
    } catch (e: any) {
      toast({ title: 'Could not start Google sign-in', description: e.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const pickProperties = async () => {
    try {
      setProps(await userWebsitesService.gscListProperties(website.id));
    } catch (e: any) {
      toast({ title: 'Could not list properties', description: e.message, variant: 'destructive' });
    }
  };

  const chooseProperty = async (property: string) => {
    try {
      await userWebsitesService.gscSetProperty(website.id, property);
      await userWebsitesService.gscSync(website.id, 28);
      toast({ title: 'Property connected', description: property });
      setProps(null);
      load();
    } catch (e: any) {
      toast({ title: 'Could not set property', description: e.message, variant: 'destructive' });
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      // Pull at least the window being looked at — choosing Quarter and pressing Sync
      // should backfill a quarter — but never less than 28 days, so switching to Day
      // cannot quietly shorten the stored history everything else reads.
      const r = await userWebsitesService.gscSync(website.id, Math.max(days, 28));
      toast({ title: 'Synced from Search Console', description: `${r.rows} rows updated` });
      load();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google Search Console for this website? Historical performance rows are kept.')) return;
    try {
      await userWebsitesService.gscDisconnect(website.id);
      toast({ title: 'Disconnected' });
      load();
    } catch (e: any) {
      toast({ title: 'Disconnect failed', description: e.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <Card className="dashboard-card"><CardContent className="flex items-center justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  // ── Not connected ──
  if (!status?.connected) {
    return (
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle>Search Performance</CardTitle>
          <CardDescription>Connect Google Search Console to see the real queries, clicks, CTR and average position this site earns on Google — the ground truth behind the estimated data elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center text-center gap-4 py-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <LineChart className="w-6 h-6 text-primary" />
            </div>
            <div className="max-w-md text-sm text-muted-foreground">
              You'll be sent to Google to grant read-only access to your Search Console data for <span className="text-foreground font-medium">{website.url.replace(/^https?:\/\//, '')}</span>. Nothing is published or changed on your site.
            </div>
            {status?.last_sync_error && (
              <div className="text-xs text-[hsl(var(--error))] flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{status.last_sync_error}</div>
            )}
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Connect Search Console
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Connected but no property matched → pick one ──
  if (status.connected && !status.property) {
    return (
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle>Pick a Search Console Property</CardTitle>
          <CardDescription>Connected as {status.google_email}. We couldn't auto-match a property to this site's domain — choose which one to pull data from.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!props ? (
            <Button variant="outline" onClick={pickProperties}>Load my properties</Button>
          ) : props.length === 0 ? (
            <Empty text="This Google account has no Search Console properties. Add and verify your site in Search Console first, then reload." />
          ) : (
            props.map((p) => (
              <button key={p.property} onClick={() => chooseProperty(p.property)}
                className="w-full flex items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/30 hover:border-primary/40 transition-colors text-left">
                <span className="text-sm font-medium truncate">{p.property}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">{p.permission}<ChevronRight className="w-4 h-4" /></span>
              </button>
            ))
          )}
          <div className="pt-2">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect}><Unplug className="w-4 h-4 mr-1" />Disconnect</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Connected + property ──
  const t = summary?.totals;
  const VIEW_ROWS: Record<typeof view, () => any[]> = {
    queries: () => summary?.top_queries || [],
    pages: () => summary?.top_pages || [],
    countries: () => summary?.countries || [],
    appearance: () => summary?.appearances || [],
  };
  const labelOf = (r: any): string => String(view === 'queries' ? r.query : view === 'pages' ? r.page : r.value) ?? '';
  const q = search.trim().toLowerCase();
  const allRows = VIEW_ROWS[view]();
  const rows = allRows
    .filter((r) => !q || labelOf(r).toLowerCase().includes(q))
    .sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'label') return labelOf(a).localeCompare(labelOf(b), 'el') * dir;
      return ((Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0)) * dir;
    });
  const currentPage = clampPage(page, rows.length);
  const visibleRows = paginate(rows, currentPage);
  const firstColLabel = view === 'queries' ? 'Query' : view === 'pages' ? 'Page' : view === 'countries' ? 'Country' : 'Appearance';
  const devices = summary?.devices || [];
  const trend = summary?.trend || [];
  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" />Search Performance</CardTitle>
            <CardDescription>
              {status.property} · {status.google_email} · last sync {timeAgo(status.last_sync_at)}
              {summary ? <> · {summary.from} → {summary.to}</> : null}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            <HubSegmented
              aria-label="Date range"
              value={String(days)}
              onChange={(v) => { setDays(Number(v)); setPage(1); }}
              options={WINDOWS.map((w) => ({ value: w.value, label: w.label, title: w.title }))}
            />
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Sync
            </Button>
            <Button variant="ghost" size="icon" title="Disconnect" className="text-destructive hover:text-destructive" onClick={disconnect}><Unplug className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {status.last_sync_error && (
            <div className="mb-3 text-xs text-[hsl(var(--error))] flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5" /><span className="break-all">{status.last_sync_error}</span></div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <GscMetric label="Clicks" value={fmt(t?.clicks ?? 0)} status={summary?.status} />
            <GscMetric label="Impressions" value={fmt(t?.impressions ?? 0)} status={summary?.status} />
            <GscMetric label="Avg CTR" value={`${(t?.ctr ?? 0).toFixed(1)}%`} status={summary?.status} />
            <GscMetric label="Avg position" value={(t?.position ?? 0).toFixed(1)} status={summary?.status} />
          </div>
          {summary?.note && (
            // Which day this actually ends on, and whether the stored history is
            // shorter than the window asked for. Both are invisible otherwise — a
            // 90-day view of 57 days of data just looks like a quiet quarter.
            <p className="mt-3 text-xs leading-snug text-muted-foreground">{summary.note}</p>
          )}
          {trend.length > 1 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-1">
                Clicks · {summary?.days === 1 ? 'the reported day' : `${summary?.days} days to ${summary?.to}`}
              </p>
              <Sparkline points={trend.map((p) => p.clicks)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devices */}
      {devices.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader><CardTitle className="text-base">Devices</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {devices.map((d) => {
                const total = devices.reduce((s, x) => s + x.clicks, 0) || 1;
                const pct = Math.round((d.clicks / total) * 100);
                return (
                  <div key={d.value} className="flex items-center gap-3">
                    <span className="text-xs w-20 capitalize text-muted-foreground">{(d.value || '').toLowerCase()}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums w-24 text-right">{fmt(d.clicks)} clicks</span>
                    <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queries / Pages / Countries / Appearance */}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Breakdown</CardTitle>
          <HubSegmented
            aria-label="Breakdown dimension"
            value={view}
            // A search typed against queries means nothing against countries, and a
            // carried-over one leaves the new dimension looking empty.
            onChange={(v) => { setView(v); setSearch(''); setPage(1); }}
            className="flex-wrap"
            options={[
              { value: 'queries', label: 'Queries' },
              { value: 'pages', label: 'Pages' },
              { value: 'countries', label: 'Countries' },
              { value: 'appearance', label: 'Appearance' },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          {allRows.length === 0 ? (
            <Empty text="No data yet — Search Console has a 2–3 day reporting lag. Hit Sync tomorrow, or once the nightly pull runs." />
          ) : (
            <>
              <HubToolbar
                search={search}
                onSearchChange={(v) => { setSearch(v); setPage(1); }}
                searchPlaceholder={`Search ${firstColLabel.toLowerCase()}s…`}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableColumnHeader sortKey="label" sort={sort} onSort={toggleSort}>{firstColLabel}</TableColumnHeader>
                    <TableColumnHeader align="right" sortKey="clicks" sort={sort} onSort={toggleSort}>Clicks</TableColumnHeader>
                    <TableColumnHeader align="right" sortKey="impressions" sort={sort} onSort={toggleSort}>Impr.</TableColumnHeader>
                    <TableColumnHeader align="right" sortKey="ctr" sort={sort} onSort={toggleSort}>CTR</TableColumnHeader>
                    <TableColumnHeader align="right" sortKey="position" sort={sort} onSort={toggleSort}>Pos.</TableColumnHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[340px] truncate font-medium">
                        {view === 'pages' && r.page ? (
                          <a href={r.page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                            <span className="truncate">{r.page.replace(/^https?:\/\/[^/]+/, '') || r.page}</span><ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : view === 'queries' ? (r.query || '—')
                          : view === 'countries' ? <span className="uppercase">{r.value || '—'}</span>
                          : (r.value || '—')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.ctr.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.position.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length === 0 && (
                <HubEmptyState
                  variant="filtered"
                  title={`No ${firstColLabel.toLowerCase()} matches “${search.trim()}”`}
                  description={`Search Console reported ${allRows.length} in this window — the search box is excluding them.`}
                  action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}
                />
              )}
              <TablePagination
                page={currentPage} total={rows.length} onPageChange={setPage}
                label={`${firstColLabel.toLowerCase()}s`}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/** Minimal inline SVG sparkline — no chart dependency. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 600, h = 44, max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-11" role="img" aria-label="Clicks trend">
      <path d={area} fill="hsl(var(--primary) / 0.12)" />
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-center py-10 text-sm text-muted-foreground px-6">{text}</div>;
}

export default WebsiteGscPanel;
