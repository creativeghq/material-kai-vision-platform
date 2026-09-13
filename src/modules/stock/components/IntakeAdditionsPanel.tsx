/**
 * What intake actually created, and how to take it back (#406).
 *
 * Approve flips the line to `added` and every pending list filters `pending`, so the line vanishes
 * and nothing anywhere shows what was made. Bulk-approve five hundred lines and the only evidence
 * is in three tables nobody renders.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, PackagePlus, Undo2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { warehouseService } from '@/services/warehouseService';
import {
  ADDITION_MODE_LABEL, additionCanBeUndone, UNDO_KEEPS_THE_PRODUCT,
  type IntakeAddition,
} from '@/modules/stock/intakeApprovalRules';

export const IntakeAdditionsPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<IntakeAddition[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await warehouseService.intakeRecentAdditions(workspaceId, 50);
      setRows(res.rows); setNote(res.note); setFailed(false);
    } catch {
      setRows([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const undo = async (a: IntakeAddition) => {
    if (!window.confirm(`Undo the approval of “${a.name}”?\n\n${UNDO_KEEPS_THE_PRODUCT}`)) return;
    setBusy(a.pending_item_id);
    try {
      const res = await warehouseService.undoIntakeApproval(a.pending_item_id);
      toast({
        title: res.stock_reversed ? `Reversed ${res.quantity_reversed}` : 'Line queued again',
        description: res.note,
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not undo',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="h-4 w-4 text-primary" /> Added from intake
        </CardTitle>
        <CardDescription>
          Line → product → shelf → movement, for what has been approved. {note}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading what intake created…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This could not be read just now. That is not a statement that nothing was added.
          </p>
        )}

        {!loading && !failed && rows.length === 0 && (
          <HubEmptyState
            title="Nothing approved yet"
            description="Queued supplier lines become products here. Until one is approved there is nothing to show — and nothing has been added to stock."
          />
        )}

        {!loading && !failed && rows.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Moved</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.pending_item_id}>
                    <TableCell>
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        {a.quantity} {a.unit ?? ''} · {a.unit_cost ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>{a.product_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={a.added_to_stock ? 'success' : 'neutral'}>
                        {ADDITION_MODE_LABEL[a.mode]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.movement_qty ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.qty_on_hand ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">
                      {a.document_issue_date ? formatDate(a.document_issue_date) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {additionCanBeUndone(a) && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2"
                          disabled={busy === a.pending_item_id}
                          onClick={() => undo(a)}
                        >
                          <Undo2 className="mr-1 h-3 w-3" /> Undo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && !failed && rows.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{UNDO_KEEPS_THE_PRODUCT}</p>
        )}
      </CardContent>
    </Card>
  );
};
