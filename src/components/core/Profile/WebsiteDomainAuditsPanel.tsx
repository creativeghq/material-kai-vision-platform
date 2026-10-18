import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { userWebsitesService, type UserWebsite, type WebsiteDomainHistoryRow } from '@/services/userWebsitesService';
import { Loading } from './seo/dashboardPrimitives';

const SOURCE_LABEL: Record<string, string> = { domain_tracker: 'Snapshot', toolkit_audit: 'Earlier audit' };

/** Websites → Authority → history: the own domain's one series, newest first. */
export const WebsiteDomainAuditsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<WebsiteDomainHistoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await userWebsitesService.domainHistory(website.id)); }
    catch (e: any) { toast({ title: 'Could not load the history', description: e?.message, variant: 'destructive' }); setRows([]); }
  }, [website.id, toast]);
  useEffect(() => { void load(); }, [load]);

  const collect = async () => {
    setBusy(true);
    try {
      await userWebsitesService.domainTrackRun(website.id);
      toast({ title: 'Snapshot taken' });
      await load();
    } catch (e: any) {
      toast({ title: 'Snapshot failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const button = (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void collect()}>
      {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Take a snapshot now
    </Button>
  );

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Domain history</CardTitle>
          <CardDescription>
            Rank, keywords, traffic and backlinks for this website's own domain, one row per snapshot. Snapshots run on
            the schedule set under Reports → Schedules; a manual snapshot is charged like any lookup.
          </CardDescription>
        </div>
        {rows && rows.length > 0 && button}
      </CardHeader>
      <CardContent className="p-0">
        {rows == null ? <Loading /> : rows.length === 0 ? (
          <HubEmptyState variant="empty" icon={History} title="No snapshot yet"
            description="Take one now, or turn on domain tracking under Reports → Schedules so it runs on its own." action={button} />
        ) : (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Captured</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead className="text-right">Keywords</TableHead>
                  <TableHead className="text-right">Traffic</TableHead>
                  <TableHead className="text-right">Ref. domains</TableHead>
                  <TableHead className="text-right">Backlinks</TableHead>
                  <TableHead className="text-right">Spam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((h, i) => (
                  <TableRow key={`${h.source}-${h.captured_at}-${i}`}>
                    <TableCell className="text-muted-foreground">{formatDate(h.captured_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {SOURCE_LABEL[h.source] ?? h.source}{h.error ? <span className="ml-1 text-amber-700 dark:text-amber-300">· {h.error}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.domain_rank ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.ranking_keywords == null ? '—' : formatNumber(h.ranking_keywords)}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.organic_traffic == null ? '—' : formatNumber(h.organic_traffic)}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.referring_domains == null ? '—' : formatNumber(h.referring_domains)}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.backlinks == null ? '—' : formatNumber(h.backlinks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.spam_score ?? '—'}</TableCell>
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

export default WebsiteDomainAuditsPanel;
