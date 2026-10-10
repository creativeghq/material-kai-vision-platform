import React, { useEffect, useState } from 'react';
import { ExternalLink, Link2, Loader2, RefreshCw, SearchX } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TableColumnHeader } from '@/components/core/ui/table-column-header';
import { HubEmptyState, HubResetFilters, HubToolbar } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService, type UserWebsite, type DomainIntel, type DomainBacklink } from '@/services/userWebsitesService';
import { formatNumber } from '@/utils/decimal';
import { timeAgo } from '@/utils/datetime';
import { safeHref } from '@/utils/safeUrl';
import { sourceStatusPresentation } from '@/components/core/Profile/seo/seoMetrics';
import { useTableSegments } from './seo/useTableSegments';

type LinkSortKey = 'domain' | 'rank' | 'anchor' | 'first_seen';
const fmt = (n: number | null | undefined) => (n == null ? '—' : formatNumber(Math.round(n)));

const LINK_TYPE_LABELS: Record<string, string> = { dofollow: 'Follow', nofollow: 'Nofollow' };
const STATE_LABELS: Record<string, string> = { new: 'New', live: 'Live', lost: 'Lost', broken: 'Broken' };
const STATE_ORDER = ['new', 'live', 'lost', 'broken'];
const stateOf = (b: DomainBacklink): string =>
  b.is_broken ? 'broken' : b.is_lost ? 'lost' : b.is_new ? 'new' : 'live';

/** A snapshot is one row per DAY (upserted), so its age is only known to the day. */
function dayLabel(date: string): string {
  const d = Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000);
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

/** A missing figure says WHY it is missing (CLAUDE.md rule 3). */
function Figure({ label, value, status }: { label: string; value: number | null | undefined; status: string | null }) {
  const p = value == null ? sourceStatusPresentation(status) : null;
  return (
    <div className="border border-hairline rounded-sm p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {value != null ? fmt(value) : p ? (
          <span className={`text-base font-medium ${p.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`} title={p.explain}>
            {p.placeholder}
          </span>
        ) : '—'}
      </p>
    </div>
  );
}

