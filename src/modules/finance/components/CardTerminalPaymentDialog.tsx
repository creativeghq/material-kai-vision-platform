/** Card / IRIS on an EFT-POS terminal outside the till (#465): sign, charge, then file. */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fiscalConnectorService, posTerminalService, type PosTerminal } from '@/services/fiscalConnectorService';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';

export type CardTerminalTarget =
  | { kind: 'invoice_payment'; invoiceId: string }
  | { kind: 'eftpos_receipt'; invoiceIds: string[] }
  | { kind: 'refund'; creditNoteId: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  target: CardTerminalTarget;
  amount: number;
  currency: string;
  label: string;
  onDone?: () => void;
}

const TITLE: Record<CardTerminalTarget['kind'], string> = {
  invoice_payment: 'Card payment on the terminal',
  eftpos_receipt: 'Card receipt (8.4) for this sale',
  refund: 'Refund to the card',
};

export const CardTerminalPaymentDialog: React.FC<Props> = ({
  open, onOpenChange, workspaceId, target, amount, currency, label, onDone,
}) => {
  const { toast } = useToast();
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [terminalId, setTerminalId] = useState('');
  const [method, setMethod] = useState<'7' | '8'>('7');
  const [signatureId, setSignatureId] = useState<string | null>(null);
  const [charge, setCharge] = useState(amount);
  const [txnId, setTxnId] = useState('');
  const [busy, setBusy] = useState(false);
  const clientToken = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setSignatureId(null); setTxnId(''); setCharge(amount);
    clientToken.current = crypto.randomUUID();
    posTerminalService.list(workspaceId)
      .then((t) => {
        const active = t.filter((x) => x.is_active);
        setTerminals(active);
        setTerminalId((cur) => cur || active[0]?.terminal_id || '');
      })
      .catch(() => setTerminals([]));
  }, [open, workspaceId, amount]);

  const terminal = terminals.find((t) => t.terminal_id === terminalId) ?? null;

  const sign = async () => {
    if (!terminal) return;
    setBusy(true);
    const pos = { terminal_id: terminal.terminal_id, pos_nsp_id: terminal.pos_nsp_id, payment_type: Number(method) };
    try {
      if (target.kind === 'invoice_payment') {
        const r = await fiscalConnectorService.startCardPaymentOnIssuedInvoice({ invoice_id: target.invoiceId, ...pos, payment_amount: amount });
        setSignatureId(r.pos_signature_id);
        if (Number.isFinite(r.payment_amount)) setCharge(r.payment_amount);
      } else if (target.kind === 'eftpos_receipt') {
        const receiptId = await fiscalConnectorService.issueEftposReceipt(target.invoiceIds, Number(method) as 7 | 8, clientToken.current);
        const res = await fiscalConnectorService.submitInvoice(receiptId, { posPayment: pos });
        if (res?.fiscal?.ok === false) throw new Error(res.fiscal.error ?? 'The receipt was not signed.');
        const { data: sig } = await supabase.from('pos_signatures').select('id')
          .eq('invoice_id', receiptId).eq('status', 'awaiting_payment')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!sig) throw new Error(res?.fiscal?.errorMessage ?? 'The provider returned no signature for the receipt.');
        setSignatureId((sig as { id: string }).id);
      } else {
        const res = await fiscalConnectorService.submitCreditNote(target.creditNoteId, { posPayment: pos });
        if (res?.fiscal?.status !== 'awaiting_payment') {
          throw new Error(res?.fiscal?.errorMessage ?? 'The provider did not sign the refund.');
        }
        const { data: sig } = await supabase.from('pos_signatures').select('id')
          .eq('credit_note_id', target.creditNoteId).eq('status', 'awaiting_payment')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!sig) throw new Error('The refund was signed but its signature could not be read back.');
        setSignatureId((sig as { id: string }).id);
      }
    } catch (err) {
      toast({ title: 'Could not start the card payment', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const recordMoney = async () => {
    const paidBy: 'card' | 'iris' = method === '8' ? 'iris' : 'card';
    if (target.kind === 'invoice_payment') {
      await financeService.recordPayment({
        workspaceId, direction: 'in', amount: charge, currency, method: paidBy,
        allocations: [{ target_id: target.invoiceId, target_type: 'invoice', amount: charge }],
      });
    } else if (target.kind === 'eftpos_receipt') {
      const { data: due } = await supabase.from('invoices').select('id, amount_due').in('id', target.invoiceIds);
      const allocations = (due ?? [])
        .filter((r: { amount_due: number | null }) => Number(r.amount_due) > 0)
        .map((r: { id: string; amount_due: number | null }) => ({ target_id: r.id, target_type: 'invoice' as const, amount: Number(r.amount_due) }));
      await financeService.recordPayment({ workspaceId, direction: 'in', amount: charge, currency, method: paidBy, allocations });
    }
  };
  const complete = async () => {
    if (!signatureId || !txnId.trim()) return;
    setBusy(true);
    try {
      const res = await fiscalConnectorService.completePos({
        pos_signature_id: signatureId, transaction_id: txnId.trim(), payment_amount: charge,
      });
      if (!res?.ok) throw new Error(res?.error ?? 'Completion failed');
      // Not booked here: an outgoing payment cannot yet be linked to a credit note.
      let moneyNote = target.kind === 'refund'
        ? ' Record the money returned in Finance → Payments against this customer.'
        : '';
      if (target.kind !== 'refund') {
        try { await recordMoney(); } catch (e) {
          moneyNote = ` The payment itself was NOT recorded (${(e as Error).message}) — enter it in Finance → Payments.`;
        }
      }
      toast({
        title: target.kind === 'refund' ? 'Refund filed' : 'Card payment filed',
        description: `${res?.fiscal?.mark ? `MARK ${res.fiscal.mark}.` : ''}${moneyNote}`,
        variant: moneyNote && target.kind !== 'refund' ? 'destructive' : undefined,
      });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast({ title: 'Could not complete', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE[target.kind]}</DialogTitle>
          <DialogDescription>{label} · {formatMoney(signatureId ? charge : amount, currency)}</DialogDescription>
        </DialogHeader>

        {!signatureId ? (
          terminals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active payment terminal is registered. Add one in Finance → Settings → POS terminals first.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Terminal</Label>
                <Select value={terminalId} onValueChange={setTerminalId}>
                  <SelectTrigger><SelectValue placeholder="Pick a terminal" /></SelectTrigger>
                  <SelectContent>
                    {terminals.map((t) => <SelectItem key={t.id} value={t.terminal_id}>{t.label} · {t.terminal_id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Paid by</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as '7' | '8')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Card</SelectItem>
                    <SelectItem value="8">IRIS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              {target.kind === 'refund' ? 'Refund' : 'Charge'} <span className="font-semibold tabular-nums">{formatMoney(charge, currency)}</span> on
              terminal <span className="font-mono">{terminalId}</span>, then enter the transaction id the terminal printed.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ctp-txn">Transaction id</Label>
              <Input id="ctp-txn" value={txnId} onChange={(e) => setTxnId(e.target.value)} autoFocus />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          {!signatureId ? (
            <Button onClick={sign} disabled={busy || !terminal}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Sign for the terminal
            </Button>
          ) : (
            <Button onClick={complete} disabled={busy || !txnId.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Terminal approved — file it
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
