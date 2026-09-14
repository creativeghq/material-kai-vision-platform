/**
 * What lots are actually on the shelves (#420).
 *
 * A SKU with one lot is not interesting; a SKU with five is where the trouble is, because an order
 * bigger than any single one of them cannot be filled without mixing — and mixing shows, especially
 * after grouting.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { stockPoolService, type StockPool } from '@/modules/stock/services/stockPoolService';

export const StockPoolsPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [pools, setPools] = useState<StockPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return;
    setLoading(true);
    stockPoolService.poolsForWorkspace(workspaceId)
      .then((p) => { if (!cancelled) { setPools(p); setFailed(false); } })
      .catch(() => { if (!cancelled) { setPools([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const perItem = new Map<string, number>();
  for (const p of pools) perItem.set(p.item_id, (perItem.get(p.item_id) ?? 0) + 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" /> Lots, tones and calibres
        </CardTitle>
        <CardDescription>
          Stock below the SKU. Available is the largest single pool here, never the total — a job
          and its cut allowance come out of one kiln run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the shelves…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The lots could not be read just now. That is not a statement that everything is one lot.
          </p>
        )}

        {!loading && !failed && pools.length === 0 && (
          <HubEmptyState
            title="No lots recorded"
            description="Stock received without a lot, tone or calibre sits outside the cube — it is counted on the SKU and cannot be promised as homogeneous."
          />
        )}

        {pools.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Tone</TableHead>
                  <TableHead>Calibre</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Free</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.item?.name ?? '—'}
                      {(perItem.get(p.item_id) ?? 0) > 1 && (
                        <Badge variant="warning" className="ml-2">
                          {perItem.get(p.item_id)} pools
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.lot_code || '—'}</TableCell>
                    <TableCell className="tabular-nums">{p.tone_code || '—'}</TableCell>
                    <TableCell className="tabular-nums">{p.calibre_code || '—'}</TableCell>
                    <TableCell>{p.grade || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.qty_on_hand}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.qty_on_hand - p.qty_reserved}
                    </TableCell>
                    <TableCell>
                      {p.is_opened_pack && <Badge variant="neutral">opened pack</Badge>}
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
