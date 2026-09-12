/**
 * Websites → Rankings → the Search Console queries nothing is tracking yet.
 *
 * Every tracked keyword is a paid SERP call on every rotation, so this offers the gap
 * QUALIFIED rather than wholesale: operators and fragments refused, accent variants
 * folded into one, a ceiling on what the engine may add. Every query judged is shown
 * with its evidence, the ones passed over included — a list that hides what it
 * rejected cannot be checked by the person answerable for it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Plus, RefreshCw, Sparkles, Undo2, X,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableRow, TableHeader } from '@/components/core/ui/table';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import { HubEmptyState, HubSegmented, HubToolbar } from '@/components/core/hub';
import {
  TableColumnHeader, nextSort, segmentOptions, type TableSort,
} from '@/components/core/ui/table-column-header';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { sourceStatusPresentation } from '@/components/core/Profile/seo/seoMetrics';
import {
  userWebsitesService, type KeywordCandidate, type KeywordCandidates, type UserWebsite,
} from '@/services/userWebsitesService';

/** The verdict, in the reader's words. The engine takes the first three. */
const REASON: Record<string, { label: string; explain: string; tone: 'success' | 'info' | 'warning' }> = {
  earning_clicks: {
    label: 'Earning clicks',
    explain: 'People are already clicking through on this query — it is working, and worth watching.',
    tone: 'success',
  },
  recurring_impressions: {
    label: 'Recurring',
    explain: 'It keeps appearing: enough impressions, on enough separate days, to be a real query rather than a fluke.',
    tone: 'info',
  },
  striking_distance: {
    label: 'Near page one',
    explain: 'Close enough to the first page that a small move is worth measuring.',
    tone: 'info',
  },
};

const WATCHING = {
  label: 'Watching',
  explain: 'Visible, but too few impressions or too few separate days to be worth a daily check yet. It is offered here if you want it anyway.',
};

type SortKey = 'keyword' | 'impressions' | 'clicks' | 'position' | 'days_seen' | 'score' | 'reason';

/** How far back to judge from. Wider finds more; narrower reacts faster to a new page. */
const WINDOWS: { value: string; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '28', label: '28 days' },
  { value: '90', label: '90 days' },
];

const REASON_ORDER = ['earning_clicks', 'recurring_impressions', 'striking_distance', 'watching'] as const;

export const KeywordDiscoveryCard: React.FC<{
  website: UserWebsite;
  /** Called after anything that changes the tracked set, so the panel above reloads. */
  onTracked?: () => void;
}> = ({ website, onTracked }) => {
  const { toast } = useToast();
  const [data, setData] = useState<KeywordCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(28);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showDismissed, setShowDismissed] = useState(false);
  const [limitDraft, setLimitDraft] = useState<string>('');
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'score', dir: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await userWebsitesService.keywordCandidates(website.id, days, 200);
      setData(d);
      setLimitDraft(String(d?.autotrack_limit ?? 40));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [website.id, days]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    await load();
    onTracked?.();
  };

  const track = async (keywords: string[]) => {
    if (!keywords.length) return;
    setBusy(keywords.length === 1 ? keywords[0] : 'bulk');
    try {
      const r = await userWebsitesService.promoteKeywordCandidates(website.id, keywords, undefined, days);
      toast({
        title: r.added > 0 ? `Now tracking ${r.added} keyword${r.added === 1 ? '' : 's'}` : 'Nothing added',
        description: r.added > 0 ? 'Positions arrive on the next check.' : (r.note ?? undefined),
        variant: r.added > 0 ? undefined : 'destructive',
      });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not track them', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (keyword: string, undo = false) => {
    setBusy(keyword);
    try {
      await userWebsitesService.dismissKeywordCandidate(website.id, keyword, undo);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not save that', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const setAutotrack = async (on: boolean) => {
    setBusy('autotrack');
    try {
      await userWebsitesService.setKeywordAutotrack(website.id, on);
      toast({
        title: on ? 'Auto-tracking on' : 'Auto-tracking off',
        description: on
          ? 'Each night, after the Search Console sync, qualifying queries are added and automatic ones that have gone quiet are retired.'
          : 'Nothing will be added automatically. You can still track candidates by hand.',
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not change that', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const saveLimit = async () => {
    const n = Number(limitDraft);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === data?.autotrack_limit) return;
    setBusy('limit');
    try {
      await userWebsitesService.setKeywordAutotrack(website.id, data?.autotrack ?? false, n);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not save the limit', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => data?.candidates ?? [], [data]);
  const reasonKey = (c: KeywordCandidate) => c.reason ?? 'watching';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (reasons.length && !reasons.includes(reasonKey(c))) return false;
      if (!q) return true;
      return c.keyword.includes(q) || c.variants.some((v) => v.includes(q));
    });
  }, [rows, search, reasons]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === 'keyword') return a.keyword.localeCompare(b.keyword, 'el') * dir;
      if (sort.key === 'reason') {
        return (REASON_ORDER.indexOf(reasonKey(a) as never) - REASON_ORDER.indexOf(reasonKey(b) as never)) * dir;
      }
      const av = Number(a[sort.key] ?? 0);
      const bv = Number(b[sort.key] ?? 0);
      return (av - bv) * dir;
    });
  }, [filtered, sort]);

  const currentPage = clampPage(page, sorted.length);
  const visible = paginate(sorted, currentPage);
  const eligibleNow = filtered.filter((c) => c.reason).map((c) => c.keyword);
  const filtering = search.trim().length > 0 || reasons.length > 0;

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  // Not connected / never collected / nothing in the window: say which, never show an
  // empty table that reads as "Google has nothing on you".
  const unavailable = data.status !== 'ok' ? sourceStatusPresentation(data.status) : null;
  const counts = data.counts;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Found in Search Console
          </CardTitle>
          <CardDescription>
            Queries this site already appears for that nothing is tracking yet — with what Google
            measured, so you can see why each one is here.
            {data.latest_date ? <> Search Console data to {data.latest_date}.</> : null}
          </CardDescription>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <HubSegmented
            aria-label="Discovery window"
            value={String(days)}
            onChange={(v) => { setDays(Number(v)); setPage(1); }}
            options={WINDOWS}
          />
          <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Reload candidates">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── The engine switch. The cost sentence is not decoration: this is the one
            control on the page that spends money on a schedule. ── */}
        <div className="flex flex-wrap items-start gap-3 rounded-sm border border-hairline bg-surface-sunken p-3">
          <Switch
            checked={data.autotrack}
            onCheckedChange={(v) => void setAutotrack(v)}
            disabled={busy === 'autotrack'}
            aria-label="Add qualifying keywords automatically"
          />
          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-medium text-foreground">Add qualifying keywords automatically</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Runs nightly after the Search Console sync. Every tracked keyword is one paid
              position check per rotation, so the engine stops at the ceiling and retires
              automatic keywords that stop earning impressions and stop ranking.
              {data.last_sweep_at ? <> Last run {timeAgo(data.last_sweep_at)}{data.last_sweep_note ? ` — ${data.last_sweep_note}` : ''}</> : null}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="whitespace-nowrap">Ceiling</span>
            <Input
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => void saveLimit()}
              inputMode="numeric"
              aria-label="Maximum automatic keywords"
              className="h-8 w-16 text-center tabular-nums"
            />
            <span className="whitespace-nowrap">{data.auto_active} in use</span>
          </label>
        </div>

        {unavailable ? (
          <HubEmptyState
            icon={AlertTriangle}
            title={unavailable.placeholder}
            description={data.note ?? unavailable.explain}
          />
        ) : (
          <>
            {/* Every query in the window accounted for. The three numbers that are not
                opportunities are the ones that explain a short list. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure value={counts.eligible} label="clear the bar" tone="primary" />
              <Figure value={counts.watching} label="visible, below the bar" />
              <Figure value={counts.tracked} label="already tracked" />
              <Figure value={counts.junk} label="operators, not queries" />
            </div>

            {data.note && (
              <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs leading-snug text-muted-foreground">
                {data.note}
              </p>
            )}

            {rows.length > 0 && (
              <div className="overflow-hidden rounded-sm border border-hairline">
                <HubToolbar
                  search={search}
                  onSearchChange={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder="Search these queries…"
                  actions={
                    eligibleNow.length > 0 ? (
                      <Button size="sm" onClick={() => void track(eligibleNow)} disabled={!!busy}>
                        {busy === 'bulk' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                        Track the {eligibleNow.length} that qualify
                      </Button>
                    ) : null
                  }
                />
                {/* <Table> carries its own horizontal scroller — a second wrapper here
                    would nest two, and the inner one never gets a scrollbar. */}
                <Table>
                    <TableHeader>
                      <TableRow>
                        <TableColumnHeader sortKey="keyword" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}>
                          Query
                        </TableColumnHeader>
                        <TableColumnHeader align="right" sortKey="impressions" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}>
                          Impr.
                        </TableColumnHeader>
                        <TableColumnHeader align="right" sortKey="clicks" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}>
                          Clicks
                        </TableColumnHeader>
                        <TableColumnHeader align="right" sortKey="position" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}>
                          Pos.
                        </TableColumnHeader>
                        <TableColumnHeader align="right" sortKey="days_seen" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}>
                          Days
                        </TableColumnHeader>
                        <TableColumnHeader
                          sortKey="reason"
                          sort={sort}
                          onSort={(k) => setSort((s) => nextSort(s, k, ['keyword']))}
                          segment={{
                            label: 'Verdict',
                            options: segmentOptions(
                              rows, reasonKey,
                              { ...Object.fromEntries(Object.entries(REASON).map(([k, v]) => [k, v.label])), watching: WATCHING.label },
                              REASON_ORDER,
                            ),
                            selected: reasons,
                            onChange: (v) => { setReasons(v); setPage(1); },
                          }}
                        >
                          Why
                        </TableColumnHeader>
                        <TableColumnHeader align="right" className="w-24">Track</TableColumnHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((c) => {
                        const r = c.reason ? REASON[c.reason] : null;
                        return (
                          <TableRow key={c.norm}>
                            <TableCell className="max-w-[260px]">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-medium" title={c.keyword}>{c.keyword}</span>
                                {c.brand && <Badge variant="neutral">brand</Badge>}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {c.country_code} · {c.language_code}
                                {c.variant_count > 1 ? (
                                  <span title={c.variants.join('\n')}> · {c.variant_count} spellings folded</span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.impressions}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.clicks || '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.position != null ? c.position : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.days_seen}</TableCell>
                            <TableCell>
                              <Badge variant={r ? r.tone : 'neutral'} title={r ? r.explain : WATCHING.explain}>
                                {r ? r.label : WATCHING.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  disabled={!!busy}
                                  onClick={() => void track([c.keyword])}
                                  aria-label={`Track ${c.keyword}`}
                                  title="Track this keyword"
                                >
                                  {busy === c.keyword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />}
                                </Button>
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
                                  disabled={!!busy}
                                  onClick={() => void dismiss(c.keyword)}
                                  aria-label={`Never offer ${c.keyword} again`}
                                  title="Never offer this again"
                                >
                                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                </Table>
                {sorted.length === 0 && (
                  <HubEmptyState
                    variant="filtered"
                    title="Nothing matches those filters"
                    description="The queries are still there — the search box or the verdict filter is excluding them."
                    action={
                      <Button size="sm" variant="outline" onClick={() => { setSearch(''); setReasons([]); }}>
                        Clear filters
                      </Button>
                    }
                  />
                )}
                <TablePagination page={currentPage} total={sorted.length} onPageChange={setPage} label="queries" />
              </div>
            )}

            {rows.length === 0 && !filtering && (
              <HubEmptyState
                variant="empty"
                title="Nothing new to offer"
                description={
                  counts.queries > 0
                    ? 'Every query Search Console reported in this window is already tracked, dismissed, or not a query at all.'
                    : 'Search Console has not reported any queries for this site in this window.'
                }
              />
            )}

            {counts.dismissed > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDismissed((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showDismissed ? 'Hide' : 'Show'} {counts.dismissed} dismissed
                </button>
                {showDismissed && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.dismissed_list.map((d) => (
                      <button
                        key={d.norm}
                        type="button"
                        disabled={!!busy}
                        onClick={() => void dismiss(d.keyword, true)}
                        title="Offer this again"
                        className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-surface-sunken px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Undo2 className="h-3 w-3" aria-hidden="true" />
                        {d.keyword}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

function Figure({ value, label, tone }: { value: number; label: string; tone?: 'primary' }) {
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

export default KeywordDiscoveryCard;
