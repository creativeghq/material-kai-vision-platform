/**
 * per-workspace payout routing. When a workspace connects its own Stripe
 * account (Express, via Connect), invoice payments are routed there as destination
 * charges; otherwise the platform collects.
 *
 * Mounted in Finance → Settings → Payments AND in Profile → Keys → Finance & Tax, because
 * "connect our Stripe account" is asked from both places. Both mounts are the same component
 * on purpose — the Keys entry used to be a status chip linking to `/finance`, which lands on
 * the Finance dashboard and offers nothing to click.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, CreditCard, ExternalLink, CheckCircle2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { paymentRoutingService, type PaymentConfig } from '@/services/paymentRoutingService';

export const PaymentRoutingCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    paymentRoutingService.getConfig(workspaceId).then(async (c) => {
      if (cancelled) return;
      setConfig(c);
      setLoading(false);
      // Landing back here straight from Stripe's hosted onboarding, the stored flags are still
      // the pre-onboarding ones until `account.updated` arrives. Ask Stripe once so a finished
      // onboarding doesn't sit reading "not connected" waiting on a webhook.
      if (c?.stripe_connect_account_id && !c.charges_enabled) {
        const s = await paymentRoutingService.refreshStatus(workspaceId).catch(() => null);
        if (!cancelled && s) {
          setConfig((prev) => prev && ({ ...prev, charges_enabled: s.charges_enabled, details_submitted: !!s.details_submitted }));
        }
      }
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [workspaceId]);

  const onboard = async () => {
    try {
      setBusy(true);
      // Come back to the page onboarding was STARTED from — this card has two mount points,
      // and a hardcoded /finance dropped anyone who started in Profile → Keys somewhere else.
      const { url } = await paymentRoutingService.onboard(workspaceId, window.location.href);
      window.location.href = url; // Stripe-hosted onboarding
    } catch (err: any) {
      toast({ title: 'Could not start onboarding', description: err?.message, variant: 'destructive' });
      setBusy(false);
    }
  };

  const refresh = async () => {
    try {
      setBusy(true);
      const s = await paymentRoutingService.refreshStatus(workspaceId);
      setConfig((c) => ({ ...(c ?? { payout_mode: 'connect', stripe_connect_account_id: null }), charges_enabled: s.charges_enabled, details_submitted: !!s.details_submitted } as PaymentConfig));
      toast({ title: s.charges_enabled ? 'Payouts active' : 'Onboarding incomplete' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const connected = config?.payout_mode === 'connect' && config?.charges_enabled;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payout Routing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Payments for this workspace go directly to your connected Stripe account.
              <Badge variant="secondary">Connect active</Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={busy}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              By default the platform collects invoice payments. Connect your own Stripe account to receive
              customer card payments directly (destination charges).
              {config?.stripe_connect_account_id && !config.charges_enabled && ' Onboarding started but not finished.'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={onboard} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                {config?.stripe_connect_account_id ? 'Continue Stripe onboarding' : 'Set up Stripe payouts'}
              </Button>
              {config?.stripe_connect_account_id && (
                <Button size="sm" variant="outline" onClick={refresh} disabled={busy}><RefreshCw className="h-4 w-4 mr-1" /> Refresh status</Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