/** Websites → Backlinks: who links to the site, and the index's verdict on its authority. */
export const WebsiteDomainIntelPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [intel, setIntel] = useState<DomainIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setIntel(await userWebsitesService.domainIntel(website.id, 180)); }
    catch (e: any) { toast({ title: 'Could not load backlinks', description: e.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [website.id]);

  const run = async () => {
    setRunning(true);
    try { await userWebsitesService.domainTrackRun(website.id); toast({ title: 'Backlinks refreshed' }); load(); }
    catch (e: any) { toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' }); }
    finally { setRunning(false); }
  };

  const links = intel?.backlinks ?? [];
  const t = useTableSegments<DomainBacklink, LinkSortKey, 'type' | 'state'>({
    rows: links,
    searchText: (b) => [b.domain_from, b.url_from, b.anchor, b.url_to],
    sorters: {
      domain: (b) => b.domain_from,
      rank: (b) => b.domain_from_rank,
      anchor: (b) => b.anchor,
      first_seen: (b) => (b.first_seen ? new Date(b.first_seen).getTime() : null),
    },
    initialSort: { key: 'rank', dir: 'desc' },
    textKeys: ['domain', 'anchor'],
    facets: {
      type: { label: 'link type', valueOf: (b) => (b.dofollow == null ? null : b.dofollow ? 'dofollow' : 'nofollow'), labels: LINK_TYPE_LABELS },
      state: { label: 'state', valueOf: stateOf, labels: STATE_LABELS, order: STATE_ORDER },
    },
  });

  if (loading) {
    return <Card className="dashboard-card"><CardContent className="flex items-center justify-center py-14"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const s = intel?.latest;
  const blStatus = s?.source_status?.backlinks ? String(s.source_status.backlinks) : null;
  const listStatus = s?.source_status?.backlink_list ? String(s.source_status.backlink_list) : null;
  const listFailed = listStatus === 'failed';
  const domain = website.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Link2 className="w-4 h-4 text-primary" />Backlinks</CardTitle>
            <CardDescription>
              Links from other sites to {domain}, from DataForSEO&apos;s backlink index
              {s ? <> · captured {dayLabel(s.captured_at)}</> : null}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {s ? 'Refresh' : 'Snapshot now'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!s ? (
            <HubEmptyState
              variant="empty"
              title="No backlink snapshot yet"
              description="The weekly tracker fills this in, or take one now."
              action={<Button size="sm" onClick={run} disabled={running}>Snapshot now</Button>}
            />
          ) : (
            <>
              {s.error && <div className="text-xs text-[hsl(var(--error))]">{s.error}</div>}
              {blStatus === 'failed' && s.source_errors?.backlinks && (
                <div className="text-xs text-amber-800 dark:text-amber-300">The backlink source failed: {s.source_errors.backlinks}</div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Figure label="Backlinks" value={s.backlinks} status={blStatus} />
                <Figure label="Referring domains" value={s.referring_domains} status={blStatus} />
                <Figure label="Referring main domains" value={s.referring_main_domains} status={blStatus} />
                <Figure label="Domain rank" value={s.domain_rank} status={blStatus} />
                <Figure label="Spam score" value={s.spam_score} status={blStatus} />
                <Figure label="Broken backlinks" value={s.broken_backlinks} status={blStatus} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {s && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Referring domains</CardTitle>
            <CardDescription>One link per linking site, strongest site first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {links.length === 0 ? (
              <HubEmptyState
                variant="empty"
                icon={Link2}
                title={listFailed ? 'Could not fetch the backlink list' : listStatus ? 'No site links here yet' : 'Not collected yet'}
                description={
                  listFailed
                    ? `${s.source_errors?.backlink_list ?? 'The source failed.'} Unknown, not zero — refresh to try again.`
                    : listStatus
                      ? `DataForSEO's index has no link to ${domain}. That is normal for a young site; links from suppliers, directories and press are the usual first ones.`
                      : 'The list is collected with the next snapshot.'
                }
                action={<Button size="sm" variant="outline" onClick={run} disabled={running}>Refresh</Button>}
              />
            ) : (
              <>
                {listFailed && (
                  <div className="mx-4 my-2 text-xs text-amber-800 dark:text-amber-300">
                    The latest refresh failed ({s.source_errors?.backlink_list ?? 'source error'}), so this is the list from{' '}
                    {links[0]?.captured_at ? dayLabel(links[0].captured_at) : 'an earlier capture'}, not today&apos;s.
                  </div>
                )}
                <HubToolbar
                  search={t.query}
                  onSearchChange={t.setQuery}
                  searchPlaceholder="Search site, anchor or page"
                  actions={<HubResetFilters count={t.activeCount} onReset={t.clear} />}
                />
                {t.visible.length === 0 ? (
                  <HubEmptyState
                    variant="filtered"
                    icon={SearchX}
                    title="No links match these filters"
                    description={`All ${links.length} are still here; the search or a column filter is hiding them.`}
                    action={<Button size="sm" variant="outline" onClick={t.clear}>Clear filters</Button>}
                  />
                ) : (
                  <div className="table-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableColumnHeader sortKey="domain" sort={t.sort} onSort={t.onSort} segment={t.segment('state')}>Linking site</TableColumnHeader>
                          <TableColumnHeader sortKey="rank" sort={t.sort} onSort={t.onSort} align="right">Site rank</TableColumnHeader>
                          <TableColumnHeader sortKey="anchor" sort={t.sort} onSort={t.onSort} segment={t.segment('type')}>Anchor</TableColumnHeader>
                          <TableColumnHeader>Links to</TableColumnHeader>
                          <TableColumnHeader sortKey="first_seen" sort={t.sort} onSort={t.onSort} align="right">First seen</TableColumnHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.visible.map((b) => {
                          const st = stateOf(b);
                          return (
                            <TableRow key={b.url_from}>
                              <TableCell className="max-w-[260px]">
                                <a href={safeHref(b.url_from)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                                  <span className="truncate">{b.domain_from ?? b.url_from}</span><ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                                {st !== 'live' && <Badge variant={st === 'new' ? 'success' : 'warning'} className="ml-1.5">{STATE_LABELS[st]}</Badge>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(b.domain_from_rank)}</TableCell>
                              <TableCell className="max-w-[220px]">
                                <span className="truncate block text-xs">{b.anchor || '—'}</span>
                                {b.dofollow === false && <span className="text-[11px] text-muted-foreground">nofollow</span>}
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                                {b.url_to ? b.url_to.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{b.first_seen ? timeAgo(b.first_seen) : '—'}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebsiteDomainIntelPanel;
