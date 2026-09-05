import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Minus, Plus, RefreshCw, Target, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Textarea } from '@/components/core/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import {
  userWebsitesService,
  type RankSummary,
  type TrackedKeywordRow,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { Sparkline } from './seo/Sparkline';
import { compact } from './seo/seoMetrics';

/**
 * Websites → Rankings.
 *
 * The keywords YOU chose, followed day by day. Everything else in this module
 * answers "what does this domain rank for" — discovery. This answers "did the
 * things I care about move", which is the only question that makes a rank tracker
 * worth opening on a Tuesday.
 *
 * Three rules the arithmetic keeps, all of them the same rule wearing different
 * clothes:
 *
 *  - **Not ranking is not position 101.** A keyword outside the top 100 stores NULL
 *    and is excluded from the average. Give it a sentinel rank and it gets averaged
 *    and charted as though it were real — and dropping your worst keyword would
 *    then look like an improvement.
 *  - **A failed check is unknown, not lost.** It is excluded from every figure and
 *    counted separately, because announcing "you fell out of the top 10" over a
 *    timed-out request is worse than saying nothing.
 *  - **Up is good.** Position 3 beats position 30, so the change column is inverted
 *    from the raw delta and coloured by meaning rather than by sign.
 */

/** Ordered worst-last so the bar reads left-to-right as "best first". */
const BANDS: { key: string; label: string; tone: string }[] = [
  { key: 'top_3', label: 'Top 3', tone: 'bg-[hsl(var(--success))]' },
  { key: 'top_10', label: '4–10', tone: 'bg-[hsl(var(--success))]/60' },
  { key: 'top_30', label: '11–30', tone: 'bg-primary' },
  { key: 'top_100', label: '31–100', tone: 'bg-amber-500' },
  { key: 'not_ranking', label: 'Not ranking', tone: 'bg-muted-foreground/35' },
];

function Change({ row }: { row: TrackedKeywordRow }) {
  if (row.error) {
    return <span className="text-xs text-amber-800 dark:text-amber-300" title={row.error}>unknown</span>;
  }
  if (row.entered) return <Badge variant="success">entered</Badge>;
  if (row.lost) return <Badge variant="error">lost</Badge>;
  if (row.change == null) return <span className="text-xs text-muted-foreground">—</span>;
  if (row.change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" aria-hidden="true" />0
      </span>
    );
  }
  // Positive `change` already means "moved up the page" — the RPC inverts the raw
  // delta so this column never has to think about it.
  const up = row.change > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${
        up ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--error))]'
      }`}
    >
      {up ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(row.change)}
    </span>
  );
}

export const WebsiteRankTrackerPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [data, setData] = useState<RankSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await userWebsitesService.rankSummary(website.id, 90));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!website.workspace_id) return;
    setBusy('add');
    try {
      // One per line OR comma-separated — people paste both, and rejecting either
      // is a pointless argument with the clipboard.
      const list = adding.split(/[\n,]/);
      const n = await userWebsitesService.addTrackedKeywords(
        website.id, website.workspace_id, list, 'GR', 'el',
      );
      setAdding('');
      setShowAdd(false);
      toast({ title: `Tracking ${n} keyword${n === 1 ? '' : 's'}`, description: 'Positions arrive on the next check.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not add them', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    try {
      const r = await userWebsitesService.runRankCheck(website.id);
      // A run is capped (oldest-checked first), so with a large set it covers part of
      // it. Say which part, or "0 of 60 ranking" over a set of 129 reads as the site
      // having lost every position it held yesterday.
      const tracked = data?.tracked ?? r.checked;
      const scope = tracked > r.checked
        ? `Checked ${r.checked} of ${tracked} (oldest first — run again for the rest)`
        : `Checked ${r.checked}`;
      toast({
        title: 'Rank check finished',
        description: `${scope} · ${r.ranking} ranking${r.failed ? ` · ${r.failed} could not be checked` : ''}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Rank check failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await userWebsitesService.removeTrackedKeyword(id);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not remove it', description: e?.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const s = data?.summary;
  const rows = data?.keywords ?? [];
  // Clamped on every render so removing the last keyword on the last page does not
  // leave the reader on an empty page with no way back.
  const currentPage = clampPage(page, rows.length);
  const visibleRows = paginate(rows, currentPage);
  const bandTotal = s ? BANDS.reduce((t, b) => t + (s.distribution[b.key] ?? 0), 0) || 1 : 1;
  const addForm = (
    <div className="space-y-2">
      <Textarea
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        placeholder={'πλακακια μπανιου\nbathroom tiles greece\nporcelain tile supplier'}
        rows={4}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={add} disabled={busy === 'add' || !adding.trim()}>
          {busy === 'add' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          Track these
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setAdding(''); }}>Cancel</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">One per line or comma-separated. Checked daily in Greek results.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Rankings
            </CardTitle>
            <CardDescription>
              The keywords you chose, followed daily.
              {data?.tracked ? <> · {data.tracked} tracked</> : null}
              {s?.captured_at ? <> · checked {timeAgo(s.captured_at)}</> : null}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {data?.tracked ? (
              <Button size="sm" variant="outline" onClick={check} disabled={!!busy}>
                {busy === 'check' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                Check now
              </Button>
            ) : null}
            {!showAdd && (
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1 h-4 w-4" />Add keywords
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {data?.note && (
            <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
              data.status === 'collector_failed' || (s?.failed ?? 0) > 0
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}>
              {((s?.failed ?? 0) > 0 || data.status === 'collector_failed') && (
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{data.note}</span>
            </div>
          )}

          {showAdd && addForm}

          {data?.status === 'not_collected' && !showAdd ? (
            <HubEmptyState
              variant="empty"
              title={data.tracked ? 'No positions captured yet' : 'No keywords tracked yet'}
              description={
                data.tracked
                  ? 'The daily check fills these in overnight, or run one now.'
                  : 'Add the keywords you actually want to win. Ten you chose beat a thousand you happen to rank for.'
              }
              action={
                <Button size="sm" onClick={() => (data.tracked ? check() : setShowAdd(true))} disabled={!!busy}>
                  {data.tracked ? 'Check now' : 'Add keywords'}
                </Button>
              }
            />
          ) : s ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Visibility</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                    {s.visibility != null ? `${s.visibility}%` : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">of tracked keywords in the top 10</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Avg. position</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                    {s.avg_position != null ? `#${s.avg_position}` : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    across the {s.ranking} that rank
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Ranking</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                    {s.ranking}<span className="text-base text-muted-foreground">/{s.answered}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{s.not_ranking} outside the top 100</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Could not check</p>
                  <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${s.failed > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'}`}>
                    {s.failed}
                  </p>
                  <p className="text-[11px] text-muted-foreground">unknown, not unranked</p>
                </div>
              </div>

              {(data.visibility_trend?.length ?? 0) >= 2 && (
                <div className="border-t border-hairline pt-3">
                  <p className="mb-1 text-xs text-muted-foreground">Visibility over time</p>
                  <Sparkline
                    points={(data.visibility_trend ?? []).map((p) => p.v)}
                    className="h-12 w-full"
                    ariaLabel="Visibility over time"
                  />
                </div>
              )}

              <div className="border-t border-hairline pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Where the tracked set sits</p>
                <div className="flex h-2.5 overflow-hidden rounded-sm">
                  {BANDS.map((b) => {
                    const v = s.distribution[b.key] ?? 0;
                    return v ? <div key={b.key} className={b.tone} style={{ width: `${(v / bandTotal) * 100}%` }} title={`${b.label}: ${v}`} /> : null;
                  })}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
                  {BANDS.map((b) => (
                    <div key={b.key}>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${b.tone}`} aria-hidden="true" />
                        <span className="text-[11px] text-muted-foreground">{b.label}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {s.distribution[b.key] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Tracked keywords</CardTitle>
            <CardDescription>Best position first. Change is against the previous check — up means up the page.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right">Position</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="w-28">Trend</TableHead>
                    <TableHead>Ranking page</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate font-medium">{r.keyword}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.country_code} · {r.device}
                          {r.search_volume != null ? ` · ${compact(r.search_volume)}/mo` : ''}
                          {/* A capped run leaves part of the set on an older day; say so per
                              row rather than let yesterday's position pass as today's. */}
                          {r.captured_at && s?.captured_at && r.captured_at !== s.captured_at
                            ? ` · checked ${timeAgo(r.captured_at)}`
                            : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.error
                          ? <span className="text-xs text-amber-800 dark:text-amber-300">?</span>
                          : r.position != null
                            ? <span className="font-semibold">{r.position}</span>
                            : <span className="text-xs text-muted-foreground">not in top 100</span>}
                      </TableCell>
                      <TableCell className="text-right"><Change row={r} /></TableCell>
                      <TableCell>
                        {r.series.length >= 2
                          // Down is good for position, so the sparkline's own
                          // good/bad colouring has to be told which way round it is.
                          ? <Sparkline points={r.series.map((p) => p.v)} upIsGood={false} className="h-6 w-24" />
                          : <span className="text-[11px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        {r.url
                          ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{r.url}</a>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => remove(r.id)} aria-label={`Stop tracking ${r.keyword}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination page={currentPage} total={rows.length} onPageChange={setPage} label="keywords" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebsiteRankTrackerPanel;
