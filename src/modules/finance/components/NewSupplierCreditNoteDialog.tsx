/**
 * #207 — record a SUPPLIER credit note (πιστωτικό προμηθευτή) against a supplier bill.
 * The supplier issues + transmits the credit note to myDATA; on our side we only RECORD
 * it so our payable (AP) is reduced. Capture the supplier's myDATA MARK in `external_mark`
 * for reconciliation. Net + VAT are entered separately (myDATA needs the split); they
 * default to the selected bill's amounts and can be trimmed for a partial credit.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type SupplierBill } from '@/modules/finance/services/financeService';

export const NewSupplierCreditNoteDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  /** Preselect a bill (from the AP row action); when omitted a picker is shown. */
  supplierBillId?: string;
}> = ({ workspaceId, open, onOpenChange, onCreated, supplierBillId }) => {
  const { toast } = useToast();
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [billId, setBillId] = useState('');
  const [net, setNet] = useState('');
  const [vat, setVat] = useState('');
  const [reason, setReason] = useState('');
  const [externalMark, setExternalMark] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(''); setExternalMark('');
    financeService.listSupplierBills({ workspaceId, status: ['received', 'partially_paid', 'paid', 'overdue', 'disputed'] })
      .then((rows) => {
        setBills(rows);
        const initial = supplierBillId ?? '';
        setBillId(initial);
        const b = rows.find((r) => r.id === initial);
        setNet(b ? String(b.subtotal_net) : '');
        setVat(b ? String(b.vat_amount) : '');
      })
      .catch(() => setBills([]));
  }, [open, workspaceId, supplierBillId]);

  const bill = useMemo(() => bills.find((b) => b.id === billId), [bills, billId]);

  const pick = (id: string) => {
    setBillId(id);
    const b = bills.find((x) => x.id === id);
    if (b) { setNet(String(b.subtotal_net)); setVat(String(b.vat_amount)); }
  };

  const netNum = parseFloat(net) || 0;
  const vatNum = parseFloat(vat) || 0;
  const total = Math.round((netNum + vatNum) * 100) / 100;

  const save = async () => {
    if (!billId) { toast({ title: 'Pick a supplier bill', variant: 'destructive' }); return; }
    if (total <= 0) { toast({ title: 'Enter a credit amount', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.issueSupplierCreditNote({
        supplierBillId: billId, netValue: netNum, vatAmount: vatNum,
        reason: reason.trim() || undefined, externalMark: externalMark.trim() || undefined,
      });
      toast({ title: 'Supplier credit note recorded', description: 'Payable reduced.' });
      onCreated(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record supplier credit note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Against supplier bill *</Label>
            <Select value={billId} onValueChange={pick} disabled={!!supplierBillId}>
              <SelectTrigger><SelectValue placeholder="Pick the bill to credit…" /></SelectTrigger>
              <SelectContent>
                {bills.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No open supplier bills</div>
                  : bills.map((b) => <SelectItem key={b.id} value={b.id}>{b.supplier_bill_number ?? b.id.slice(0, 8)} — {formatMoney(b.total, b.currency)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The supplier issues this credit note to myDATA; we record it here to reduce what we owe. Paste their MARK below for reconciliation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Net</Label>
              <Input type="number" step="0.01" min="0" value={net} onChange={(e) => setNet(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>VAT</Label>
              <Input type="number" step="0.01" min="0" value={vat} onChange={(e) => setVat(e.target.value)} />
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">Total: {formatMoney(total, bill?.currency)}</div>

          <div className="space-y-1">
            <Label>Supplier MARK (optional)</Label>
            <Input value={externalMark} onChange={(e) => setExternalMark(e.target.value)} placeholder="myDATA MARK from the supplier's credit note" />
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Returned goods / pricing correction" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Record credit note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
