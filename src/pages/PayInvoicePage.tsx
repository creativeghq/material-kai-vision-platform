import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, CreditCard, FileText, Landmark, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
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
  providers: ProviderOption[];
}

interface ProviderOption {
  slug: string;
  label: string;
  methods: Array<'card' | 'bank_reference'>;
}

/** One selectable way to pay = a (provider, method) pair. */
interface PayOption {
  key: string;
  provider: string;
  method: 'card' | 'bank_reference';
  label: string;
  hint: string;
}

function buildOptions(providers: ProviderOption[]): PayOption[] {
  const out: PayOption[] = [];
  for (const p of providers) {
    for (const m of p.methods) {
      // Revolut's hosted page fans out beyond cards (Revolut Pay, Apple/Google Pay,
      // Pay by Bank) — describing it as just "Card" would under-sell it.
      const isRevolut = p.slug === 'revolut';
      out.push({
        key: `${p.slug}:${m}`,
        provider: p.slug,
        method: m,
        label: m === 'card'
          ? (isRevolut ? 'Online payment — Revolut' : `Card — ${p.label}`)
          : `Bank transfer — ${p.label}`,
        hint: m === 'card'
          ? (isRevolut
            ? 'Card, Revolut Pay, Apple/Google Pay or Pay by Bank — on Revolut’s secure page.'
            : 'Pay now by card. You will be redirected to a secure page.')
          : 'Get a payment code to use in your banking app. No IBAN needed.',
      });
    }
  }
  return out;
}

const PayInvoicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const status = search.get('status'); // 'success' | 'cancelled' (redirect-back from the provider)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'deposit' | 'full' | 'custom'>('full');
  const [custom, setCustom] = useState<number | null>(null);
  const [option, setOption] = useState<string | null>(null);
  // Set when the buyer chose a bank-reference method: nothing to redirect to, we just
  // show them the code to quote in their banking app.
  const [codeCopied, setCodeCopied] = useState(false);
  const [bankRef, setBankRef] = useState<{ rf_code: string; amount: number; currency: string } | null>(null);

  // Load the document + payable options. No session, no side effects.
  // Also runs for status=return (a provider whose redirect fires on EVERY outcome —
  // Revolut): the server-resolved state decides what the buyer is told.
  useEffect(() => {
    if (!token || (status && status !== 'return' && status !== 'success')) { setLoading(false); return; }
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
          providers: (res.providers ?? []) as ProviderOption[],
        };
        setInfo(next);
        setChoice(next.deposit_amount != null ? 'deposit' : 'full');
        setCustom(next.deposit_amount ?? next.amount_due);
        // Preselect the first available way to pay, so a single-option seller behaves
        // exactly as before (one click → straight to checkout, no extra chooser step).
        const opts = buildOptions(next.providers);
        setOption(opts[0]?.key ?? null);
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
    const picked = buildOptions(info.providers).find((o) => o.key === option);
    try {
      setBusy(true);
      setError(null);
      const res = await financeService.resolvePayToken(token, {
        amount,
        provider: picked?.provider,
        method: picked?.method,
        successUrl: `${window.location.origin}/pay/${token}?status=success`,
        cancelUrl: `${window.location.origin}/pay/${token}?status=cancelled`,
      });
      if (res.error) { setError(res.error); return; }
      // Bank reference: no redirect — the buyer pays from their own banking app and
      // settlement reaches us later by webhook.
      if (res.payment_kind === 'bank_reference' && res.rf_code) {
        setBankRef({ rf_code: res.rf_code, amount, currency: info.currency });
        return;
      }
      if (res.checkout_url) {
        // Keep the button disabled through the navigation - a slow redirect must not
        // let an impatient double-click mint a second checkout session.
        window.location.href = res.checkout_url;
        return;
      }
      setError('Could not start the checkout.');
      setBusy(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not start the checkout.');
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0">
        <CardContent className="p-8">{children}</CardContent>
      </Card>
    </div>
  );

  // Provider return (status=success from Stripe/Viva, status=return from Revolut):
  // ONLY the server-verified state decides what we claim - a URL param is not a receipt.
  if ((status === 'return' || status === 'success') && !loading) {
    if (alreadyPaid) {
      return shell(
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-xl font-semibold">Payment received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you. A receipt will be emailed to you, and the seller sees this within a minute.
          </p>
        </div>,
      );
    }
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">Checking your payment…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If you completed the payment, it can take a moment to confirm — refresh this page shortly.
          If you cancelled or it failed, you can simply try again.
        </p>
        {info && (
          <p className="mt-2 text-xs text-muted-foreground">
            Outstanding right now: {formatMoney(info.amount_due, info.currency)}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => window.location.reload()}>Refresh</Button>
          <Button className="rounded-full" onClick={() => { window.location.href = `${window.location.origin}/pay/${token}`; }}>
            Try again
          </Button>
        </div>
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

  // Bank-reference result: the customer now goes to their own banking app. There is no
  // redirect and no "success" leg — the payment lands asynchronously.
  if (bankRef) {
    return shell(
      <div>
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">Pay by bank transfer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open your banking app, start a transfer of{' '}
            <strong>{formatMoney(bankRef.amount, bankRef.currency)}</strong>, and paste this code
            into the <strong>reference</strong> field. You don't need an IBAN.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment code</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider break-all">{bankRef.rf_code}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={() => { void navigator.clipboard.writeText(bankRef.rf_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2500); }}
          >
            <Copy className="h-3.5 w-3.5 mr-2" /> {codeCopied ? 'Copied!' : 'Copy code'}
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Transfer exactly this amount — banks reject a different one. Your invoice updates
          automatically once the transfer clears, usually within one business day.
        </p>
      </div>,
    );
  }

  if (alreadyPaid) {
    return shell(
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
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
  const payOptions = buildOptions(info.providers);
  const selected = payOptions.find((o) => o.key === option) ?? payOptions[0];

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
        <span id="pay-amount-label" className="text-xs font-medium">How much would you like to pay?</span>
        <div className="grid gap-2" role="radiogroup" aria-labelledby="pay-amount-label">
          {canDeposit && (
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'deposit'}
              onClick={() => setChoice('deposit')}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'deposit' ? 'border-primary bg-primary/10 font-medium' : 'border-border/60 hover:bg-muted/40'}`}
            >
              <span>Deposit {info.deposit_pct != null && <span className="text-muted-foreground">({info.deposit_pct}%)</span>}</span>
              <span className="tabular-nums font-medium">{formatMoney(info.deposit_amount!, info.currency)}</span>
            </button>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'full'}
            onClick={() => setChoice('full')}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'full' ? 'border-primary bg-primary/10 font-medium' : 'border-border/60 hover:bg-muted/40'}`}
          >
            <span>Pay in full</span>
            <span className="tabular-nums font-medium">{formatMoney(info.amount_due, info.currency)}</span>
          </button>
          <div
            role="radio"
            aria-checked={choice === 'custom'}
            tabIndex={0}
            onClick={() => setChoice('custom')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChoice('custom'); } }}
            className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition ${choice === 'custom' ? 'border-primary bg-primary/10 font-medium' : 'border-border/60 hover:bg-muted/40'}`}
          >
            <span>Another amount</span>
            {choice === 'custom' && (
              <span role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="w-32">
                <MoneyInput aria-label="Custom amount" className="h-8 text-right text-sm" value={custom} onValueChange={setCustom} onFocus={() => setChoice('custom')} />
              </span>
            )}
          </div>
        </div>
        {info.min_amount > 0 && info.min_amount < info.amount_due - 0.005 && (
          <p className="text-[11px] text-muted-foreground">
            Minimum payable now: {formatMoney(info.min_amount, info.currency)}.
          </p>
        )}
      </div>

      {/* Method chooser. Shown only when the seller genuinely offers more than one way
          to pay — a single-option seller keeps the original one-click flow. */}
      {payOptions.length > 1 && (
        <div className="space-y-2">
          <span id="pay-method-label" className="text-xs font-medium">How would you like to pay?</span>
          <div className="grid gap-2" role="radiogroup" aria-labelledby="pay-method-label">
            {payOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={option === o.key}
                onClick={() => setOption(o.key)}
                className={`rounded-lg border px-3 py-2 text-sm text-left transition ${option === o.key ? 'border-primary bg-primary/10 font-medium' : 'border-border/60 hover:bg-muted/40'}`}
              >
                <span className="flex items-center gap-2">
                  {o.method === 'card'
                    ? <CreditCard className="h-3.5 w-3.5 shrink-0" />
                    : <Landmark className="h-3.5 w-3.5 shrink-0" />}
                  {o.label}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {payOptions.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
          <p className="text-sm">Online payment isn&apos;t available yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The seller hasn&apos;t finished setting up a payment provider. Please contact
            them to arrange payment.
          </p>
        </div>
      ) : (
        <>
          <Button className="w-full rounded-full" onClick={pay} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : selected?.method === 'bank_reference'
                ? <Landmark className="h-4 w-4 mr-2" />
                : <CreditCard className="h-4 w-4 mr-2" />}
            {selected?.method === 'bank_reference'
              ? `Get a code for ${formatMoney(chosenAmount() ?? 0, info.currency)}`
              : `Pay ${formatMoney(chosenAmount() ?? 0, info.currency)}`}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            {selected?.method === 'bank_reference'
              ? `Secure payment via ${selected.label.split('—')[1]?.trim() || 'bank transfer'}. You'll get a code to use in your banking app.`
              : `Secure payment via ${selected?.label.split('—')[1]?.trim() || 'our provider'}. You'll be redirected to complete it.`}
          </p>
        </>
      )}
    </div>,
  );
};

export default PayInvoicePage;
