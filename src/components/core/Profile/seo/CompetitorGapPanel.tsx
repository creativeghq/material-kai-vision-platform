import React, { useEffect, useState } from 'react';
import { Loader2, Swords } from 'lucide-react';

import { HubEmptyState } from '@/components/core/hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/utils/decimal';
import { KeywordActions } from './KeywordActions';

interface GapRow {
  keyword: string | null; competitors: number; best_position: number | null; search_volume: number | null;
  competitor_domains: string[]; status: 'ok' | 'not_connected' | 'not_collected'; note: string | null;
}

/** Competitors → Gap: what the rivals rank for that this site neither ranks for nor tracks. */
export const CompetitorGapPanel: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const [rows, setRows] = useState<GapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc('get_competitor_keyword_gap' as never, { p_website_id: websiteId, p_limit: 200 } as never).then(({ data, error: e }) => {
      if (e) { setError(e.message); setRows([]); return; }
      setRows((data as GapRow[] | null) ?? []);
    });
  }, [websiteId]);

  const reason = rows?.find((r) => r.status !== 'ok');
  const gaps = (rows ?? []).filter((r) => r.status === 'ok' && r.keyword);
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-base">Keyword gap</CardTitle>
        <CardDescription>
          Queries your tracked competitors rank for and this site neither ranks for nor tracks, most shared first.
          Track one, research it, or write the page that answers it.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows == null ? <Loader2 className="m-4 h-4 w-4 animate-spin text-muted-foreground" />
          : error ? <p className="p-4 text-sm text-muted-foreground">Could not read the gap: {error}</p>
          : reason ? <HubEmptyState icon={Swords} title={reason.status === 'not_connected' ? 'No competitors yet' : 'Nothing collected yet'} description={reason.note ?? undefined} />
          : gaps.length === 0 ? <HubEmptyState icon={Swords} title="No gap" description="Every keyword your competitors rank for, this site ranks for or tracks too." />
          : (
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right">Competitors</TableHead>
                    <TableHead className="text-right">Their best</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gaps.map((g) => (
                    <TableRow key={g.keyword!}>
                      <TableCell className="max-w-[320px]">
                        <div className="truncate font-medium">{g.keyword}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{g.competitor_domains.join(', ')}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.competitors}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.best_position ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.search_volume == null ? '—' : formatNumber(g.search_volume)}</TableCell>
                      <TableCell><KeywordActions className="justify-end" websiteId={websiteId} keyword={g.keyword!} /></TableCell>
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
