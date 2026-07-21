import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { financeService } from '@/modules/finance/services/financeService';

/**
 * #273 — provider return leg.
 *
 * Viva cannot take a success/cancel URL per API call: it uses whatever is configured on
 * the payment SOURCE in the merchant's dashboard, and returns the customer with
 * `?t={transactionId}&s={orderCode}&lang=`. So every tenant points their source at THIS
 * one route, and we resolve the order code back to the right invoice's pay page.
 *
 * The order code is read as a raw STRING from the query — it is int64 and would lose its
 * last digits if it ever went through Number().
 *
 * We deliberately do not display payment status here: settlement is confirmed by webhook
 * (with a server-side read-back), not by the fact that a browser landed on this URL.
 */
const ProviderReturnPage: React.FC = () => {
  const [search] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const orderCode = search.get('s');
  const provider = search.get('provider') || 'viva';
  // Viva omits `t` on failed transactions — that's our only hint the attempt didn't work.
  const failed = !search.get('t');

  useEffect(() => {
    if (!orderCode) {
      setError('This return link is missing its order reference.');
      return;
    }
    void (async () => {
      try {
        const res = await financeService.resolveProviderOrder(orderCode, provider);
        if (!res.ok || !res.pay_token) {
          setError(res.error ?? 'We could not match this payment to an invoice.');
          return;
        }
        window.location.replace(
          `/pay/${res.pay_token}?status=${failed ? 'cancelled' : 'success'}`,
        );
      } catch (err: any) {
        setError(err?.message ?? 'We could not match this payment to an invoice.');
      }
    })();
  }, [orderCode, provider, failed]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="dashboard-card w-full max-w-md border-0">
        <CardContent className="p-8 text-center">
          {error ? (
            <>
              <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
              <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                If you completed a payment it is still safe — it will be reconciled
                automatically. Contact the seller if the invoice doesn&apos;t update.
              </p>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Confirming your payment…</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderReturnPage;
