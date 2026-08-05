// Tenant-facing payment-providers surface for Finance → Settings → Payments.
// Fixes the gap where provider submodules were only reachable under /admin: here a tenant sees
// every `provides.payments` add-on, enables the ones they want (each independently priced), and
// configures their own merchant account in-place. Mirrors the admin ProvidersPanel but is
// entitlement-aware (upsell when off) and renders the provider's own config panel in a dialog.
import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Landmark, Sliders, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { lazyWithRetry as lazy } from '@/utils/lazyWithRetry';
import { registeredModules } from '@/modules/_core';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { fetchModuleCatalog, activateModule, requestModule, formatAddonPrice, type ModuleCatalogRow } from '@/services/moduleActivationService';

// Each provider ships its own self-contained config panel (resolves the active workspace itself).
const PROVIDER_PANELS: Record<string, React.ComponentType<{ embedded?: boolean }>> = {
  'payments-stripe': lazy(() => import('@/modules/payments-stripe/components/StripeConfigPanel').then((m) => ({ default: m.StripeConfigPanel }))),
  'payments-viva': lazy(() => import('@/modules/payments-viva/components/VivaSettingsPanel').then((m) => ({ default: m.VivaSettingsPanel }))),
  'banking-revolut': lazy(() => import('@/modules/banking-revolut/components/RevolutSettingsPanel').then((m) => ({ default: m.RevolutSettingsPanel }))),
  'payments-revolut': lazy(() => import('@/modules/payments-revolut/components/RevolutMerchantSettingsPanel').then((m) => ({ default: m.RevolutMerchantSettingsPanel }))),
};

export const PaymentProvidersCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { isModuleAvailable, loading } = useEntitlements();
  const { workspaceRole } = useWorkspace();
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<Map<string, ModuleCatalogRow>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<{ slug: string; name: string } | null>(null);
  const canActivate = workspaceRole === 'owner';

  useEffect(() => {
    fetchModuleCatalog().then((rows) => setCatalog(new Map(rows.map((r) => [r.slug, r])))).catch(() => {});
  }, []);

  const providers = useMemo(() =>
    registeredModules
      .filter((m) => m.manifest.provides?.payments === true)
      .map((m) => ({ slug: m.manifest.slug, name: m.manifest.name, description: m.manifest.description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  []);

  // Bank connections (provides.banking) are the workspace's OWN accounts — read/reconcile/
  // treasury. Listed below the checkout providers with the same enable/configure mechanics,
  // but never offered as a way for a buyer to pay.
  const bankConnections = useMemo(() =>
    registeredModules
      .filter((m) => m.manifest.provides?.banking === true)
      .map((m) => ({ slug: m.manifest.slug, name: m.manifest.name, description: m.manifest.description }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  []);

  const enable = async (slug: string, name: string) => {
    setBusy(slug);
    try {
      if (canActivate) {
        const r = await activateModule(workspaceId, slug);
        if (r.checkout_url) { window.location.href = r.checkout_url; return; }
        toast({ title: `${name} enabled`, description: 'Reloading…' });
        setTimeout(() => window.location.reload(), 600);
      } else {
        const r = await requestModule(workspaceId, slug);
        toast({ title: 'Request sent', description: r.notified > 0 ? 'The workspace owner has been notified.' : 'Saved.' });
      }
    } catch (e) { toast({ title: 'Could not enable', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const PanelComp = configuring ? PROVIDER_PANELS[configuring.slug] : null;

  const renderRow = (p: { slug: string; name: string; description: string }, icon: React.ReactNode) => {
    const entitled = isModuleAvailable(p.slug);
    const cat = catalog.get(p.slug);
    const price = cat ? formatAddonPrice(cat.addon_price_cents, cat.addon_currency, cat.billing_interval) : null;
    return (
      <div key={p.slug} className="flex items-center gap-4 px-5 py-3.5">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{p.name}</span>
            {entitled
              ? <span className={`inline-flex items-center text-[10px] capitalize ${statusTone('enabled')}`}><CheckCircle2 className="mr-1 h-3 w-3" />Enabled</span>
              : price ? <Badge className="rounded-full border-0 bg-muted text-[10px]">{price}</Badge> : null}
          </div>
          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : entitled
            ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => setConfiguring({ slug: p.slug, name: p.name })}><Sliders className="mr-1.5 h-3.5 w-3.5" /> Configure</Button>
            : <Button size="sm" className="rounded-full" onClick={() => enable(p.slug, p.name)} disabled={busy === p.slug}>
                {busy === p.slug ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {canActivate ? (price ? `Enable · ${price}` : 'Enable') : 'Request'}
              </Button>}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Payment providers</CardTitle>
          <CardDescription className="text-xs">Accept card &amp; bank payments from your customers on invoices. Each provider is a separate add-on — enable the ones you want and connect your own merchant account.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {providers.map((p) => renderRow(p, <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />))}
          </div>
          {bankConnections.length > 0 && (
            <>
              <div className="border-t border-border/60 bg-muted/30 px-5 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Landmark className="h-3.5 w-3.5" /> Bank connections</div>
                <div className="text-[11px] text-muted-foreground">Your own business bank accounts — live balances, transaction feed and reconciliation. Not a checkout method.</div>
              </div>
              <div className="divide-y divide-border">
                {bankConnections.map((p) => renderRow(p, <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!configuring} onOpenChange={(o) => !o && setConfiguring(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{configuring?.name} configuration</DialogTitle></DialogHeader>
          {PanelComp && (
            <React.Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
              <PanelComp embedded />
            </React.Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
