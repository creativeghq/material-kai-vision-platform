import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, CreditCard, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { MoneyInput } from '@/components/core/ui/money-input';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';

// Public, no-auth payment page reached from email links, "Pay now" buttons and the
// public quote page. It VIEWS the document first (number, who it's for, what's due,
// deposit terms) and only creates a Stripe Checkout session once the payer picks an
// amount — the amount is always re-validated + clamped server-side.
interface PayInfo {
  invoice_id: string;
  internal_number: string;
  customer_display: string;
  currency: string;
  is_pre_invoice: boolean;
  total: number;
  amount_due: number;
  deposit_pct: number | null;
  deposit_amount: number | null;
  min_amount: number;
  max_amount: number;
}

const PayInvoicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const status = search.get('status'); // 'success' | 'cancelled' (redirect-back from Stripe)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'deposit' | 'full' | 'custom'>('full');
  const [custom, setCustom] = useState<number | null>(null);

  // Load the document + payable options. No session, no side effects.
  useEffect(() => {
    if (!token || status) { setLoading(false); return; }
    void (async () => {
      try {
        const res = await financeService.resolvePayToken(token, { infoOnly: true });
        if (res.error) { setError(res.error); return; }
        if (res.already_paid) { setAlreadyPaid(true); return; }
        const next: PayInfo = {
          invoice_id: res.invoice_id!,
          internal_number: res.internal_number ?? '',
          customer_display: res.customer_display ?? '',
          currency: res.currency ?? 'EUR',
          is_pre_invoice: !!res.is_pre_invoice,
          total: Number(res.total ?? 0),
          amount_due: Number(res.amount_due ?? 0),
          deposit_pct: res.deposit_pct ?? null,
          deposit_amount: res.deposit_amount ?? null,
          min_amount: Number(res.min_amount ?? 0),
          max_amount: Number(res.max_amount ?? 0),
        };
        setInfo(next);
        setChoice(next.deposit_amount != null ? 'deposit' : 'full');
        setCustom(next.deposit_amount ?? next.amount_due);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to resolve payment link');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, status]);

  const chosenAmount = (): number | undefined => {
    if (!info) return undefined;
    if (choice === 'full') return info.amount_due;
    if (choice === 'deposit') return info.deposit_amount ?? info.amount_due;
    return custom ?? undefined;
  };

  const pay = async () => {
    if (!token || !info) return;
    const amount = chosenAmount();
    if (amount == null || !Number.isFinite(amount)) { setError('Enter an amount to pay.'); return; }
    if (amount < info.min_amount - 0.005) {
      setError(`The minimum payable right now is ${formatMoney(info.min_amount, info.currency)}.`);
      return;
    }
    if (amount > info.amount_due + 0.005) {
      setError(`That's more than the ${formatMoney(info.amount_due, info.currency)} outstanding.`);
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const res = await financeService.resolvePayToken(token, {
        amount,
        successUrl: `${window.location.origin}/pay/${token}?status=success`,
        cancelUrl: `${window.location.origin}/pay/${token}?status=cancelled`,
      });
      if (res.error) { setError(res.error); return; }
      if (res.checkout_url) window.location.href = res.checkout_url;
      else setError('Could not start the checkout.');
    } catch (err: any) {
      setError(err?.message ?? 'Could not start the checkout.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="dashboard-card w-full max-w-md border-0">
        <CardContent className="p-8">{children}</CardContent>
      </Card>
    </div>
  );

  if (status === 'success') {
    return shell(
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold">Payment received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you. A receipt will be emailed to you, and the seller sees this within a minute.
        </p>
      </div>,
    );
  }

  if (status === 'cancelled') {
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Payment cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">You closed the checkout window. Nothing was charged.</p>
        <Button className="mt-6 rounded-full" onClick={() => window.location.assign(`/pay/${token}`)}>
          <CreditCard className="h-4 w-4 mr-2" /> Try again
        </Button>
      </div>,
    );
  }

  if (loading) {
    return shell(
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading payment details…</p>
      </div>,
    );
  }

  if (alreadyPaid) {
    return shell(
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold">Already paid</h1>
        <p className="mt-2 text-sm text-muted-foreground">This document has no outstanding balance.</p>
      </div>,
    );
  }

  if (error && !info) {
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Payment unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>,
    );
  }

  if (!info) return shell(null);

  const partPaid = info.total > 0 && info.amount_due < info.total - 0.005;
  const canDeposit = info.deposit_amount != null;

  return shell(
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">
            {info.is_pre_invoice ? 'Pre-invoice' : 'Invoice'} {info.internal_number}
          </h1>
          {info.customer_display && (
            <p className="text-xs text-muted-foreground">For {info.customer_display}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/60 divide-y divide-border/60 text-sm">
        <div className="flex justify-between px-3 py-2">
          <span className="text-muted-foreground">Document total</span>
          <span className="tabular-nums">{formatMoney(info.total, info.currency)}</span>
        </div>
        {partPaid && (
          <div className="flex justify-between px-3 py-2">
            <span className="text-muted-foreground">Already paid</span>
            <span className="tabular-nums">− {formatMoney(info.total - info.amount_due, info.currency)}</span>
          </div>
        )}
        <div className="flex justify-between px-3 py-2 font-semibold">
          <span>Outstanding</span>
          <span className="tabular-nums">{formatMoney(info.amount_due, info.currency)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">How much would you like to pay?</Label>
        <div className="grid gap-2">
          {canDeposit && (
            <button
              type="button"
              onClick={() => setChoice('deposit')}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'deposit' ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/40'}`}
            >
              <span>Deposit {info.deposit_pct != null && <span className="text-muted-foreground">({info.deposit_pct}%)</span>}</span>
              <span className="tabular-nums font-medium">{formatMoney(info.deposit_amount!, info.currency)}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setChoice('full')}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'full' ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/40'}`}
          >
            <span>Pay in full</span>
            <span className="tabular-nums font-medium">{formatMoney(info.amount_due, info.currency)}</span>
          </button>
          <button
            type="button"
            onClick={() => setChoice('custom')}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'custom' ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/40'}`}
          >
            <span>Another amount</span>
            {choice === 'custom' && (
              <span onClick={(e) => e.stopPropagation()} className="w-32">
                <MoneyInput className="h-8 text-right text-sm" value={custom} onValueChange={setCustom} />
              </span>
            )}
          </button>
        </div>
        {info.min_amount > 0 && info.min_amount < info.amount_due - 0.005 && (
          <p className="text-[11px] text-muted-foreground">
            Minimum payable now: {formatMoney(info.min_amount, info.currency)}.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button className="w-full rounded-full" onClick={pay} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
        Pay {formatMoney(chosenAmount() ?? 0, info.currency)}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Secure payment via Stripe. You&apos;ll be redirected to complete it.
      </p>
    </div>,
  );
};

export default PayInvoicePage;
