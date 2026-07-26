/** Record a cheque — received from a customer (in) or issued to a supplier (out). */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { chequesService } from '@/modules/finance/services/chequesService';
import { financeService, type Invoice, type SupplierBill } from '@/modules/finance/services/financeService';
import { parseDecimal } from '@/utils/decimal';

export const NewChequeDialog: React.FC<{
  workspaceId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  // Optional settlement target — clearing the cheque then settles this document (and stamps the
  // counterparty). 'in' → an open customer invoice; 'out' → an open supplier bill.
  const [targetId, setTargetId] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection('in'); setNumber(''); setBank(''); setAmount(''); setDueDate(''); setNotes(''); setTargetId('');
    (async () => {
      const [invs, sbs] = await Promise.all([
        financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'overdue'], limit: 200 }).catch(() => []),
        financeService.listSupplierBills({ workspaceId, status: ['received', 'partially_paid', 'overdue'] }).catch(() => []),
      ]);
      setInvoices(invs);
      setBills(sbs.filter((b) => Number(b.amount_due) > 0));
    })();
  }, [open, workspaceId]);

  // Clearing a target must not overshoot it — cap the amount at what's due when one is picked.
  const pickTarget = (id: string) => {
    setTargetId(id);
    if (amount) return;
    if (direction === 'in') { const i = invoices.find((x) => x.id === id); if (i) setAmount(String(i.amount_due)); }
    else { const b = bills.find((x) => x.id === id); if (b) setAmount(String(b.amount_due)); }
  };

  const save = async () => {
    const amt = parseDecimal(amount);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const inv = direction === 'in' ? invoices.find((x) => x.id === targetId) : null;
      const bill = direction === 'out' ? bills.find((x) => x.id === targetId) : null;
      await chequesService.create(workspaceId, {
        direction, chequeNumber: number, bank, amount: amt, dueDate, notes,
        invoiceId: inv?.id ?? null,
        supplierBillId: bill?.id ?? null,
        counterpartyCompanyId: inv?.customer_company_id ?? bill?.supplier_company_id ?? null,
        counterpartyContactId: inv?.customer_contact_id ?? bill?.supplier_contact_id ?? null,
      });
      toast({ title: 'Cheque recorded' });
      onCreated(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New cheque</DialogTitle><DialogDescription className="sr-only">Record a cheque you received or issued.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v: any) => { setDirection(v); setTargetId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Received (from customer)</SelectItem>
                  <SelectItem value="out">Issued (to supplier)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Cheque no.</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0001234" />
            </div>
            <div className="space-y-1">
              <Label>Bank</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Piraeus" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{direction === 'in' ? 'Settles invoice (optional)' : 'Settles supplier bill (optional)'}</Label>
              <Select value={targetId} onValueChange={pickTarget}>
                <SelectTrigger><SelectValue placeholder="None — cash moves on-account when cleared" /></SelectTrigger>
                <SelectContent>
                  {direction === 'in'
                    ? (invoices.length === 0
                        ? <div className="px-2 py-1 text-xs text-muted-foreground">No open invoices</div>
                        : invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — due {Number(i.amount_due).toFixed(2)}</SelectItem>))
                    : (bills.length === 0
                        ? <div className="px-2 py-1 text-xs text-muted-foreground">No open bills</div>
                        : bills.map((b) => <SelectItem key={b.id} value={b.id}>{b.supplier_bill_number ?? 'Bill'} — due {Number(b.amount_due).toFixed(2)}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">When you mark this cheque cleared, a payment is booked{targetId ? ' and this document is settled.' : ' (unallocated cash).'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
