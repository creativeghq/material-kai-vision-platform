/**
 * What is late (#432), and who has quietly stopped buying (#434).
 *
 * The value in a line timeline is in what is overdue, so the queue is grouped by urgency rather
 * than listed. A line with no date sits in its own bucket: nothing can be late if nothing was
 * promised, and sorting it to the bottom of "later" makes it read as comfortable.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CalendarClock, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  orderLineService, BUCKET_LABEL, LINE_STATUS_LABEL, lineIsUndated,
  type WorkQueue, type QueueBucket, type SpendDecline, type LostSale,
} from '@/modules/finance/services/orderLineService';

const ORDER: QueueBucket[] = ['overdue', 'today', 'this_week', 'next_week', 'undated', 'later'];

export const LineWorkQueueCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [decline, setDecline] = useState<SpendDecline[]>([]);
  const [lost, setLost] = useState<LostSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [q, d, l] = await Promise.all([
        orderLineService.workQueue(workspaceId),
        orderLineService.spendDecline(workspaceId).catch(() => [] as SpendDecline[]),
        orderLineService.listLostSales(workspaceId).catch(() => [] as LostSale[]),
      ]);
      setQueue(q); setDecline(d); setLost(l); setFailed(false);
    } catch {
      setQueue(null); setDecline([]); setLost([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const rows = queue?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" /> What is late
        </CardTitle>
        <CardDescription>
          Open order lines by how late they are. A line with no promised date is its own bucket —
          nothing can be late if nothing was promised.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the queue…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The work queue could not be read just now. That is not a statement that nothing is late.
          </p>
        )}

        {!loading && !failed && queue && (
          <p className="text-xs text-muted-foreground">{queue.reason}</p>
        )}

        {!loading && !failed && queue?.status === 'nothing_open' && (
          <HubEmptyState
            title="Nothing open"
            description="Every line is installed, cancelled or marked complete."
          />
        )}

        {rows.length > 0 && ORDER.map((bucket) => {
          const inBucket = rows.filter((r) => r.bucket === bucket);
          if (inBucket.length === 0) return null;
          return (
            <div key={bucket} className="space-y-1">
              <p className="text-xs font-medium">
                {BUCKET_LABEL[bucket]}
                <span className="ml-2 text-muted-foreground tabular-nums">{inBucket.length}</span>
              </p>
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inBucket.map((r) => (
                      <TableRow key={r.order_item_id}>
                        <TableCell>{r.description ?? '—'}</TableCell>
                        <TableCell>{r.order_number ?? '—'}</TableCell>
                        <TableCell>
                          {r.line_status
                            ? <Badge variant="neutral">{LINE_STATUS_LABEL[r.line_status]}</Badge>
                            : <span className="text-muted-foreground">not set</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {lineIsUndated(r)
                            ? <span className="text-amber-800 dark:text-amber-300">nothing promised</span>
                            : r.due_on}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}

        {/* Demand we never captured, from the two directions it arrives: a customer who asked
            and left, and a customer who simply stopped. Neither leaves a defective row. */}
        {lost.length > 0 && (
          <div className="space-y-1 rounded-md border border-hairline bg-surface-sunken p-2 text-[11px] text-muted-foreground">
            <p className="font-medium">Asked for and walked away without</p>
            <ul className="space-y-0.5">
              {lost.slice(0, 8).map((l) => (
                <li key={l.id} className="tabular-nums">
                  {l.asked_on} — {l.description}
                  {l.quantity ? ` · ${l.quantity}${l.unit ? ` ${l.unit}` : ''}` : ''}
                  {` · ${l.outcome.replace(/_/g, ' ')}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {decline.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
            <p className="flex items-center gap-1.5 font-medium">
              <TrendingDown className="h-3 w-3" /> Customers whose spend has fallen away
            </p>
            <p>
              A customer who quietly stops buying leaves no defective record anywhere, so nothing
              else here can raise it.
            </p>
            <ul className="space-y-0.5">
              {decline.slice(0, 8).map((d) => (
                <li key={d.company_id} className="tabular-nums">
                  {d.customer_name ?? '—'} — {d.recent_total} against {d.prior_total} the period
                  before{d.last_order_at ? `, last order ${d.last_order_at.slice(0, 10)}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
