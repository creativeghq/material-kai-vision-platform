import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, ArrowRight, AlertCircle, KeyRound, Key, Layers, CreditCard, Users } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Switch } from '@/components/core/ui/switch';
import { Tabs, TabsContent } from '@/components/core/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { registeredModules, useEnabledModules, refreshModuleRegistry, groupByParent } from '@/modules/_core';
import { invalidateInvoiceProviderCache } from '@/modules/payments/services/invoiceProviderService';
import { MIVAA_API_URL } from '@/config/mivaa';
import { ModuleBillingDialog } from './ModuleBillingDialog';
import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { ModuleSubscribersPanel } from '@/components/Admin/OperationsDashboard/ModuleSubscribersPanel';
import { PlansPanel } from '@/components/Admin/Platform/PlansPanel';
import { SecretsManagerCard } from '@/components/Admin/Secrets/SecretsManagerCard';
import { ApiGatewayAdmin } from '@/components/Admin/ApiGatewayAdmin';
import { formatAddonPrice } from '@/services/moduleActivationService';

interface BillingInfo {
  is_addon: boolean;
  addon_price_cents: number | null;
  addon_currency: string | null;
  /** Mirrored Stripe price interval — without it a yearly add-on renders as "/mo". */
  billing_interval: 'month' | 'year' | null;
}

async function invalidateMivaaCache(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  try {
    await fetch(`${MIVAA_API_URL}/api/v1/modules/_invalidate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort: backend will pick up the change within 5 minutes via TTL.
  }
}

const TIER_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  free: 'secondary',
  pro: 'default',
  enterprise: 'outline',
};

const ModulesCatalogPanel: React.FC = () => {
  const { toast } = useToast();
  const { rows, isLoading } = useEnabledModules();
  const [updating, setUpdating] = useState<string | null>(null);
  const [billing, setBilling] = useState<Map<string, BillingInfo>>(new Map());
  const [billingSlug, setBillingSlug] = useState<string | null>(null);

  const loadBilling = React.useCallback(async () => {
    const { data } = await supabase.from('modules').select('*');
    const map = new Map<string, BillingInfo>();
    for (const r of (data ?? []) as (BillingInfo & { slug: string })[]) {
      map.set(r.slug, {
        is_addon: !!r.is_addon,
        addon_price_cents: r.addon_price_cents,
        addon_currency: r.addon_currency,
        billing_interval: r.billing_interval,
      });
    }
    setBilling(map);
  }, []);

  useEffect(() => { void loadBilling(); }, [loadBilling]);

  const enabledMap = useMemo(
    () => new Map(rows.map((row) => [row.slug, row.enabled])),
    [rows],
  );

  const registeredSlugs = useMemo(
    () => new Set(registeredModules.map((m) => m.manifest.slug)),
    [],
  );

  const orphanedRows = rows.filter((row) => !registeredSlugs.has(row.slug));

  // Group sub-modules (manifest.parent set) UNDER their parent instead of as loose tiles —
  // same derivation the tenant storefront uses (`groupByParent`).
  const { topLevel: topLevelModules, childrenByParent } = useMemo(
    () => groupByParent(registeredModules, (m) => m.manifest.slug),
    [],
  );

  const handleToggle = async (slug: string, next: boolean) => {
    setUpdating(slug);
    const { error } = await supabase
      .from('modules')
      .update({ enabled: next })
      .eq('slug', slug);

    if (error) {
      toast({
        title: 'Could not update module',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      // Drop the invoice-provider cache so any visible IssueInvoiceButton /
      // the ERP provider button re-resolves on the next render (otherwise the
      // 30s TTL keeps the previous provider visible after toggling an ERP module).
      invalidateInvoiceProviderCache();
      await Promise.all([refreshModuleRegistry(), invalidateMivaaCache()]);
      toast({
        title: next ? 'Module enabled' : 'Module disabled',
        description: slug,
      });
    }
    setUpdating(null);
  };

  return (
    <div>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Enabling a module publishes it to the catalog — every workspace owner can then activate or purchase it from Profile → Modules. Toggles take effect immediately.
        </p>
        {orphanedRows.length > 0 && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <CardTitle>Unregistered Modules in Database</CardTitle>
                  <CardDescription>
                    {orphanedRows.length} module row{orphanedRows.length === 1 ? '' : 's'} in the database
                    {' '}have no matching folder under <code>src/modules/</code>:
                    {' '}
                    {orphanedRows.map((r) => r.slug).join(', ')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {registeredModules.length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No modules registered. Drop a folder under <code>src/modules/&lt;slug&gt;/</code> with
                {' '}<code>manifest.json</code> and <code>index.ts</code> to add one.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topLevelModules.map(({ manifest, routes }) => {
            const isRegistered = enabledMap.has(manifest.slug);
            const enabled = enabledMap.get(manifest.slug) ?? false;
            const primaryRoute = routes[0]?.path;
            const bill = billing.get(manifest.slug);
            const addonPrice = bill?.is_addon ? formatAddonPrice(bill.addon_price_cents, bill.addon_currency, bill.billing_interval) : null;
            const children = childrenByParent.get(manifest.slug) ?? [];

            return (
              <Card key={manifest.slug} className="dashboard-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <CardTitle>{manifest.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      {bill?.is_addon && (
                        <Badge variant="outline" className="gap-1">
                          <CreditCard className="h-3 w-3" />{addonPrice ?? 'Add-on'}
                        </Badge>
                      )}
                      <Badge variant={TIER_VARIANT[manifest.priceTier] ?? 'secondary'}>
                        {manifest.priceTier}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>{manifest.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {isRegistered ? (enabled ? 'Published' : 'Unpublished') : 'Not in DB'}
                      </span>
                      <Switch
                        checked={enabled}
                        disabled={!isRegistered || updating === manifest.slug}
                        onCheckedChange={(next) => handleToggle(manifest.slug, next)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {enabled && (
                        <Button size="sm" variant="ghost" className="gap-1" title="Add-on billing"
                          onClick={() => setBillingSlug(manifest.slug)}>
                          <CreditCard className="h-3 w-3" />
                        </Button>
                      )}
                      {enabled && (
                        <Button asChild size="sm" variant="ghost" className="gap-1" title="Module settings (API keys)">
                          <Link to={`/admin/modules/${manifest.slug}/settings`}>
                            <KeyRound className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                      {enabled && primaryRoute && (
                        <Button asChild size="sm" variant="outline" className="gap-1">
                          <Link to={primaryRoute}>
                            Open
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">{manifest.category}</span>
                    <span>·</span>
                    <span>v{manifest.version}</span>
                  </div>

                  {/* Sub-modules / add-ons grouped under their parent (payments-*, real-estate-*, …). */}
                  {children.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Add-ons</div>
                      <div className="space-y-1.5">
                        {children.map((child) => {
                          const cEnabled = enabledMap.get(child.manifest.slug) ?? false;
                          const cReg = enabledMap.has(child.manifest.slug);
                          const cBill = billing.get(child.manifest.slug);
                          const cPrice = cBill?.is_addon ? formatAddonPrice(cBill.addon_price_cents, cBill.addon_currency, cBill.billing_interval) : null;
                          return (
                            <div key={child.manifest.slug} className="flex items-center gap-2 rounded-md bg-white/5 px-2.5 py-1.5">
                              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium">{child.manifest.name}</span>
                                  {cPrice && <Badge variant="outline" className="gap-1 text-[10px]"><CreditCard className="h-2.5 w-2.5" />{cPrice}</Badge>}
                                </div>
                              </div>
                              <Switch
                                checked={cEnabled}
                                disabled={!cReg || updating === child.manifest.slug}
                                onCheckedChange={(next) => handleToggle(child.manifest.slug, next)}
                              />
                              {cEnabled && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Add-on billing" onClick={() => setBillingSlug(child.manifest.slug)}>
                                  <CreditCard className="h-3 w-3" />
                                </Button>
                              )}
                              {cEnabled && (
                                <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Module settings">
                                  <Link to={`/admin/modules/${child.manifest.slug}/settings`}><KeyRound className="h-3 w-3" /></Link>
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {billingSlug && (
        <ModuleBillingDialog
          slug={billingSlug}
          name={registeredModules.find((m) => m.manifest.slug === billingSlug)?.manifest.name ?? billingSlug}
          open={!!billingSlug}
          onOpenChange={(o) => { if (!o) setBillingSlug(null); }}
          onSaved={() => { void loadBilling(); }}
        />
      )}
    </div>
  );
};

const PLATFORM_TABS: HubTabItem[] = [
  { id: 'modules', label: 'Modules', icon: Package },
  { id: 'subscribers', label: 'Subscribers', icon: Users },
  { id: 'plans', label: 'Plans', icon: Layers },
  { id: 'platform-keys', label: 'Platform Keys', icon: KeyRound },
  { id: 'api-keys', label: 'API Keys', icon: Key },
];
const PLATFORM_TAB_IDS = new Set(PLATFORM_TABS.map((t) => t.id));

const ModulesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab') ?? '';
  const active = PLATFORM_TAB_IDS.has(requested) ? requested : 'modules';

  const select = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'modules') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Platform"
        subtitle="What the platform sells and how it is reached: modules and who subscribes to them, plan tiers and limits, platform secrets, and partner API keys."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Platform' }]}
      >
        <HubTabNav items={PLATFORM_TABS} activeId={active} onSelect={select} aria-label="Platform sections" />
      </PageHeader>

      <Tabs value={active} onValueChange={select} className="p-3 sm:p-6">
        <TabsContent value="modules" className="mt-0"><ModulesCatalogPanel /></TabsContent>
        <TabsContent value="subscribers" className="mt-0"><ModuleSubscribersPanel /></TabsContent>
        <TabsContent value="plans" className="mt-0"><PlansPanel /></TabsContent>
        <TabsContent value="platform-keys" className="mt-0">
          <SecretsManagerCard
            scope={{ mode: 'platform' }}
            title="Platform Secret Keys"
            description="Secrets not tied to a single module: AI providers, payments, push and cron. An environment variable always wins; a value here is used only when it is unset. Module-specific keys live in each module's own Settings."
          />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-0"><ApiGatewayAdmin embedded /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ModulesPage;
