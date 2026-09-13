/**
 * Book a supplier's myDATA document against the purchase order it is already for.
 *
 * "Add to Expenses" raises a NEW order, which is right when the purchase was never recorded. When
 * the PO exists — we raised it when we ordered — that made a second order and left the real one's
 * three-way match reading `awaiting_bill` forever.
 */
import React, { useEffect, useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import {
  inboundService, type InboundDocument, type InboundOrderSuggestion,
} from '@/modules/finance/services/inboundService';

export const BillToExistingOrderDialog: React.FC<{
  doc: InboundDocument;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBooked?: () => void;
}> = ({ doc, open, onOpenChange, onBooked }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InboundOrderSuggestion[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setLoading(true);
    inboundService.suggestOrders(doc.id)
      .then(setRows)
      .catch((err: unknown) => {
        // An empty list and a failed read are different facts, and only one of them means "there
        // are no orders". Never let the second render as the first.
        setRows(null);
        toast({
          title: 'Could not load purchase orders',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [open, doc.id, toast]);

  const book = async (row: InboundOrderSuggestion) => {
    setSavingId(row.order_id);
    try {
      const res = await inboundService.billToOrder(doc.id, row.order_id);
      toast({ title: 'Booked', description: res.note });
      onOpenChange(false);
      onBooked?.();
    } catch (err: unknown) {
      toast({
        title: 'Could not book this document',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const docNet = Number(doc.total_net ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Which purchase order is this for?</DialogTitle>
          <DialogDescription>
            {doc.issuer_name ?? 'This supplier'} billed {formatMoney(docNet, doc.currency ?? 'EUR')} net.
            Booking it here is what lets the order&rsquo;s three-way match compare ordered, received
            and billed.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading purchase orders…
          </div>
        )}

        {!loading && rows?.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            This workspace has no open purchase order to bill. Use <strong>Add to Expenses</strong> on
            the row instead — it raises the order this document is the record of.
          </p>
        )}

        {!loading && !!rows?.length && (
          <div className="divide-y divide-hairline">
            {rows.map((r) => (
              <div key={r.order_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.order_number ?? 'Purchase order'}</span>
                    {r.same_supplier && <Badge variant="success">Same supplier</Badge>}
                    {Math.abs(Number(r.net_delta)) < 0.01 && <Badge variant="info">Exact</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.party_name ?? '—'} · {r.ordered_on ? formatDate(r.ordered_on) : '—'} · {r.match_reason}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums">
                  <div>{formatMoney(Number(r.po_net), r.currency ?? 'EUR')} ordered</div>
                  <div className="text-muted-foreground">
                    {Number(r.already_billed_net) > 0
                      ? `${formatMoney(Number(r.already_billed_net), r.currency ?? 'EUR')} already billed`
                      : 'nothing billed yet'}
                    {' · '}
                    {Number(r.net_delta) === 0
                      ? 'matches'
                      : `${Number(r.net_delta) > 0 ? '+' : ''}${formatMoney(Number(r.net_delta), r.currency ?? 'EUR')}`}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={!!savingId} onClick={() => void book(r)}>
                  {savingId === r.order_id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Link2 className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">Book</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!savingId}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillToExistingOrderDialog;
