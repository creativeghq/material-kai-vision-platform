import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { HubEmptyState } from '@/components/core/hub';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/utils/decimal';
import { KeywordActions } from './KeywordActions';

export type GscLens = 'all' | 'striking' | 'rising' | 'falling';

export const GSC_LENS_LABELS: Record<GscLens, string> = {
  all: 'All queries',
  striking: 'Striking distance (8–20)',
  rising: 'Rising',
  falling: 'Falling',
};

interface LensRow { query: string; impressions: number; clicks: number; position?: number; position_now?: number; position_before?: number; delta?: number }

/** The queries view, narrowed to a question: almost on page one, or moving. Each row carries the keyword actions. */
export const GscQueryLens: React.FC<{ websiteId: string; days: number; lens: Exclude<GscLens, 'all'> }> = ({ websiteId, days, lens }) => {
  const [rows, setRows] = useState<LensRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const fn = lens === 'striking' ? 'get_gsc_striking_distance' : 'get_gsc_movers';
    void supabase.rpc(fn as never, { p_website_id: websiteId, p_days: days, p_limit: 100 } as never).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) { setError(e.message); setRows([]); return; }
      let items = (((data as { items?: LensRow[] } | null)?.items) ?? []);
      if (lens === 'rising') items = items.filter((r) => (r.delta ?? 0) > 0);
      if (lens === 'falling') items = items.filter((r) => (r.delta ?? 0) < 0);
      setRows(items);
    });
    return () => { cancelled = true; };
  }, [websiteId, days, lens]);

  if (rows == null) return <Loader2 className="m-4 h-4 w-4 animate-spin text-muted-foreground" />;
  if (error) return <p className="p-4 text-sm text-muted-foreground">Could not read Search Console: {error}</p>;
  if (!rows.length) {
    return (
      <HubEmptyState variant="filtered" title="No query fits"
        description={lens === 'striking'
          ? 'No query averages position 8 to 20 with at least 20 impressions in this window.'
          : `No query moved ${lens === 'rising' ? 'up' : 'down'} by a position or more against the previous window.`} />
    );
  }
  return (
    <div className="table-scroll">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Query</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">{lens === 'striking' ? 'Pos.' : 'Pos. now / before'}</TableHead>
            <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.query}>
              <TableCell className="max-w-[340px] truncate font-medium">{r.query}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.impressions)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(r.clicks)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {lens === 'striking' ? (r.position ?? '—') : `${r.position_now ?? '—'} / ${r.position_before ?? '—'}`}
              </TableCell>
              <TableCell><KeywordActions className="justify-end" websiteId={websiteId} keyword={r.query} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
