/**
 * Standalone "Record payment" (receipt / payment / refund).
 *  - Received: money in from a customer — optionally "for" an open invoice → marks it (partly) settled.
 *  - Paid out: money out to a supplier (unallocated cash-out / on-account).
 *  - Refund/Return: money out to a customer (e.g. against a credit note).
 * Carries a finance category + method + back-datable date.
 *
 * Pass `preset` to deep-link the dialog to a specific invoice (e.g. the Settle action on a row).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, type Invoice, type PaymentMethod, type BankAccountBalance } from '@/modules/finance/services/financeService';
import { PaidFromSelect } from '@/modules/finance/components/PaidFromSelect';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { parseDecimal } from '@/utils/decimal';

type Kind = 'received' | 'paid_out' | 'refund';

/** Deep-link the dialog straight to one invoice (Settle / refund action on a row). */
export interface RecordPaymentPreset {
  direction: Kind;
  targetType: 'invoice';
  targetId: string;
}

export const RecordPaymentDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  preset?: RecordPaymentPreset | null;
  /** Tie the payment to a specific party when there's no allocation target
   *  (e.g. opened from a CRM party page → records as customer credit). */
  initialCounterparty?: { contactId?: string | null; companyId?: string | null } | null;
}> = ({ workspaceId, open, onOpenChange, onSaved, preset, initialCounterparty }) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>('received');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // Settle target invoice id ('' = unallocated). Refund uses its own invoice picker below.
  const [invoiceId, setInvoiceId] = useState<string>(''); // refund target
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>(''); // received allocation target
  const [issueCreditNote, setIssueCreditNote] = useState(true);
  const [sendReceipt, setSendReceipt] = useState(true);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountBalance[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialKind = preset?.direction ?? 'received';
    setKind(initialKind);
    setAmount(''); setMethod('cash'); setPaidAt(new Date().toISOString().slice(0, 10));
    setCategoryId(''); setReference(''); setNotes('');
    setTargetInvoiceId(preset && preset.direction === 'received' ? preset.targetId : '');
    setInvoiceId(preset?.direction === 'refund' ? preset.targetId : '');
    setIssueCreditNote(true);
    setSendReceipt(true);
    (async () => {
      const [cats, invs, banks] = await Promise.all([
        financeCategoriesService.list(workspaceId).catch(() => []),
        // Include paid invoices too — a refund is usually against an already-settled invoice.
        financeService.listInvoices({ workspaceId, status: ['issued', 'partially_paid', 'overdue', 'paid'], limit: 200 }).catch(() => []),
        // Balances, so the picker shows what's in each account at the point of choosing.
        financeService.getBankAccountBalances(workspaceId).catch(() => [] as BankAccountBalance[]),
      ]);
      setCategories(cats);
      setInvoices(invs);
      setBankAccounts(banks);
      // Default to the workspace's default account so cash location is always captured.
      setBankAccountId(banks.find((b) => b.is_default)?.bank_account_id ?? '');
    })();
  }, [open, workspaceId, preset]);

  // Received → open invoices. Refund → any issued invoice (usually paid).
  const pickableInvoices = useMemo(
    () => (kind === 'refund' ? invoices : invoices.filter((i) => Number(i.amount_due) > 0)),
    [invoices, kind],
  );
  const selectedInvoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const selectedTarget = useMemo(() => invoices.find((i) => i.id === targetInvoiceId) ?? null, [invoices, targetInvoiceId]);

  const pickTarget = (id: string) => {
    setTargetInvoiceId(id);
    if (amount) return;
    const inv = invoices.find((i) => i.id === id);
    if (inv) setAmount(String(inv.amount_due));
  };

  const pickRefundInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv && !amount) setAmount(String((inv as any).total ?? inv.amount_due));
  };

  const save = async () => {
    const amt = parseDecimal(amount);
    if (amt == null || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (kind === 'refund' && issueCreditNote && !invoiceId) {
      toast({ title: 'Pick the invoice to credit', description: 'A refund issues a credit note against an invoice. Choose it, or turn off the credit note.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      // Refund: first issue the credit note (5.1 correlated) so myDATA nets the original invoice.
      let creditNoteRef: string | null = null;
      let creditNoteFiscalError: string | undefined;
      if (kind === 'refund' && issueCreditNote && invoiceId) {
        const cn = await financeService.createCreditNote({
          workspaceId,
          invoiceId,
          amount: amt,
          reason: reference || notes || 'Refund / return',
          correlated: true,
          submitFiscal: true,
        });
        creditNoteRef = cn.credit_note_id;
        creditNoteFiscalError = cn.fiscal_error;
      }

      const direction = kind === 'received' ? 'in' : 'out';

      // Build the allocation + resolve the counterparty from the chosen invoice.
      let allocations: Array<{ target_id: string; target_type: 'invoice'; amount: number }> = [];
      let counterpartyCompanyId: string | null = null;
      let counterpartyContactId: string | null = null;
      if (kind === 'refund') {
        counterpartyCompanyId = selectedInvoice?.customer_company_id ?? null;
        counterpartyContactId = selectedInvoice?.customer_contact_id ?? null;
      } else if (kind === 'received' && selectedTarget) {
        allocations = [{ target_id: selectedTarget.id, target_type: 'invoice', amount: amt }];
        counterpartyCompanyId = selectedTarget.customer_company_id ?? null;
        counterpartyContactId = selectedTarget.customer_contact_id ?? null;
      }

      // No target chosen (unallocated / on-account) → tie it to the party the
      // dialog was opened for so it still rolls up under that customer.
      if (!counterpartyCompanyId && !counterpartyContactId && initialCounterparty) {
        counterpartyCompanyId = initialCounterparty.companyId ?? null;
        counterpartyContactId = initialCounterparty.contactId ?? null;
      }

      await financeService.recordPayment({
        workspaceId,
        direction,
        amount: amt,
        method,
        paidAt: new Date(paidAt).toISOString(),
        categoryId: categoryId || null,
        reference: reference || (creditNoteRef ? `Refund · CN ${creditNoteRef.slice(0, 8)}` : kind === 'refund' ? 'Refund' : null),
        notes: notes || null,
        counterpartyCompanyId,
        counterpartyContactId,
        allocations,
        bankAccountId: bankAccountId || null,
        sendReceipt: kind === 'received' ? sendReceipt : false,
      });
      if (creditNoteFiscalError) {
        // Cash-out logged + credit note created, but myDATA transmission failed —
        // don't pretend it's filed. Operator must retransmit from the credit-note list.
        toast({
          title: 'Refund recorded — myDATA transmission failed',
          description: `The credit note was created and the cash-out logged, but it was NOT accepted by myDATA: ${creditNoteFiscalError}. Retransmit it from the credit notes list.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: kind === 'refund' ? 'Refund recorded' : 'Payment recorded',
          description: creditNoteRef ? 'Credit note issued to myDATA and the cash-out logged.' : undefined,
        });
      }
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v: any) => { setKind(v); setTargetInvoiceId(''); setInvoiceId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received (from customer)</SelectItem>
                  <SelectItem value="paid_out">Paid out (to supplier)</SelectItem>
                  <SelectItem value="refund">Refund / return (to customer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          {kind === 'received' && (
            <div className="space-y-1">
              <Label>For (optional)</Label>
              <Select value={targetInvoiceId} onValueChange={pickTarget}>
                <SelectTrigger><SelectValue placeholder="None — unallocated credit" /></SelectTrigger>
                <SelectContent>
                  {pickableInvoices.length === 0
                    ? <div className="px-2 py-1 text-xs text-muted-foreground">No open invoices</div>
                    : pickableInvoices.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.internal_number} — due {Number(i.amount_due).toFixed(2)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedTarget && <p className="text-[11px] text-muted-foreground">Settling this invoice will mark it paid when fully covered.</p>}
            </div>
          )}

          {kind === 'received' && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 cursor-pointer">
              <span className="text-xs">Send receipt to customer <span className="text-muted-foreground">— emails the payment receipt &amp; notifies them. Off = record it silently.</span></span>
              <Switch checked={sendReceipt} onCheckedChange={setSendReceipt} />
            </label>
          )}

          {kind === 'paid_out' && (
            <p className="text-[11px] text-muted-foreground">Records cash out (on-account). To settle a specific supplier bill, use the Settle action on that bill.</p>
          )}

          {kind === 'refund' && (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <div className="space-y-1">
                <Label>Invoice to credit</Label>
                <Select value={invoiceId} onValueChange={pickRefundInvoice}>
                  <SelectTrigger><SelectValue placeholder="Pick the invoice being refunded…" /></SelectTrigger>
                  <SelectContent>
                    {pickableInvoices.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">No invoices</div>
                      : pickableInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.internal_number} — {Number((i as any).total ?? 0).toFixed(2)}{(i as any).fiscal_mark ? ' · MARK' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between text-xs cursor-pointer">
                <span>Issue credit note to myDATA (nets the invoice)</span>
                <Switch checked={issueCreditNote} onCheckedChange={setIssueCreditNote} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                {issueCreditNote
                  ? 'A 5.1 credit note is transmitted against the invoice, then the cash-out is logged.'
                  : 'Only the cash-out is recorded — no credit note is issued.'}
              </p>
            </div>
          )}

          <PaidFromSelect
            workspaceId={workspaceId}
            label={kind === 'received' ? 'Deposit to account' : 'Pay from account'}
            value={bankAccountId}
            onChange={setBankAccountId}
            method={method}
            onMethodChange={setMethod}
            accounts={bankAccounts}
            allowUnassigned
          />
          {bankAccounts.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No accounts yet — add bank/cash accounts in Settings → Bank accounts to track where money sits.</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? <div className="px-2 py-1 text-xs text-muted-foreground">Add categories in Settings</div>
                    : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / cheque no. / credit note" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
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
