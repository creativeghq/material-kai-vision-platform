import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Landmark, Loader2, Minus, Paperclip, RefreshCw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  financeService, formatMoney, type BankAccount, type InvoicePaymentProof, type PaymentProofCheckKey,
} from '@/modules/finance/services/financeService';
import { formatDate, todayLocalISO } from '@/utils/datetime';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const CHECK_LABEL: Record<PaymentProofCheckKey, string> = {
  amount: 'Amount',
  currency: 'Currency',
  beneficiary_iban: 'Paid to IBAN',
  beneficiary_name: 'Beneficiary',
  reference: 'Reference',
  date: 'Date',
  status: 'Transfer status',
  tamper: 'Signs of editing',
};

const AI_ERROR: Record<string, string> = {
  insufficient_credits: 'Not checked — not enough credits.',
  no_billing_user: 'Not checked — the workspace has no owner to bill.',
  heic_not_readable: 'Not checked — HEIC photos cannot be read automatically.',
};

function proofBadge(p: InvoicePaymentProof): { label: string; tone: Tone } {
  if (p.payment_id) return { label: 'Payment recorded', tone: 'success' };
  if (p.bank_confirmed) return { label: 'Confirmed by bank', tone: 'success' };
  if (p.status === 'rejected') return { label: 'Rejected', tone: 'error' };
  if (p.ai_status === 'pending') return { label: 'Checking…', tone: 'neutral' };
  if (p.ai_status !== 'checked') return { label: 'Not checked', tone: 'neutral' };
  if (p.ai_verdict === 'matches') return { label: 'Matches the order', tone: 'success' };
  if (p.ai_verdict === 'review') return { label: 'Needs review', tone: 'warning' };
  if (p.ai_verdict === 'not_a_receipt') return { label: 'Not a transfer receipt', tone: 'error' };
  return { label: 'Unreadable', tone: 'error' };
}

const ResultIcon: React.FC<{ result: string }> = ({ result }) => {
  if (result === 'ok') return <Check className="h-3.5 w-3.5 shrink-0 text-success" />;
  if (result === 'warn') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />;
  if (result === 'fail') return <X className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
};

const ConfirmProofDialog: React.FC<{
  proof: InvoicePaymentProof | null;
  workspaceId: string;
  currency: string;
  outstanding: number;
  onClose: () => void;
  onConfirmed: () => void;
}> = ({ proof, workspaceId, currency, outstanding, onClose, onConfirmed }) => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [amount, setAmount] = useState<number | null>(null);
  const [paidOn, setPaidOn] = useState(todayLocalISO());
  const [accountId, setAccountId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!proof) return;
    const x = proof.ai_extracted;
    setAmount(x?.amount != null && x.amount > 0 && x.amount <= outstanding + 0.005 ? x.amount : outstanding);
    setPaidOn(x?.transfer_date ?? todayLocalISO());
    setAccountId(proof.ai_checks?.bank_account_id ?? '');
    financeService.listBankAccounts(workspaceId)
      .then((rows) => setAccounts(rows.filter((a) => a.kind === 'bank')))
      .catch(() => setAccounts([]));
  }, [proof, workspaceId, outstanding]);

  const submit = async () => {
    if (!proof || amount == null) return;
    setBusy(true);
    try {
      const res = await financeService.confirmPaymentProof(proof.id, { amount, paidOn, bankAccountId: accountId || null });
      toast({
        title: res.duplicate ? 'Already recorded' : 'Payment recorded',
        description: res.issue_error
          ? `The money is booked, but issuing the document failed: ${res.issue_error}`
          : res.issued ? `Paid in full — issued as ${res.issued.legal_number ?? 'a legal document'}.` : undefined,
        variant: res.issue_error ? 'destructive' : undefined,
      });
      onConfirmed();
    } catch (err) {
      toast({ title: 'Could not record the payment', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const clean = proof?.ai_verdict === 'matches';
  return (
    <Dialog open={!!proof} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm bank transfer</DialogTitle>
          <DialogDescription>
            Records the payment on this order. Paid in full, the order is issued and marked paid.
          </DialogDescription>
        </DialogHeader>
        <div className={`rounded-md border p-3 text-xs ${clean ? 'border-hairline bg-surface-sunken' : 'border-warning/40 bg-warning/10'}`}>
          {clean
            ? 'The receipt matches the order. A receipt can be edited, so confirm once you see the money in your bank.'
            : 'The receipt does not fully match the order. Confirm only if the money is in your bank account.'}
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Amount received ({currency})</Label>
            <MoneyInput className="h-9 text-right text-sm" value={amount} onValueChange={setAmount} />
            <p className="text-[11px] text-muted-foreground">Outstanding: {formatMoney(outstanding, currency)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date received</Label>
            <Input type="date" className="h-9 text-sm" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Into account</Label>
            <Select value={accountId || 'none'} onValueChange={(v) => setAccountId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}{a.iban ? ` · ${a.iban.slice(-4)}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || amount == null || amount <= 0 || !paidOn}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Bank-transfer receipts the customer uploaded on the pay page, with what the AI read off each.
 * A receipt is evidence, not money: it books only through Confirm, or when the bank feed matches it.
 */
export const PaymentProofsCard: React.FC<{
  invoiceId: string;
  workspaceId: string;
  currency: string;
  canManage: boolean;
  outstanding: number;
  onChanged: () => void;
}> = ({ invoiceId, workspaceId, currency, canManage, outstanding, onChanged }) => {
  const { toast } = useToast();
  const [proofs, setProofs] = useState<InvoicePaymentProof[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<InvoicePaymentProof | null>(null);

  const load = useCallback(async () => {
    try { setProofs(await financeService.listInvoicePaymentProofs(invoiceId)); }
    catch (err) { toast({ title: 'Could not load payment receipts', description: (err as Error).message, variant: 'destructive' }); }
  }, [invoiceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const pending = proofs.some((p) => p.ai_status === 'pending');
  useEffect(() => {
    if (!pending) return;
    let tries = 0;
    const timer = setInterval(() => { tries += 1; if (tries > 24) clearInterval(timer); else void load(); }, 5000);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (proofs.length === 0) return null;

  const run = async (p: InvoicePaymentProof, work: () => Promise<unknown>, failTitle: string) => {
    setBusyId(p.id);
    try { await work(); await load(); }
    catch (err) { toast({ title: failTitle, description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" /> Bank transfer receipts
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-hairline">
          {proofs.map((p) => {
            const badge = proofBadge(p);
            const x = p.ai_extracted;
            const open = !p.payment_id && p.status === 'submitted';
            const busy = busyId === p.id;
            return (
              <li key={p.id} className="space-y-3 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{p.file_name || 'Receipt'}</span>
                      <Badge variant={badge.tone}>{badge.label}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatDate(p.created_at, { withTime: true })}
                      {p.size_bytes != null ? ` · ${(p.size_bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                    </p>
                    {p.note && <p className="whitespace-pre-wrap text-xs">Customer note: {p.note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" disabled={busy}
                      onClick={() => void run(p, async () => { window.open(await financeService.paymentProofUrl(p), '_blank', 'noopener'); }, 'Could not open the receipt')}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View
                    </Button>
                    {canManage && open && (
                      <>
                        {outstanding > 0.005 && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(p)}>
                            Confirm payment
                          </Button>
                        )}
                        {(p.ai_status !== 'pending' || Date.now() - new Date(p.created_at).getTime() > 3 * 60_000) && (
                          <Button variant="ghost" size="sm" disabled={busy}
                            onClick={() => void run(p, () => financeService.recheckPaymentProof(p.id), 'Could not check the receipt')}>
                            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                            Check again
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={busy}
                          onClick={() => void run(p, () => financeService.setPaymentProofStatus(p.id, 'rejected'), 'Could not update the receipt')}>
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {p.ai_status === 'checked' && x && (
                  <div className="rounded-md border border-hairline">
                    <p className="border-b border-hairline bg-surface-sunken px-3 py-1.5 text-xs">
                      <span className="font-semibold tabular-nums">
                        {x.amount != null ? formatMoney(x.amount, x.currency ?? currency) : 'No amount'}
                      </span>
                      {x.transfer_date && <> · {formatDate(x.transfer_date)}</>}
                      {x.payer_name && <> · from {x.payer_name}</>}
                      {x.bank_name && <> · {x.bank_name}</>}
                      {x.reference && <> · ref “{x.reference}”</>}
                    </p>
                    <ul className="grid gap-x-6 sm:grid-cols-2">
                      {(p.ai_checks?.checks ?? []).map((c) => (
                        <li key={c.key} className="flex items-start gap-2 px-3 py-1.5 text-xs">
                          <ResultIcon result={c.result} />
                          <span className="shrink-0 text-muted-foreground">{CHECK_LABEL[c.key] ?? c.key}</span>
                          <span className="min-w-0">{c.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(p.ai_status === 'failed' || p.ai_status === 'skipped') && (
                  <p className="text-xs text-muted-foreground">
                    {AI_ERROR[p.ai_error ?? ''] ?? 'The automatic check did not complete. Open the receipt and review it yourself, or check again.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
      <ConfirmProofDialog
        proof={confirming}
        workspaceId={workspaceId}
        currency={currency}
        outstanding={outstanding}
        onClose={() => setConfirming(null)}
        onConfirmed={() => { setConfirming(null); void load(); onChanged(); }}
      />
    </Card>
  );
};
