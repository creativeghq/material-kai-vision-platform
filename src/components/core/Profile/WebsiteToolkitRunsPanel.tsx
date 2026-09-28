import React, { useEffect, useState } from 'react';
import { Plus, SearchX } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TableColumnHeader } from '@/components/core/ui/table-column-header';
import { HubEmptyState, HubResetFilters, HubToolbar } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { userWebsitesService, type SeoResearchRunRow, type UserWebsite } from '@/services/userWebsitesService';
import { Loading, useLaunchQuickStart } from './seo/dashboardPrimitives';
import { AGE_WINDOW_LABELS, AGE_WINDOW_ORDER, ageWindowOf, timeOf, useTableSegments } from './seo/useTableSegments';

const RUN_LIMIT = 500;
type SortKey = 'subject' | 'kind' | 'country' | 'result' | 'ran';
const RESULT_LABELS: Record<string, string> = { success: 'Success', failed: 'Failed' };

/** Websites -> Activity -> Toolkit Runs. */
export const WebsiteToolkitRunsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const launchQuickStart = useLaunchQuickStart();
  const [runs, setRuns] = useState<SeoResearchRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await userWebsitesService.toolkitRuns(website.id, RUN_LIMIT);
        if (!cancelled) setRuns(r);
      } catch (e: any) {
        if (!cancelled) toast({ title: 'Could not load runs', description: e?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  const t = useTableSegments<SeoResearchRunRow, SortKey, 'kind' | 'country' | 'result' | 'ran'>({
    rows: runs,
    searchText: (r) => [r.label, r.subject, r.kind],
    sorters: {
      subject: (r) => r.label || r.subject,
      kind: (r) => r.kind,
      country: (r) => r.country_code,
      result: (r) => (r.success ? 1 : 0),
      ran: (r) => timeOf(r.created_at),
    },
    initialSort: { key: 'ran', dir: 'desc' },
    textKeys: ['subject', 'kind', 'country'],
    facets: {
      kind: { label: 'kind', valueOf: (r) => r.kind },
      country: { label: 'country', valueOf: (r) => r.country_code },
      result: { label: 'result', valueOf: (r) => (r.success ? 'success' : 'failed'), labels: RESULT_LABELS, order: ['success', 'failed'] },
      ran: { label: 'ran', valueOf: (r) => ageWindowOf(r.created_at), labels: AGE_WINDOW_LABELS, order: AGE_WINDOW_ORDER },
    },
  });

  return (
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
          <CardTitle>Toolkit Runs</CardTitle>
          <CardDescription>SEO research + audit passes the agent and toolkit ran for this website.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0"
            onClick={() => launchQuickStart('seo-research', 'Audit a URL')}>
            <Plus className="w-3.5 h-3.5 mr-1" />New run
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <Loading />
          ) : runs.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No toolkit runs yet"
              description="Every audit or research pass the agent runs for this site is filed here so you can re-read it later."
              action={
                <Button size="sm" onClick={() => launchQuickStart('seo-research', 'Audit a URL')}>
                  <Plus className="w-3.5 h-3.5 mr-1" />New run
                </Button>
              }
            />
          ) : (
            <>
              <HubToolbar
                search={t.query}
                onSearchChange={t.setQuery}
                searchPlaceholder="Search runs"
                actions={<HubResetFilters count={t.activeCount} onReset={t.clear} />}
              />
              {t.visible.length === 0 ? (
                <HubEmptyState
                  variant="filtered"
                  icon={SearchX}
                  title="No runs match these filters"
                  description={`All ${runs.length} runs are still here; the search or a column filter is hiding them.`}
                  action={<Button size="sm" variant="outline" onClick={t.clear}>Clear filters</Button>}
                />
              ) : (
                <div className="table-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableColumnHeader sortKey="subject" sort={t.sort} onSort={t.onSort}>Subject</TableColumnHeader>
                        <TableColumnHeader sortKey="kind" sort={t.sort} onSort={t.onSort} segment={t.segment('kind')}>Kind</TableColumnHeader>
                        <TableColumnHeader sortKey="country" sort={t.sort} onSort={t.onSort} segment={t.segment('country')}>Country</TableColumnHeader>
                        <TableColumnHeader sortKey="result" sort={t.sort} onSort={t.onSort} segment={t.segment('result')}>Result</TableColumnHeader>
                        <TableColumnHeader sortKey="ran" sort={t.sort} onSort={t.onSort} segment={t.segment('ran')}>Ran</TableColumnHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {t.visible.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium max-w-[240px] truncate">{r.label || r.subject}</TableCell>
                          <TableCell className="text-muted-foreground">{r.kind}</TableCell>
                          <TableCell className="text-muted-foreground">{r.country_code || '—'}</TableCell>
                          <TableCell className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-[hsl(var(--error))]'}>
                            {r.success ? 'success' : 'failed'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {runs.length >= RUN_LIMIT && (
                <p className="border-t border-hairline px-3 py-2 text-xs text-muted-foreground">
                  Showing the newest {RUN_LIMIT} runs; filters and sorting apply to those only.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
  );
};

export default WebsiteToolkitRunsPanel;
