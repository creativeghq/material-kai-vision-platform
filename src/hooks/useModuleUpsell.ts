/**
 * Shared module-upsell logic — the ONE place that turns "workspace lacks module X" into an
 * actionable upsell (owner → Buy/Stripe checkout, member → request from owner, plan path).
 *
 * Extracted from EntitlementGuard so BOTH the full-page route guard (EntitlementGuard) and the
 * inline cross-module tab gate (ModuleTabGate) share identical availability + buy/request behavior.
 * Do not re-implement this per surface — that's exactly the copy-paste this consolidates.
 *
 * `available` fails OPEN while loading (mirrors useEntitlements) so paid surfaces don't flash a
 * lock for a frame. The API/route (`assertEntitled`) remains the real boundary.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import {
  fetchModuleCatalog, activateModule, requestModule, formatAddonPrice, type ModuleCatalogRow,
} from '@/services/moduleActivationService';

export interface ModuleUpsell {
  /** True once entitlements have loaded and the workspace does NOT have the module. */
  loading: boolean;
  available: boolean;
  /** Catalog row (name/summary/price) — loaded lazily only while the upsell is showing. */
  mod: ModuleCatalogRow | null;
  /** Human label for the module (catalog name → provided fallback → slug). */
  label: string;
  /** Formatted add-on price ("€19/mo") or null when plan-covered / unpriced. */
  price: string | null;
  tier: string | null;
  isOwner: boolean;
  /** True when the module is a purchasable add-on (has its own price), vs plan-tier-only. */
  purchasable: boolean;
  busy: 'buy' | 'request' | null;
  /** Owner buys the add-on → Stripe checkout redirect or immediate activation + reload. */
  onBuy: () => Promise<void>;
  /** Non-owner asks the workspace owner to enable it → Flows bell to the owner. */
  onRequest: () => Promise<void>;
}

export function useModuleUpsell(moduleSlug: string, moduleName?: string): ModuleUpsell {
  const { isModuleAvailable, tierOf, loading } = useEntitlements();
  const { activeWorkspaceId, workspaceRole, isPlatformOperator } = useWorkspace();
  const { toast } = useToast();

  const [mod, setMod] = useState<ModuleCatalogRow | null>(null);
  const [busy, setBusy] = useState<'buy' | 'request' | null>(null);

  const available = !loading && isModuleAvailable(moduleSlug);

  // Only pull the catalog row (price/name) when we're actually going to show the upsell.
  useEffect(() => {
    if (loading || available) return;
    let cancelled = false;
    fetchModuleCatalog()
      .then((cat) => { if (!cancelled) setMod(cat.find((m) => m.slug === moduleSlug) ?? null); })
      .catch(() => { /* upsell still renders without price */ });
    return () => { cancelled = true; };
  }, [loading, available, moduleSlug]);

  const isOwner = workspaceRole === 'owner' || isPlatformOperator;
  const purchasable = !!mod?.is_addon;
  const label = moduleName ?? mod?.name ?? moduleSlug;
  const price = mod?.is_addon
    ? formatAddonPrice(mod.addon_price_cents, mod.addon_currency, mod.billing_interval)
    : null;

  const onBuy = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setBusy('buy');
    try {
      const res = await activateModule(activeWorkspaceId, moduleSlug);
      if (res.checkout_url) { window.location.href = res.checkout_url; return; }
      if (res.activated) {
        toast({ title: 'Activated', description: `${label} is now available.` });
        window.location.reload();
        return;
      }
      toast({ title: 'Could not activate', description: 'Please try again.', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Could not activate', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [activeWorkspaceId, moduleSlug, label, toast]);

  const onRequest = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setBusy('request');
    try {
      await requestModule(activeWorkspaceId, moduleSlug);
      toast({ title: 'Request sent', description: `Your workspace owner has been asked to enable ${label}.` });
    } catch (e) {
      toast({ title: 'Could not send request', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [activeWorkspaceId, moduleSlug, label, toast]);

  return useMemo(
    () => ({ loading, available, mod, label, price, tier: tierOf(moduleSlug), isOwner, purchasable, busy, onBuy, onRequest }),
    [loading, available, mod, label, price, moduleSlug, isOwner, purchasable, busy, onBuy, onRequest],
  );
}
