/**
 * Stripe configuration panel — mounted on /admin/modules/payments-stripe/settings.
 *
 * The Keys tab (auto-mounted by the generic ModuleSettingsPage) already shows
 * the Stripe API key + webhook secret via SecretsManagerCard — they're scoped
 * to this module via `platform_secrets.primary_module_slug='payments-stripe'`.
 *
 * This panel surfaces the non-secret config: webhook URL operators paste into
 * the Stripe Dashboard, quick links to Dashboard surfaces, and the env-var
 * names that hold product/price IDs.
 */
import React from 'react';
import { Copy, ExternalLink, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';

interface Props { embedded?: boolean }

export const StripeConfigPanel: React.FC<Props> = (_props) => {
  const { toast } = useToast();
  // Use the same var the whole app resolves the project URL from — Vite injects
  // `process.env.SUPABASE_URL` (from SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL);
  // `import.meta.env.VITE_SUPABASE_URL` is never populated in this project, so
  // reading it left the placeholder `<your-project>` host in the webhook URL.
  const supabaseUrl = (process.env.SUPABASE_URL as string | undefined) || '';
  const webhookUrl = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/stripe-webhooks`
    : 'https://<your-project>.supabase.co/functions/v1/stripe-webhooks';

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: `${label} copied` }),
      () => toast({ title: 'Copy failed', description: text, variant: 'destructive' }),
    );
  };

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base font-light flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Webhook
          </CardTitle>
          <CardDescription>
            Paste this URL into your Stripe Dashboard → Developers → Webhooks. Subscribe to:
            <code className="ml-1">payment_intent.succeeded</code>,
            <code className="ml-1">checkout.session.completed</code>,
            <code className="ml-1">customer.subscription.*</code>, and
            <code className="ml-1">invoice.payment_failed</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border">
            <code className="text-xs flex-1 truncate font-mono">{webhookUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(webhookUrl, 'Webhook URL')}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The <code>STRIPE_WEBHOOK_SECRET</code> (set on the Keys tab) is what verifies the
            payload signature — make sure the same secret is set in Stripe Dashboard.
          </p>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base font-light">Quick links</CardTitle>
          <CardDescription>
            Stripe Dashboard surfaces for the bits you can't configure inside the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://dashboard.stripe.com/products" target="_blank" rel="noopener noreferrer">
              Products & prices <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="https://dashboard.stripe.com/settings/account" target="_blank" rel="noopener noreferrer">
              Account + statement descriptor <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer">
              Webhooks <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="https://dashboard.stripe.com/settings/billing/portal" target="_blank" rel="noopener noreferrer">
              Customer portal config <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base font-light">Product / Price IDs</CardTitle>
          <CardDescription>
            Stripe product + price IDs are stored as platform secrets so they can be rotated
            without a redeploy. Edit them on the <strong>Keys</strong> tab:
            <code className="mx-1">STRIPE_CREDITS_PRODUCT_ID</code>,
            <code className="mx-1">STRIPE_PRO_PRICE_ID</code>,
            <code className="mx-1">STRIPE_ENTERPRISE_PRICE_ID</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
};
