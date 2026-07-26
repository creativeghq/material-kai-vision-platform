/**
 * Pay an EXISTING open supplier bill — money OUT allocated to the bill so it settles and drops out
 * of Payables. The money-out mirror of settling an invoice via the "For" picker in
 * RecordPaymentDialog. Use this instead of "Add expense" when the bill already exists, otherwise
 * a new bill is created and Payables double-counts.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type PaymentMethod, type BankAccountBalance } from '@/modules/finance/services/financeService';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { parseDecimal } from '@/utils/decimal';

export interface PayableBillRef {
  id: string;
  supplier_bill_number?: string | null;
  party_name?: string | null;
  amount_due: number;
  currency?: string | null;
}

export const PaySupplierBillDialog: React.FC<{
  workspaceId: string;
  bill: PayableBillRef | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}> = ({ workspaceId, bill, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !bill) return;
    setAmount(bill.amount_due > 0 ? String(bill.amount_due) : '');
    setMethod('bank_transfer');
    setPaidAt(new Date().toISOString().slice(0, 10));
    setReference(''); setNotes('');
    (async () => {
      const banks = await financeService.getBankAccountBalances(workspaceId).catch(() => [] as BankAccountBalance[]);
      setBankAccounts(banks);
      setBankAccountId(banks.find((b) => b.is_default)?.bank_account_id ?? '');
    })();
  }, [open, bill, workspaceId]);

  const save = async () => {
    if (!bill) return;
    const amt = parseDecimal(amount);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (amt > bill.amount_due + 0.01) {
      toast({ title: 'Amount exceeds what is due', description: `This bill only has ${formatMoney(bill.amount_due, bill.currency ?? 'EUR')} outstanding.`, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await financeService.paySupplierBill({
        workspaceId,
        supplierBillId: bill.id,
        amount: amt,
        method,
        paidAt: new Date(paidAt).toISOString(),
        bankAccountId: bankAccountId || null,
        reference: reference || null,
        notes: notes || null,
      });
      toast({ title: 'Payment recorded', description: amt >= bill.amount_due ? 'Bill settled.' : 'Bill partially paid.' });
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay supplier bill</DialogTitle>
          <DialogDescription>
            {bill ? <>Settle {bill.supplier_bill_number ?? 'bill'}{bill.party_name ? ` · ${bill.party_name}` : ''} — {formatMoney(bill.amount_due, bill.currency ?? 'EUR')} due.</> : 'Record a payment against this bill.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>

          <PaidFromSelect
            workspaceId={workspaceId}
            label="Pay from account"
            value={bankAccountId}
            onChange={setBankAccountId}
            method={method}
            onMethodChange={setMethod}
            accounts={bankAccounts}
            allowUnassigned
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / Cheque no." />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Pay</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
