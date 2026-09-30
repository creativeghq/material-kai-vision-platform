/** Catalog operations tab — embedded inside /admin/operations. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import {
  Activity, BookOpen, Eye, FileDown, Loader2, Mail, RefreshCw, ShieldAlert,
  ExternalLink, User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { catalogPublicPath } from '@/config/catalogPublicUrl';
import { Card, CardContent } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { FilterBar, applyFilters, type FilterValues } from '@/components/core/filters';
import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubCellEmpty, HubCellLink, HubSortButton, useHubTable, type HubTableField } from '@/components/core/hub';
import { labelizeValue, statusBadgeVariant } from '@/utils/recordDisplay';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  catalogsService,
  type CatalogOperationsSummary,
  type CatalogViewEventRow,
  type CatalogAccessLogRow,
} from '@/services/catalogsService';
import { buildCatalogOperationsFilters } from './catalogOperationsFilters';
import { formatDate, toLocalISODate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';

/** Preserves the tab's previous default window now that the range Select is a dateRange field. */
const SUMMARY_FIELDS: HubTableField<CatalogOperationsSummary>[] = [
  { id: 'title', sortValue: (s) => s.title },
  { id: 'status', sortValue: (s) => s.status },
  { id: 'views', sortValue: (s) => s.page_views },
  { id: 'downloads', sortValue: (s) => s.pdf_downloads },
  { id: 'denials', sortValue: (s) => s.gate_denials },
  { id: 'emails', sortValue: (s) => s.unique_email_count },
  { id: 'last', sortValue: (s) => s.last_event_at },
];

function defaultFilterValues(): FilterValues {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { created_at: { from: toLocalISODate(from) } };
}

export const CatalogOperationsTab: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [summary, setSummary] = useState<CatalogOperationsSummary[]>([]);
  const [events, setEvents] = useState<CatalogViewEventRow[]>([]);
  const [gateLog, setGateLog] = useState<Array<CatalogAccessLogRow & { catalog_title?: string | null; catalog_slug?: string | null; matched_user_id: string | null }>>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = useState(true);

  // Server-side surface: the values bag is held locally and turned into query params,
  // rather than going through useFilters (which only knows how to match in memory).
  const [filterValues, setFilterValues] = useState<FilterValues>(defaultFilterValues);

  const selectedCatalogId = (filterValues.catalog_id as string) || 'all';
  const eventFilter = (filterValues.event_type as string) || 'all';
  const emailContains = (filterValues.q as string) || '';
  const dateFrom = (filterValues.created_at as { from?: string } | undefined)?.from;

  const sinceIso = useMemo(
    () => (dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined),
    [dateFrom],
  );

  const load = useCallback(async () => {
    setLoading(true);
    // Resilient load: each analytics source is independent, so one failing query
    // (e.g. a permission hiccup on the events table) degrades that section only
    // instead of blanking the whole tab. A single failing source shows a toast but
    // the rest still render.
    const [sRes, eRes, gRes] = await Promise.allSettled([
      catalogsService.listOperationsSummary(),
      catalogsService.listViewEvents({
        catalogId: selectedCatalogId === 'all' ? undefined : selectedCatalogId,
        eventType: eventFilter as 'all' | 'page_view' | 'pdf_download',
        emailContains: emailContains.trim() || undefined,
        sinceIso,
        limit: 200,
      }),
      catalogsService.listAccessLogCrossCatalog({
        catalogId: selectedCatalogId === 'all' ? undefined : selectedCatalogId,
        emailContains: emailContains.trim() || undefined,
        sinceIso,
        limit: 200,
      }),
    ]);

    const s = sRes.status === 'fulfilled' ? sRes.value : [];
    const e = eRes.status === 'fulfilled' ? eRes.value : [];
    const g = gRes.status === 'fulfilled' ? gRes.value : [];
    setSummary(s);
    setEvents(e);
    setGateLog(g);

    const failed = [sRes, eRes, gRes].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length > 0) {
      toast({
        title: 'Some analytics could not load',
        description: failed[0]?.reason instanceof Error ? failed[0].reason.message : String(failed[0]?.reason ?? 'Unknown error'),
        variant: 'destructive',
      });
    }

    try {
      const userIds = Array.from(new Set([
        ...e.map((row) => row.matched_user_id).filter(Boolean) as string[],
        ...g.map((row) => row.matched_user_id).filter(Boolean) as string[],
      ]));
      if (userIds.length > 0) {
        const map = await catalogsService.getUserProfilesByIds(userIds);
        setProfiles(map);
      }
    } catch { /* profile enrichment is best-effort */ }

    setLoading(false);
  }, [selectedCatalogId, eventFilter, emailContains, sinceIso, toast]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => summary.reduce((acc, s) => ({
    catalogs: acc.catalogs + 1,
    published: acc.published + (s.status === 'published' ? 1 : 0),
    page_views: acc.page_views + (s.page_views || 0),
    pdf_downloads: acc.pdf_downloads + (s.pdf_downloads || 0),
    gate_attempts: acc.gate_attempts + (s.gate_attempts || 0),
    gate_denials: acc.gate_denials + (s.gate_denials || 0),
    unique_emails: acc.unique_emails + (s.unique_email_count || 0),
  }), { catalogs: 0, published: 0, page_views: 0, pdf_downloads: 0, gate_attempts: 0, gate_denials: 0, unique_emails: 0 }), [summary]);

  const filterGroups = useMemo(
    () => buildCatalogOperationsFilters(summary, [...events, ...gateLog]),
    [summary, events, gateLog],
  );
  // The By-catalog rollup is deliberately NOT narrowed — it is the cross-catalog summary,
  // and the catalog select already scopes it server-side.
  const visibleEvents = useMemo(() => applyFilters(events, filterGroups, filterValues), [events, filterGroups, filterValues]);
  const visibleGateLog = useMemo(() => applyFilters(gateLog, filterGroups, filterValues), [gateLog, filterGroups, filterValues]);
  const summaryTable = useHubTable(summary, SUMMARY_FIELDS);
  const sortHead = (id: string, label: string, align?: 'right', className?: string) => {
    const active = summaryTable.sort?.columnId === id ? summaryTable.sort.direction : undefined;
    return (
      <TableHead
        className={cn(align === 'right' && 'text-right', className)}
        aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        <HubSortButton active={active} align={align} onClick={() => summaryTable.toggleSort(id)}>{label}</HubSortButton>
      </TableHead>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Email-gated catalog access events, page views, and PDF downloads.
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/catalogs')}>
            <BookOpen className="mr-2 h-4 w-4" /> Open catalogs
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat icon={BookOpen} label="Catalogs" value={totals.catalogs} sub={`${totals.published} published`} />
        <Stat icon={Mail} label="Unique emails" value={totals.unique_emails} />
        <Stat icon={Eye} label="Page views" value={totals.page_views} />
        <Stat icon={FileDown} label="Downloads" value={totals.pdf_downloads} />
        <Stat icon={Activity} label="Gate attempts" value={totals.gate_attempts} />
        <Stat icon={ShieldAlert} label="Denied" value={totals.gate_denials} variant={totals.gate_denials > 0 ? 'destructive' : 'default'} />
      </div>

      <FilterBar
        groups={filterGroups}
        values={filterValues}
        onChange={setFilterValues}
        title="Filter catalog activity"
        searchPlaceholder="Search by email…"
      />

      <Tabs defaultValue="catalogs">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="catalogs" className="flex items-center gap-2">By Catalog ({summary.length})</TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">Events ({visibleEvents.length})</TabsTrigger>
          <TabsTrigger value="gate" className="flex items-center gap-2">Email-Gate ({visibleGateLog.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogs" className="mt-4">
          {loading ? <LoadingRow /> : summary.length === 0 ? (
            <Empty>No catalogs yet.</Empty>
          ) : (
            <Card className="dashboard-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sortHead('title', 'Catalog')}
                      {sortHead('status', 'Status')}
                      {sortHead('views', 'Views', 'right')}
                      {sortHead('downloads', 'Downloads', 'right', 'hidden md:table-cell')}
                      <TableHead className="hidden lg:table-cell text-right">Gate (granted/denied)</TableHead>
                      {sortHead('emails', 'Unique emails', 'right', 'hidden md:table-cell')}
                      {sortHead('last', 'Last activity', undefined, 'hidden sm:table-cell')}
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryTable.rows.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <HubCellLink to={`/catalogs/${s.id}`} className="block max-w-[18rem] truncate">
                            <span title={s.title}>{s.title}</span>
                          </HubCellLink>
                          {catalogPublicPath(s.public_handle ?? null, s.slug) && (
                            <div className="max-w-[18rem] truncate text-xs text-muted-foreground" title={catalogPublicPath(s.public_handle ?? null, s.slug)!}>
                              {catalogPublicPath(s.public_handle ?? null, s.slug)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={statusBadgeVariant(s.status)}>{labelizeValue(s.status)}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(s.page_views)}</TableCell>
                        <TableCell className="hidden md:table-cell text-right tabular-nums">{formatNumber(s.pdf_downloads)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-right tabular-nums">{s.gate_grants} / <span className={s.gate_denials > 0 ? 'text-destructive' : ''}>{s.gate_denials}</span></TableCell>
                        <TableCell className="hidden md:table-cell text-right tabular-nums">{formatNumber(s.unique_email_count)}</TableCell>
                        <TableCell className="hidden sm:table-cell whitespace-nowrap text-xs text-muted-foreground">{s.last_event_at ? formatDate(s.last_event_at, { withTime: true }) : <HubCellEmpty />}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/catalogs/${s.id}`)}>Open</Button>
                            {catalogPublicPath(s.public_handle ?? null, s.slug) && (
                              <Button size="sm" variant="ghost" aria-label="Open public catalog" onClick={() => window.open(catalogPublicPath(s.public_handle ?? null, s.slug)!, '_blank')}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {loading ? <LoadingRow /> : visibleEvents.length === 0 ? (
            <Empty>No events for this filter set.</Empty>
          ) : (
            <Card className="dashboard-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="hidden md:table-cell">Matched as</TableHead>
                      <TableHead>Catalog</TableHead>
                      <TableHead className="hidden lg:table-cell">User profile</TableHead>
                      <TableHead className="hidden lg:table-cell">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEvents.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(e.created_at, { withTime: true })}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center whitespace-nowrap text-xs text-muted-foreground capitalize">
                            {e.event_type === 'pdf_download' ? <FileDown className="h-3 w-3 mr-1 inline" /> : <Eye className="h-3 w-3 mr-1 inline" />}
                            {(e.event_type ?? 'event').replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium break-all">{e.email || <HubCellEmpty />}</TableCell>
                        <TableCell className="hidden md:table-cell"><span className="text-xs text-muted-foreground capitalize">{e.matched_kind || <HubCellEmpty />}</span></TableCell>
                        <TableCell className="text-xs">
                          <HubCellLink to={`/catalogs/${e.catalog_id}`} className="block max-w-[14rem] truncate">
                            <span title={e.catalog_title ?? undefined}>{e.catalog_title || e.catalog_id.slice(0, 8)}</span>
                          </HubCellLink>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          {e.matched_user_id && profiles[e.matched_user_id] ? (
                            <span className="flex items-center gap-1.5">
                              <UserAvatar
                                userId={e.matched_user_id}
                                name={profiles[e.matched_user_id].full_name || profiles[e.matched_user_id].email}
                                avatarUrl={profiles[e.matched_user_id].avatar_url}
                                className="h-5 w-5"
                                fallbackClassName="text-[9px]"
                                fallback={<UserIcon className="h-3 w-3" />}
                              />
                              {profiles[e.matched_user_id].full_name || profiles[e.matched_user_id].email}
                            </span>
                          ) : <HubCellEmpty />}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{e.ip_address || <HubCellEmpty />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="gate" className="mt-4">
          {loading ? <LoadingRow /> : visibleGateLog.length === 0 ? (
            <Empty>No gate attempts for this filter set.</Empty>
          ) : (
            <Card className="dashboard-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Granted</TableHead>
                      <TableHead className="hidden md:table-cell">Matched as</TableHead>
                      <TableHead>Catalog</TableHead>
                      <TableHead className="hidden lg:table-cell">User profile</TableHead>
                      <TableHead className="hidden lg:table-cell">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleGateLog.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(row.created_at, { withTime: true })}</TableCell>
                        <TableCell className="font-medium break-all">{row.email}</TableCell>
                        <TableCell>
                          <Badge variant={row.granted_access ? 'success' : 'error'}>{row.granted_access ? 'Granted' : 'Denied'}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell"><span className="text-xs text-muted-foreground capitalize">{row.matched_kind}</span></TableCell>
                        <TableCell className="text-xs">
                          <HubCellLink to={`/catalogs/${row.catalog_id}`} className="block max-w-[14rem] truncate">
                            <span title={row.catalog_title ?? undefined}>{row.catalog_title || row.catalog_id.slice(0, 8)}</span>
                          </HubCellLink>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          {row.matched_user_id && profiles[row.matched_user_id] ? (
                            <span className="flex items-center gap-1.5">
                              <UserAvatar
                                userId={row.matched_user_id}
                                name={profiles[row.matched_user_id].full_name || profiles[row.matched_user_id].email}
                                avatarUrl={profiles[row.matched_user_id].avatar_url}
                                className="h-5 w-5"
                                fallbackClassName="text-[9px]"
                                fallback={<UserIcon className="h-3 w-3" />}
                              />
                              {profiles[row.matched_user_id].full_name || profiles[row.matched_user_id].email}
                            </span>
                          ) : <HubCellEmpty />}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{row.ip_address || <HubCellEmpty />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Stat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
  variant?: 'default' | 'destructive';
}> = ({ icon: Icon, label, value, sub, variant }) => (
  <Card className="dashboard-card">
    <CardContent className="p-3 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`text-2xl font-light ${variant === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{formatNumber(value)}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </CardContent>
  </Card>
);

const LoadingRow: React.FC = () => (
  <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

const Empty: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Card><CardContent className="p-12 text-center text-muted-foreground">{children}</CardContent></Card>
);
