import React, { useEffect, useState } from 'react';
import { ExternalLink, SearchX } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TableColumnHeader } from '@/components/core/ui/table-column-header';
import { HubEmptyState, HubResetFilters, HubToolbar } from '@/components/core/hub';
import { userWebsitesService, type DomainKeyword, type UserWebsite } from '@/services/userWebsitesService';
import { formatNumber } from '@/utils/decimal';
import { useTableSegments } from './useTableSegments';

type KwSortKey = 'keyword' | 'position' | 'volume' | 'etv' | 'page';
const POSITION_BANDS: { key: string; label: string; max: number }[] = [
  { key: '1', label: '#1', max: 1 },
  { key: '2_3', label: '2–3', max: 3 },
  { key: '4_10', label: '4–10', max: 10 },
  { key: '11_20', label: '11–20', max: 20 },
  { key: '21_50', label: '21–50', max: 50 },
  { key: '51_100', label: '51–100', max: 100 },
];
const POSITION_LABELS = Object.fromEntries(POSITION_BANDS.map((b) => [b.key, b.label]));
const POSITION_ORDER = POSITION_BANDS.map((b) => b.key);
const positionBandOf = (k: DomainKeyword): string | null =>
  k.position == null ? null : (POSITION_BANDS.find((b) => k.position! <= b.max)?.key ?? null);
const fmt = (n: number | null | undefined) => (n == null ? '—' : formatNumber(Math.round(n)));

/** What the domain ranks for in the index's top 100 — discovery, not the tracked set. */
export const DomainRankingKeywordsCard: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const [kws, setKws] = useState<DomainKeyword[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    userWebsitesService.domainTopKeywords(website.id)
      .then((rows) => { if (live) setKws(rows); })
      .catch((e: unknown) => { if (live) { setKws([]); setLoadError(e instanceof Error ? e.message : 'unknown error'); } });
    return () => { live = false; };
  }, [website.id]);

  const t = useTableSegments<DomainKeyword, KwSortKey, 'position' | 'page'>({
    rows: kws,
    searchText: (k) => [k.keyword, k.url],
    sorters: {
      keyword: (k) => k.keyword,
      position: (k) => k.position,
      volume: (k) => k.search_volume,
      etv: (k) => k.etv,
      page: (k) => k.url,
    },
    initialSort: { key: 'position', dir: 'asc' },
    textKeys: ['keyword', 'page'],
    facets: {
      position: { label: 'position', valueOf: positionBandOf, labels: POSITION_LABELS, order: POSITION_ORDER },
      page: { label: 'page', valueOf: (k) => k.url },
    },
  });

  if (loadError) {
    return (
      <Card className="dashboard-card">
        <CardContent className="py-4 text-xs text-amber-800 dark:text-amber-300">
          Could not load the top ranking keywords: {loadError}
        </CardContent>
      </Card>
    );
  }
  // An empty set is already explained by the Ranking profile above, from the collector's verdict.
  if (kws.length === 0) return null;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base">Top ranking keywords</CardTitle>
        <CardDescription>What the domain ranks for right now: the {kws.length} best-positioned keywords. Search and filters apply to these only.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <HubToolbar
          search={t.query}
          onSearchChange={t.setQuery}
          searchPlaceholder="Search keyword or page"
          actions={<HubResetFilters count={t.activeCount} onReset={t.clear} />}
        />
        {t.visible.length === 0 ? (
          <HubEmptyState
            variant="filtered"
            icon={SearchX}
            title="No keywords match these filters"
            description={`All ${kws.length} keywords are still here; the search or a column filter is hiding them.`}
            action={<Button size="sm" variant="outline" onClick={t.clear}>Clear filters</Button>}
          />
        ) : (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableColumnHeader sortKey="keyword" sort={t.sort} onSort={t.onSort}>Keyword</TableColumnHeader>
                  <TableColumnHeader sortKey="position" sort={t.sort} onSort={t.onSort} segment={t.segment('position')} align="right">Pos.</TableColumnHeader>
                  <TableColumnHeader sortKey="volume" sort={t.sort} onSort={t.onSort} align="right">Volume</TableColumnHeader>
                  <TableColumnHeader sortKey="etv" sort={t.sort} onSort={t.onSort} align="right">Est. traffic</TableColumnHeader>
                  <TableColumnHeader sortKey="page" sort={t.sort} onSort={t.onSort} segment={t.segment('page')}>Page</TableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.visible.map((k) => (
                  <TableRow key={`${k.keyword}|${k.url ?? ''}`}>
                    <TableCell className="font-medium max-w-[240px] truncate">{k.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums">{k.position ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(k.search_volume)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(k.etv)}</TableCell>
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
        )}
      </CardContent>
    </Card>
  );
};
