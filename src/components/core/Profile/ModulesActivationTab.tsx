// #251 — Profile → Modules. The workspace OWNER activates / purchases optional modules here.
// Free (plan-covered) modules activate instantly; add-ons redirect to Stripe checkout.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Sparkles, Send } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { registeredModules, refreshModuleRegistry } from '@/modules/_core';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  fetchModuleCatalog,
  fetchActivatedSlugs,
  activateModule,
  deactivateModule,
  requestModule,
  formatAddonPrice,
  tierRank,
  type ModuleCatalogRow,
} from '@/services/moduleActivationService';

/** Slugs of registered modules that surface in the workspace (App Launcher). */
const workspaceModuleSlugs = new Set(
  registeredModules
    .filter((m) => m.navItems.some((n) => n.location === 'workspace'))
    .map((m) => m.manifest.slug),
);

export const ModulesActivationTab: React.FC = () => {
  const { activeWorkspaceId, workspaceRole, isPlatformOperator } = useWorkspace();
  const { planLevel, planName, availableSlugs, loading: entLoading } = useEntitlements();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [catalog, setCatalog] = useState<ModuleCatalogRow[]>([]);
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [cat, act] = await Promise.all([
        fetchModuleCatalog(),
        fetchActivatedSlugs(activeWorkspaceId),
      ]);
      setCatalog(cat);
      setActivated(act);
    } catch (e) {
      toast({ title: 'Could not load modules', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  // Success toast when returning from a Stripe add-on checkout.
  useEffect(() => {
    const activatedSlug = searchParams.get('activated');
    if (activatedSlug) {
      toast({ title: 'Module activated', description: `${activatedSlug} is now available in your workspace.` });
      const next = new URLSearchParams(searchParams);
      next.delete('activated');
      setSearchParams(next, { replace: true });
      void refreshModuleRegistry();
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modules the owner can activate: published add-ons + published modules that surface a
  // workspace launcher entry.
  const rows = useMemo(
    () => catalog.filter((m) => m.is_addon || workspaceModuleSlugs.has(m.slug)),
    [catalog],
  );

  const handleActivate = async (m: ModuleCatalogRow) => {
    if (!activeWorkspaceId) return;
    setBusy(m.slug);
    try {
      const res = await activateModule(activeWorkspaceId, m.slug);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      toast({ title: 'Module activated', description: `${m.name} is now available.` });
      await refreshModuleRegistry();
      await load();
    } catch (e) {
      toast({ title: 'Activation failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleRequest = async (m: ModuleCatalogRow) => {
    if (!activeWorkspaceId) return;
    setBusy(m.slug);
    try {
      const res = await requestModule(activeWorkspaceId, m.slug);
      setRequested((prev) => new Set(prev).add(m.slug));
      toast({
        title: 'Request sent',
        description: res.deduped
          ? `You've already requested ${m.name} recently — the owner has been notified.`
          : res.notified > 0
            ? `The workspace owner has been notified about ${m.name}.`
            : `Request recorded, but no workspace owner is available to notify.`,
      });
    } catch (e) {
      toast({ title: 'Could not send request', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleDeactivate = async (m: ModuleCatalogRow) => {
    if (!activeWorkspaceId) return;
    setBusy(m.slug);
    try {
      const res = await deactivateModule(activeWorkspaceId, m.slug);
      toast({
        title: res.status === 'cancels_at_period_end' ? 'Cancellation scheduled' : 'Module deactivated',
        description: res.status === 'cancels_at_period_end'
          ? `${m.name} stays active until the end of the billing period.`
          : `${m.name} has been turned off.`,
      });
      await refreshModuleRegistry();
      await load();
    } catch (e) {
      toast({ title: 'Deactivation failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (!activeWorkspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage its modules.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">Modules</h2>
        <p className="text-sm text-muted-foreground">
          {isOwner ? (
            <>Activate optional modules for this workspace. Your plan is <span className="font-medium">{planName}</span> —
            modules it includes activate for free; others are available as monthly add-ons.</>
          ) : (
            <>Optional modules for this workspace. You can request activation — the workspace owner is notified and decides.</>
          )}
        </p>
      </div>

      {(loading || entLoading) ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground text-center">
          No optional modules are published yet. Check back soon.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((m) => {
            const covered = planLevel >= tierRank(m.price_tier);
            const isActivated = activated.has(m.slug) || availableSlugs.has(m.slug);
            const hasIt = covered || isActivated;
            const price = formatAddonPrice(m.addon_price_cents, m.addon_currency);

            let badge: React.ReactNode;
            let action: React.ReactNode = null;

            // Status badge is the same regardless of role.
            if (covered) {
              badge = <Badge variant="secondary">Included in {planName}</Badge>;
            } else if (hasIt) {
              badge = <Badge className="gap-1"><Check className="h-3 w-3" /> Active</Badge>;
            } else if (m.is_addon && m.addon_stripe_product_id) {
              badge = price ? <Badge variant="outline">{price}</Badge> : <Badge variant="outline">Add-on</Badge>;
            } else {
              const tierLabel = (m.price_tier || 'a higher').replace(/^\w/, (c) => c.toUpperCase());
              badge = <Badge variant="outline">Requires {tierLabel} plan</Badge>;
            }

            if (hasIt) {
              // Owner of an active add-on can cancel; everyone else just sees it's active.
              action = isOwner && isActivated && m.is_addon && !covered ? (
                <Button size="sm" variant="outline" disabled={busy === m.slug} onClick={() => handleDeactivate(m)}>
                  {busy === m.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
                </Button>
              ) : (
                <Badge className="gap-1"><Check className="h-3 w-3" /> Active</Badge>
              );
            } else if (isOwner) {
              action = m.is_addon && m.addon_stripe_product_id ? (
                <Button size="sm" disabled={busy === m.slug} onClick={() => handleActivate(m)}>
                  {busy === m.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Activate</>}
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <a href="/profile?tab=subscription">Upgrade</a>
                </Button>
              );
            } else {
              // Non-owner: request activation from the workspace owner.
              action = requested.has(m.slug) ? (
                <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> Requested</Badge>
              ) : (
                <Button size="sm" variant="outline" disabled={busy === m.slug} onClick={() => handleRequest(m)}>
                  {busy === m.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Request from Workspace Owner</>}
                </Button>
              );
            }

            return (
              <Card key={m.slug}>
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.name}</div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {m.summary || m.description || ''}
                      </p>
                    </div>
                    {badge}
                  </div>
                  <div className="mt-auto flex justify-end">{action}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
