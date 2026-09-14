/**
 * Who gets the pallet that just landed (#433).
 *
 * Around a third of merchant lines are non-stock specials, so the goods arriving are often already
 * somebody's. Oldest confirmed first — a newer order jumping the queue because somebody opened it
 * first is the unfairness that ordering exists to prevent.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, PackageCheck, Check, Undo2 } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  receptionService, hasClaims, claimsOldestFirst, claimedQuantity,
  type ReceptionReport,
} from '@/modules/stock/services/receptionService';

export const ReceptionReportCard: React.FC<{ purchaseOrderId: string }> = ({ purchaseOrderId }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<ReceptionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await receptionService.report(purchaseOrderId));
      setFailed(false);
    } catch {
      setReport(null); setFailed(true);
    } finally { setLoading(false); }
  }, [purchaseOrderId]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (salesItemId: string, purchaseItemId: string | null) => {
    setBusy(true);
    try {
      const res = await receptionService.assign(
        salesItemId, purchaseItemId,
        purchaseItemId ? undefined : 'unassigned from this receipt',
      );
      toast({ title: res.status === 'linked' ? 'Assigned' : 'Released', description: res.reason });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not change the allocation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking who is waiting for this…
      </div>
    );
  }

  if (failed || !report) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The waiting orders could not be read just now. That is not a statement that nobody is
          waiting for this.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
        <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">{report.reason}</p>
      </div>

      {hasClaims(report) && (report.allocation ?? []).map((line) => {
        const claims = claimsOldestFirst(line);
        if (claims.length === 0) return null;
        return (
          <div key={line.purchase_item_id} className="space-y-1">
            <p className="text-xs font-medium">
              {line.description ?? 'Line'}{' '}
              <span className="text-muted-foreground tabular-nums">
                — {line.received} of {line.ordered} received, {claimedQuantity(line)} spoken for
              </span>
            </p>
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Confirmed</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((c) => (
                    <TableRow key={c.sales_item_id}>
                      <TableCell>{c.order_number ?? c.sales_order_id.slice(0, 8)}</TableCell>
                      <TableCell className="tabular-nums">{c.confirmed_at.slice(0, 10)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.outstanding}</TableCell>
                      <TableCell>
                        {c.linked_to_this
                          ? <Badge variant="success">assigned here</Badge>
                          : c.already_linked
                            ? <Badge variant="neutral">waiting on another purchase</Badge>
                            : <Badge variant="warning">unassigned</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.linked_to_this ? (
                          <Button
                            size="sm" variant="ghost" disabled={busy}
                            onClick={() => assign(c.sales_item_id, null)}
                          >
                            <Undo2 className="mr-1 h-3 w-3" /> Release
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="ghost" disabled={busy}
                            onClick={() => assign(c.sales_item_id, line.purchase_item_id)}
                          >
                            <Check className="mr-1 h-3 w-3" /> Assign
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}
    </div>
  );
};
