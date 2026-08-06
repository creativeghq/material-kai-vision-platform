/**
 * Edit a recorded expense's DOCUMENT metadata after the fact — the supplier's bill number,
 * issue/due dates, category and notes. Bills recorded manually from an order usually lack
 * the supplier's own invoice number (myDATA-created ones get `IN-<MARK>` automatically);
 * this dialog is the backfill path from Payables.
 *
 * Amounts and supplier identity are deliberately NOT here — payments allocate against them,
 * and net/VAT feed the P&L. Correcting a wrong amount is a credit note, not an edit.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type PayableExpense } from '@/modules/finance/services/financeService';
import type { FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

const NO_CATEGORY = '__none__';

export const EditSupplierBillDialog: React.FC<{
  workspaceId: string;
  /** Bill being edited; null keeps the dialog closed. */
  billId: string | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  categories: FinanceCategory[];
}> = ({ workspaceId, billId, onOpenChange, onSaved, categories }) => {
  const { toast } = useToast();
  const [bill, setBill] = useState<PayableExpense | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [billNumber, setBillNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!billId) { setBill(null); return; }
    setLoading(true);
    financeService.listPayableExpenses(workspaceId, { ids: [billId], includeSettled: true })
      .then((rows) => {
        const b = rows[0] ?? null;
        setBill(b);
        setBillNumber(b?.supplier_bill_number ?? '');
        setIssuedAt(b?.issued_at?.slice(0, 10) ?? '');
        setDueAt(b?.due_at?.slice(0, 10) ?? '');
        setCategoryId(b?.category_id ?? NO_CATEGORY);
        setNotes(b?.notes ?? '');
      })
      .catch((e) => toast({ title: 'Failed to load the expense', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [billId, workspaceId, toast]);

  const save = async () => {
    if (!billId) return;
    setBusy(true);
    try {
      await financeService.updateSupplierBillMeta(billId, {
        supplierBillNumber: billNumber,
        issuedAt: issuedAt || null,
        dueAt: dueAt || null,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        notes,
      });
      toast({ title: 'Expense updated' });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: 'Failed to update the expense', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!billId} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit expense details</DialogTitle>
          <DialogDescription>
            {bill
              ? <>Document details for {bill.party_name ?? 'this expense'} · {formatMoney(bill.total, bill.currency)}. Amounts are fixed — record a supplier credit note to correct them.</>
              : 'Document details — bill number, dates, category and notes.'}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reference / Bill #</Label>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="the supplier's invoice number — e.g. ΤΔΑ-2026/184" />
              {bill?.inbox && (
                <p className="text-[11px] text-muted-foreground">
                  From myDATA (MARK {bill.inbox.mark}
                  {bill.inbox.series ? ` · ${bill.inbox.series} ${bill.inbox.aa ?? ''}`.trimEnd() : ''}) — replacing the
                  auto number with the supplier's own series is fine; the MARK stays on the inbox document.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue date</Label>
                <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || loading || !bill}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
