import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { userWebsitesService, type SeoResearchRunRow, type UserWebsite } from '@/services/userWebsitesService';
import { Loading, useLaunchQuickStart } from './seo/dashboardPrimitives';

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
        const r = await userWebsitesService.toolkitRuns(website.id);
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Ran</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
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
          )}
        </CardContent>
      </Card>
  );
};

export default WebsiteToolkitRunsPanel;
