/**
 * Payment Providers panel — lists every enabled module with
 * `provides.payments=true`. Mounted on /admin/modules/payments/settings → Providers.
 *
 * Today: Stripe (via payments-stripe module).
 * Future: PayPal / Adyen / Viva / bank-transfer / ERPs that bring native payment
 * processing — each declares `provides: { payments: true }` in its manifest and
 * appears here automatically. No code change in this panel needed.
 *
 * Multi-provider by design — admins may operate several simultaneously and
 * offer the customer a choice at checkout. Different from `useInvoiceProvider`
 * (single winner).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  ExternalLink,
  Sliders,
  AlertCircle,
  Package,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useActivePaymentProviders } from '../services/invoiceProviderService';

interface Props { embedded?: boolean }

export const ProvidersPanel: React.FC<Props> = (_props) => {
  const providers = useActivePaymentProviders();

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="font-light flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Active Payment Providers
          </CardTitle>
          <CardDescription>
            Every module that declares <code>provides: {'{'} payments: true {'}'}</code> in its
            manifest and is enabled at <Link to="/admin/modules" className="text-primary underline">/admin/modules</Link>{' '}
            appears here. Each one is configured at its own Settings page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <AlertCircle className="h-8 w-8 text-warning mx-auto" />
              <p className="text-sm font-medium">No payment providers are enabled.</p>
              <p className="text-xs text-muted-foreground">
                Subscriptions, credit purchases, and invoice payment all require at least one
                enabled provider. Stripe is the platform's default — enable it at{' '}
                <Link to="/admin/modules" className="text-primary underline">/admin/modules</Link>.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/modules">
                  <Package className="h-4 w-4 mr-2" />
                  Open modules
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {providers.map(p => (
                <li key={p.slug} className="py-3 flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.slug}</p>
                  </div>
                  {/* This panel only knows the provider is published + entitled — NOT whether its
                      credentials/webhook are set up. Say "Available" (not "Active") so an operator
                      doesn't believe it's collecting money before Configure is completed. */}
                  <span className="inline-flex items-center text-xs text-muted-foreground">
                    Available — configure to go live
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/admin/modules/${p.slug}/settings`}>
                      <Sliders className="h-3.5 w-3.5 mr-1" />
                      Configure
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="font-light">Adding a New Payment Provider</CardTitle>
          <CardDescription>
            Each provider is its own module under <code>src/modules/payments-&lt;slug&gt;/</code>. To add one:
            create the folder with a manifest declaring <code>provides: {'{'} payments: true {'}'}</code>,
            add provider-specific edge functions + secrets (scoped to the new module slug via{' '}
            <code>platform_secrets.primary_module_slug</code>), and ship. It auto-appears in this
            list and on the modules page — no code change in the Payments parent module needed.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
};
