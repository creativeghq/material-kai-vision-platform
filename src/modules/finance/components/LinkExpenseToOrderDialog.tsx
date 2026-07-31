/**
 * Attach an EXISTING expense to an order.
 *
 * An order holds many expenses — `supplier_bills.order_id` has no uniqueness — but until now the
 * link could only ever be written at the moment an expense was born: the Inbox's "Add to Expenses"
 * created the order and the bill together, and the general expense form offered a purchase-order
 * picker only while the form was still open. Anything already booked (a transport invoice that
 * landed a week after the goods, customs, an installer, a second supplier on the same job) had no
 * route onto the order it belonged to. This is that route, from the order side.
 *
 * Only UNLINKED expenses are offered (`unlinkedOnly`), so a cost can never be counted onto two
 * orders. To move one, unlink it on the order that holds it first — the Supplier bills list has
 * the action. Settled expenses are included: a cost being paid already says nothing about which
 * order it belongs to.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Link2, Inbox } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type PayableExpense } from '@/modules/finance/services/financeService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';

interface Props {
  workspaceId: string;
  orderId: string;
  /** For the header — which order the expenses are being attached to. */
  orderLabel: string;
  /** The order's supplier, when it has one. Their expenses sort first; nothing is filtered out —
   *  plenty of costs on a purchase are billed by somebody other than the goods' supplier. */
  supplierCompanyId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

export const LinkExpenseToOrderDialog: React.FC<Props> = ({
  workspaceId, orderId, orderLabel, supplierCompanyId, open, onOpenChange, onLinked,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<PayableExpense[]>([]);
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setTerm('');
    setLoading(true);
    financeService
      .listPayableExpenses(workspaceId, { unlinkedOnly: true, includeSettled: true })
      .then((r) => setRows(r.filter((e) => e.status !== 'void')))
      .catch((err: unknown) => toast({
        title: 'Could not load expenses',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId]);

  const visible = useMemo(() => {
    const t = term.trim().toLowerCase();
    const matches = t
      ? rows.filter((e) => [e.supplier_bill_number, e.party_name, e.notes, e.inbox?.issuer_name]
        .some((v) => v?.toLowerCase().includes(t)))
      : rows;
    // The order's own supplier leads — the common case is a second bill from the same party.
    if (!supplierCompanyId) return matches;
    return [...matches].sort((a, b) =>
      Number(b.supplier_company_id === supplierCompanyId) - Number(a.supplier_company_id === supplierCompanyId));
  }, [rows, term, supplierCompanyId]);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const attach = async () => {
    if (!picked.size) return;
    setSaving(true);
    try {
      // Sequential on purpose: each write is a guarded read-then-update, and a failure part-way
      // must leave the ones that already landed attached rather than rolling into an unknown state.
      for (const id of picked) await financeService.setSupplierBillOrder(id, orderId);
      toast({
        title: picked.size === 1 ? 'Expense attached' : `${picked.size} expenses attached`,
        description: `Now counted on ${orderLabel}.`,
      });
      onOpenChange(false);
      onLinked();
    } catch (err: unknown) {
      toast({
        title: 'Could not attach',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Attach an existing expense
          </DialogTitle>
          <DialogDescription>
            Costs already booked but not yet on any order. Attaching one puts it on {orderLabel} —
            it stays a single expense in Payables and the P&amp;L, it is not duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by number, supplier or note…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border/60">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading expenses…
            </div>
          ) : visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Every expense in this workspace is already on an order. Use “Add expense” to book a new one.'
                : 'No expense matches that search.'}
            </p>
          ) : visible.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-start gap-3 border-t border-border/40 px-3 py-2 text-sm first:border-t-0 hover:bg-muted/40"
            >
              <Checkbox
                className="mt-0.5 h-3.5 w-3.5 rounded"
                checked={picked.has(e.id)}
                onCheckedChange={() => toggle(e.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className="font-mono text-xs">{e.supplier_bill_number ?? e.id.slice(0, 8)}</span>
                  {e.party_name && <span className="text-muted-foreground"> · {e.party_name}</span>}
                  {e.inbox && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Inbox className="h-3 w-3" /> from Inbox
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {e.issued_at ? new Date(e.issued_at).toLocaleDateString() : 'no date'}
                  {' · '}<span className={statusTone(e.status)}>{humanizeLabel(e.status)}</span>
                  {e.notes ? ` · ${e.notes}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block">{formatMoney(Number(e.total), e.currency)}</span>
                {Number(e.amount_due) > 0.005 && (
                  <span className="text-[10px] text-muted-foreground">due {formatMoney(Number(e.amount_due), e.currency)}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={attach} disabled={saving || picked.size === 0}>
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Attaching…</>
              : picked.size > 1 ? `Attach ${picked.size} expenses` : 'Attach expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
