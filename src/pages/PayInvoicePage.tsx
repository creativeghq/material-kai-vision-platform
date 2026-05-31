import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';

// Public, no-auth invoice payment page reached from email links / "Pay now" buttons.
// Resolves the pay_token server-side, mints a Stripe Checkout session, redirects.
const PayInvoicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const status = search.get('status'); // 'success' | 'cancelled' (set on redirect-back from Stripe)
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<{
    invoice_id: string;
    internal_number: string;
    amount: number;
    currency: string;
    customer_display: string;
    already_paid?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Peek at the token to render details before charging
  useEffect(() => {
    if (!token || status) return;
    void (async () => {
      try {
        const res = await financeService.resolvePayToken(token, {
          // dry-run: we'll let user click "Pay now" before actually creating a checkout session
          // The edge function returns checkout_url on every call — for prefetch we just want the meta.
          // (The amount we read here is what'll be charged.)
          successUrl: window.location.origin + `/pay/${token}?status=success`,
          cancelUrl: window.location.origin + `/pay/${token}?status=cancelled`,
        });
        if (res.error) { setError(res.error); return; }
        if (res.already_paid) { setResolved({ invoice_id: res.invoice_id!, internal_number: '', amount: 0, currency: 'EUR', customer_display: '', already_paid: true }); return; }
        if (!res.checkout_url) { setError('Could not create a payment session.'); return; }
        setResolved({
          invoice_id: res.invoice_id!,
          internal_number: res.internal_number!,
          amount: res.amount!,
          currency: res.currency!,
          customer_display: res.customer_display ?? '',
        });
        // Auto-redirect to Stripe Checkout immediately.
        window.location.href = res.checkout_url;
      } catch (err: any) {
        setError(err?.message ?? 'Failed to resolve payment link');
      }
    })();
  }, [token, status]);

  const retry = async () => {
    if (!token) return;
    try {
      setBusy(true);
      setError(null);
      const res = await financeService.resolvePayToken(token, {
        successUrl: window.location.origin + `/pay/${token}?status=success`,
        cancelUrl: window.location.origin + `/pay/${token}?status=cancelled`,
      });
      if (res.error) { setError(res.error); return; }
      if (res.checkout_url) window.location.href = res.checkout_url;
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="dashboard-card w-full max-w-md border-0">
        <CardContent className="p-8 text-center">
          {status === 'success' ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h1 className="mt-4 text-xl font-semibold">Payment received</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Thank you. The seller will see this within a minute and may send a receipt.
              </p>
            </>
          ) : status === 'cancelled' ? (
            <>
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <h1 className="mt-4 text-xl font-semibold">Payment cancelled</h1>
              <p className="mt-2 text-sm text-muted-foreground">You closed the checkout window. Nothing was charged.</p>
              <Button onClick={retry} className="mt-6" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Try again
              </Button>
            </>
          ) : error ? (
            <>
              <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 text-xl font-semibold">Payment unavailable</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </>
          ) : resolved?.already_paid ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h1 className="mt-4 text-xl font-semibold">Already paid</h1>
              <p className="mt-2 text-sm text-muted-foreground">This invoice has no outstanding balance.</p>
            </>
          ) : resolved ? (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <h1 className="mt-4 text-lg font-semibold">Redirecting to secure checkout…</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Invoice <span className="font-mono">{resolved.internal_number}</span> — {formatMoney(resolved.amount, resolved.currency)}
              </p>
              {resolved.customer_display && (
                <p className="mt-1 text-xs text-muted-foreground">For: {resolved.customer_display}</p>
              )}
              <Button onClick={retry} variant="outline" size="sm" className="mt-6">If you're not redirected, click here</Button>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Loading payment details…</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PayInvoicePage;
