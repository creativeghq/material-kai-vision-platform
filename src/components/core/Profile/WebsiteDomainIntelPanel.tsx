import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, TrendingUp, ExternalLink, ArrowUp, ArrowDown, Sparkles, Link2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService, type UserWebsite, type DomainIntel } from '@/services/userWebsitesService';

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}
const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString());

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/** Position-distribution bar (1 · 2-3 · 4-10 · 11-20 · 21-50 · 51-100). */
function PositionBars({ s }: { s: DomainIntel['latest'] }) {
  if (!s) return null;
  const buckets = [
    { label: '#1', v: s.pos_1, c: 'bg-emerald-500' },
    { label: '2–3', v: s.pos_2_3, c: 'bg-emerald-400' },
    { label: '4–10', v: s.pos_4_10, c: 'bg-lime-500' },
    { label: '11–20', v: s.pos_11_20, c: 'bg-amber-500' },
    { label: '21–50', v: s.pos_21_50, c: 'bg-orange-500' },
    { label: '51–100', v: s.pos_51_100, c: 'bg-muted-foreground/50' },
  ];
  const total = buckets.reduce((t, b) => t + (b.v || 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden">
        {buckets.map((b) => (b.v ? <div key={b.label} className={b.c} style={{ width: `${((b.v || 0) / total) * 100}%` }} title={`${b.label}: ${fmt(b.v)}`} /> : null))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
        {buckets.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${b.c}`} /> {b.label}: <span className="tabular-nums text-foreground">{fmt(b.v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const WebsiteDomainIntelPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [intel, setIntel] = useState<DomainIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setIntel(await userWebsitesService.domainIntel(website.id, 180)); }
    catch (e: any) { toast({ title: 'Could not load Rankings & Links', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [website.id]);

  const run = async () => {
    setRunning(true);
    try { await userWebsitesService.domainTrackRun(website.id); toast({ title: 'Snapshot updated' }); load(); }
    catch (e: any) { toast({ title: 'Snapshot failed', description: e.message, variant: 'destructive' }); }
    finally { setRunning(false); }
  };

  if (loading) {
    return <Card className="dashboard-card"><CardContent className="flex items-center justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const s = intel?.latest;
  const kws = intel?.top_keywords || [];

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-4 h-4 text-primary" />Rankings & Links</CardTitle>
            <CardDescription>
              DataForSEO domain intelligence for the site's market
              {s?.country_code ? <> · {s.country_code}</> : null}
              {s ? <> · captured {timeAgo(s.captured_at)}</> : null}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={run} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {s ? 'Refresh' : 'Snapshot now'}
          </Button>
        </CardHeader>
        <CardContent>
          {!s ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No snapshot yet. Take one to pull ranking keywords, traffic and backlinks — or the weekly tracker will populate it.
            </div>
          ) : s.error ? (
            <div className="text-xs text-red-500">{s.error}</div>
          ) : (s.ranking_keywords == null && s.backlinks == null) ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              DataForSEO has no ranking or backlink data for <b>{website.url.replace(/^https?:\/\//, '')}</b> in {s.country_code}. This is normal for a new or low-traffic site — it fills in as the site gains search visibility.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric label="Ranking keywords" value={fmt(s.ranking_keywords)} />
                <Metric label="Est. monthly traffic" value={fmt(s.organic_traffic)} />
                <Metric label="Backlinks" value={fmt(s.backlinks)} />
                <Metric label="Referring domains" value={fmt(s.referring_domains)} sub={s.domain_rank != null ? `domain rank ${s.domain_rank}` : undefined} />
              </div>

              {(s.kw_up != null || s.kw_new != null) && (
                <div className="flex flex-wrap gap-4 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowUp className="w-3 h-3" /> {fmt(s.kw_up)} up</span>
                  <span className="inline-flex items-center gap-1 text-red-500"><ArrowDown className="w-3 h-3" /> {fmt(s.kw_down)} down</span>
                  <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="w-3 h-3" /> {fmt(s.kw_new)} new</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">{fmt(s.kw_lost)} lost</span>
                  {s.spam_score != null && <span className="inline-flex items-center gap-1 text-muted-foreground"><Link2 className="w-3 h-3" /> spam score {s.spam_score}</span>}
                </div>
              )}

              {(s.pos_1 || s.pos_4_10 || s.pos_11_20) ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Position distribution</p>
                  <PositionBars s={s} />
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {kws.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Top Ranking Keywords</CardTitle>
            <CardDescription>What the domain ranks for right now, best position first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right">Pos.</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Est. traffic</TableHead>
                    <TableHead>Page</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kws.map((k, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium max-w-[240px] truncate">{k.keyword}</TableCell>
                      <TableCell className="text-right tabular-nums">{k.position ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(k.search_volume)}</TableCell>
                      <TableCell className="text-right tabular-nums">{k.etv == null ? '—' : Math.round(k.etv).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {k.url ? (
                          <a href={`${website.url.replace(/\/$/, '')}${k.url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary text-xs">
                            <span className="truncate">{k.url}</span><ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebsiteDomainIntelPanel;
