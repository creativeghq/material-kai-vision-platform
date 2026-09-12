import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Minus, Plus, RefreshCw, Target, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Textarea } from '@/components/core/ui/textarea';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubToolbar } from '@/components/core/hub';
import {
  TableColumnHeader, nextSort, segmentOptions, type TableSort,
} from '@/components/core/ui/table-column-header';
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
import { KeywordDiscoveryCard } from './seo/KeywordDiscoveryCard';

/** Websites → Rankings. */

/**
 * SERP blocks worth reporting on. `present` is whether the block is on the page at
 * all; `owned` is whether it cites or shows us. A featured snippet on the page that
 * belongs to a rival is a target, not a win, and the two must not look alike.
 */
const FEATURE_LABELS: { key: string; label: string; short: string }[] = [
  { key: 'featured_snippet', label: 'Featured snippet', short: 'Snippet' },
  { key: 'ai_overview', label: 'AI Overview', short: 'AI' },
  { key: 'people_also_ask', label: 'People also ask', short: 'PAA' },
  { key: 'local_pack', label: 'Local pack', short: 'Local' },
  { key: 'images', label: 'Image pack', short: 'Images' },
  { key: 'video', label: 'Video', short: 'Video' },
  { key: 'knowledge_graph', label: 'Knowledge panel', short: 'Knowledge' },
];

function FeatureBadges({ present, owned }: { present: string[]; owned: string[] }) {
  const shown = FEATURE_LABELS.filter((f) => present.includes(f.key) || owned.includes(f.key));
  if (shown.length === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((f) => {
        const ours = owned.includes(f.key);
        return (
          <Badge
            key={f.key}
            variant={ours ? 'success' : 'neutral'}
            title={ours ? `${f.label}: cites or shows this site` : `${f.label} is on the page but does not name this site`}
          >
            {f.short}{ours ? ' ✓' : ''}
          </Badge>
        );
      })}
    </div>
  );
}

/** Ordered worst-last so the bar reads left-to-right as "best first". */
const BANDS: { key: string; label: string; tone: string }[] = [
  { key: 'top_3', label: 'Top 3', tone: 'bg-[hsl(var(--success))]' },
  { key: 'top_10', label: '4–10', tone: 'bg-[hsl(var(--success))]/60' },
  { key: 'top_30', label: '11–30', tone: 'bg-primary' },
  { key: 'top_100', label: '31–100', tone: 'bg-amber-500' },
  { key: 'not_ranking', label: 'Not ranking', tone: 'bg-muted-foreground/35' },
];

/**
 * The band a row sits in — the same five the distribution bar counts, plus the sixth
 * the bar cannot show: a check that FAILED is unknown, and must never be filed under
 * "not ranking" just because both of them lack a number.
 */
function bandOf(r: TrackedKeywordRow): string {
  if (r.error) return 'unknown';
  if (r.position == null) return 'not_ranking';
  if (r.position <= 3) return 'top_3';
  if (r.position <= 10) return 'top_10';
  if (r.position <= 30) return 'top_30';
  return 'top_100';
}
const BAND_LABELS: Record<string, string> = {
  ...Object.fromEntries(BANDS.map((b) => [b.key, b.label])),
  unknown: 'Could not check',
};
const BAND_ORDER = [...BANDS.map((b) => b.key), 'unknown'];

function movementOf(r: TrackedKeywordRow): string {
  if (r.error) return 'unknown';
  if (r.entered) return 'entered';
  if (r.lost) return 'lost';
  if (r.change == null) return 'first';
  if (r.change > 0) return 'up';
  if (r.change < 0) return 'down';
  return 'flat';
}
const MOVE_LABELS: Record<string, string> = {
  up: 'Moved up', down: 'Moved down', flat: 'Unchanged',
  entered: 'Entered the top 100', lost: 'Lost its position',
  first: 'No previous check', unknown: 'Could not check',
};
const MOVE_ORDER = ['up', 'down', 'flat', 'entered', 'lost', 'first', 'unknown'];

/** Who put the keyword in the set. Only the engine's own may be auto-retired. */
const SOURCE_LABELS: Record<string, string> = {
  manual: 'Chosen',
  gsc_auto: 'Found in Search Console',
};

type SortKey = 'keyword' | 'position' | 'change' | 'features' | 'url';
/** Sorting a table of positions on anything but position is how you lose your place. */
const TEXT_SORT_KEYS = ['keyword', 'url'] as const;

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
  const [search, setSearch] = useState('');
  // One filter per column, each set from that column's own header.
  const [bands, setBands] = useState<string[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'position', dir: 'asc' });

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

  // Search matches the keyword and the page that ranks for it — "which keyword brings
  // people to /products/etics" is the same question asked from the other end.
  const q = search.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (bands.length && !bands.includes(bandOf(r))) return false;
    if (moves.length && !moves.includes(movementOf(r))) return false;
    if (sources.length && !sources.includes(r.source || 'manual')) return false;
    if (features.length && !features.some((f) => (r.serp_features ?? []).includes(f))) return false;
    if (!q) return true;
    return r.keyword.toLowerCase().includes(q) || (r.url ?? '').toLowerCase().includes(q);
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'keyword') return a.keyword.localeCompare(b.keyword, 'el') * dir;
    if (sort.key === 'url') return (a.url ?? '').localeCompare(b.url ?? '') * dir;
    if (sort.key === 'features') {
      return ((a.serp_features?.length ?? 0) - (b.serp_features?.length ?? 0)) * dir;
    }
    if (sort.key === 'change') {
      // No change to report sorts last in both directions: it is an absence, not a zero.
      const av = a.change ?? null; const bv = b.change ?? null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    }
    // Position: an unranked or unknown keyword has no position, and must not sort as 0
    // — that would put every keyword we do NOT rank for at the top of "best first".
    const av = a.position ?? Number.POSITIVE_INFINITY;
    const bv = b.position ?? Number.POSITIVE_INFINITY;
    if (av === bv) return a.keyword.localeCompare(b.keyword, 'el');
    return av < bv ? -dir : dir;
  });

  const filtering = q.length > 0 || bands.length > 0 || moves.length > 0
    || sources.length > 0 || features.length > 0;
  const clearFilters = () => { setSearch(''); setBands([]); setMoves([]); setSources([]); setFeatures([]); };

  // Counted over the WHOLE set, not the page: a filter menu that only lists what
  // survives the current filter cannot be used to widen one.
  const featureFilterOptions = FEATURE_LABELS
    .map((f) => ({ value: f.key, label: f.label, count: rows.filter((r) => (r.serp_features ?? []).includes(f.key)).length }))
    .filter((o) => o.count > 0);

  // Clamped on every render so removing the last keyword on the last page does not
  // leave the reader on an empty page with no way back.
  const currentPage = clampPage(page, sortedRows.length);
  const visibleRows = paginate(sortedRows, currentPage);
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
              {/* The timestamp, not the capture DATE: the date read "checked 10h ago" at ten in the morning. */}
              {s?.last_checked_at || s?.captured_at ? <> · checked {timeAgo(s.last_checked_at ?? s.captured_at)}</> : null}
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

              {s.features && (
                <div className="border-t border-hairline pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Featured snippets and AI Overviews on your keywords' results pages — and how many of them name you
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {FEATURE_LABELS.slice(0, 4).map((f) => {
                      const v = s.features?.[f.key];
                      if (!v) return null;
                      return (
                        <div key={f.key}>
                          <p className="text-xs font-semibold text-muted-foreground">{f.label}</p>
                          <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                            {v.owned}<span className="text-sm text-muted-foreground">/{v.present}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.present === 0 ? 'on none of your pages' : v.owned === 0 ? `on ${v.present}, none cite you` : 'cite you / on the page'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
            <CardDescription>
              Best position first. Change is against the previous check — up means up the page.
              Click a column to sort by it; the funnel on a column filters by what is in it.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <HubToolbar
              search={search}
              onSearchChange={(v) => { setSearch(v); setPage(1); }}
              searchPlaceholder="Search keywords and ranking pages…"
              actions={
                filtering ? (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{sortedRows.length} of {rows.length}</span>
                    <Button variant="link" size="sm" className="h-8 px-0 text-xs" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </span>
                ) : null
              }
            />
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableColumnHeader
                      sortKey="keyword"
                      sort={sort}
                      onSort={(k) => setSort((v) => nextSort(v, k, TEXT_SORT_KEYS))}
                      segment={{
                        label: 'Source',
                        options: segmentOptions(rows, (r) => r.source || 'manual', SOURCE_LABELS, ['manual', 'gsc_auto']),
                        selected: sources,
                        onChange: (v) => { setSources(v); setPage(1); },
                      }}
                    >
                      Keyword
                    </TableColumnHeader>
                    <TableColumnHeader
                      align="right"
                      sortKey="position"
                      sort={sort}
                      onSort={(k) => setSort((v) => nextSort(v, k, TEXT_SORT_KEYS))}
                      segment={{
                        label: 'Position band',
                        options: segmentOptions(rows, bandOf, BAND_LABELS, BAND_ORDER),
                        selected: bands,
                        onChange: (v) => { setBands(v); setPage(1); },
                      }}
                    >
                      Position
                    </TableColumnHeader>
                    <TableColumnHeader
                      align="right"
                      sortKey="change"
                      sort={sort}
                      onSort={(k) => setSort((v) => nextSort(v, k, TEXT_SORT_KEYS))}
                      segment={{
                        label: 'Movement',
                        options: segmentOptions(rows, movementOf, MOVE_LABELS, MOVE_ORDER),
                        selected: moves,
                        onChange: (v) => { setMoves(v); setPage(1); },
                      }}
                    >
                      Change
                    </TableColumnHeader>
                    <TableColumnHeader className="w-28">Trend</TableColumnHeader>
                    <TableColumnHeader
                      sortKey="features"
                      sort={sort}
                      onSort={(k) => setSort((v) => nextSort(v, k, TEXT_SORT_KEYS))}
                      segment={{
                        label: 'SERP blocks',
                        options: featureFilterOptions,
                        selected: features,
                        onChange: (v) => { setFeatures(v); setPage(1); },
                      }}
                    >
                      SERP blocks
                    </TableColumnHeader>
                    <TableColumnHeader
                      sortKey="url"
                      sort={sort}
                      onSort={(k) => setSort((v) => nextSort(v, k, TEXT_SORT_KEYS))}
                    >
                      Ranking page
                    </TableColumnHeader>
                    <TableColumnHeader className="w-10"><span className="sr-only">Stop tracking</span></TableColumnHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{r.keyword}</span>
                          {r.source === 'gsc_auto' && (
                            <Badge
                              variant="info"
                              title={
                                `Added automatically from Search Console${
                                  r.source_detail?.impressions != null
                                    ? ` — ${r.source_detail.impressions} impressions on ${r.source_detail.days_seen ?? '?'} days at position ${r.source_detail.position ?? '?'}`
                                    : ''
                                }. It is retired again if it stops earning impressions and stops ranking.`
                              }
                            >
                              auto
                            </Badge>
                          )}
                        </div>
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
                            : <span className="text-xs text-muted-foreground">not in top {r.depth_checked ?? 100}</span>}
                      </TableCell>
                      <TableCell className="text-right"><Change row={r} /></TableCell>
                      <TableCell>
                        {r.series.length >= 2
                          // Down is good for position, so the sparkline's own
                          // good/bad colouring has to be told which way round it is.
                          ? <Sparkline points={r.series.map((p) => p.v)} upIsGood={false} className="h-6 w-24" />
                          : <span className="text-[11px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <FeatureBadges present={r.serp_features ?? []} owned={r.owned_features ?? []} />
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        {r.url
                          ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{r.url}</a>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => remove(r.id)} aria-label={`Stop tracking ${r.keyword}`}
                          title="Stop tracking this — and stop the discovery engine offering it back">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {sortedRows.length === 0 && (
              // `filtered`, never `empty`: the keywords are all still tracked, and
              // offering "add keywords" to somebody who has 130 of them and a typo in
              // the search box is how duplicates get made.
              <HubEmptyState
                variant="filtered"
                title="No tracked keyword matches"
                description="All of them are still being tracked — the search box or a column filter is hiding them."
                action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>}
              />
            )}
            <TablePagination page={currentPage} total={sortedRows.length} onPageChange={setPage} label="keywords" />
          </CardContent>
        </Card>
      )}

      <KeywordDiscoveryCard website={website} onTracked={() => { void load(); }} />
    </div>
  );
};

export default WebsiteRankTrackerPanel;
