// #251 — Profile → Modules. The workspace OWNER activates / purchases optional modules here.
// Free (plan-covered) modules activate instantly; add-ons redirect to Stripe checkout.
//
// This is the ONLY module storefront — the standalone /apps page was folded in here and now
// redirects. Modules are grouped into the same Hubs the top-bar App Launcher uses, carry the same
// icons + copy (see `resolveModuleMeta`), and each card states what it costs and what happens if
// you click. Filter pills jump straight to what's available to add vs. what's already running.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Sparkles, Send, ArrowRight, Lock, Coins } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { registeredModules, refreshModuleRegistry } from '@/modules/_core';
import { SIDEBAR_NAV_ITEMS, type Hub } from '@/config/nav-items';
import { resolveModuleMeta, hubOrder, type ModuleMeta } from '@/config/module-catalog-meta';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  fetchModuleCatalog,
  fetchActivatedSlugs,
  fetchModuleSubscriptions,
  activateModule,
  deactivateModule,
  requestModule,
  formatAddonPrice,
  tierRank,
  type ModuleCatalogRow,
  type ModuleSubscriptionRow,
} from '@/services/moduleActivationService';

/** "21 Aug 2026" — the renewal/cancellation date a cost line has to state to be honest. */
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Tenant-facing modules to list here: registered modules that expose a workspace launcher entry
// (Docs, …), the business surfaces moved into the App Launcher (surface:'app' with a moduleSlug —
// CRM, Finance, Quotes, Projects, Inbox, HR), plus any purchasable add-on. This is what makes
// ALL active modules show up, not only add-ons.
const tenantFacingSlugs = new Set<string>([
  ...registeredModules
    .filter((m) => m.navItems.some((n) => n.location === 'workspace'))
    .map((m) => m.manifest.slug),
  ...SIDEBAR_NAV_ITEMS
    .filter((i) => i.surface === 'app' && i.moduleSlug)
    .map((i) => i.moduleSlug as string),
]);

type Filter = 'all' | 'active' | 'available';

/** A catalog row joined with its resolved presentation meta + entitlement state. */
interface ModuleTile {
  row: ModuleCatalogRow;
  meta: ModuleMeta;
  /** Covered by the current plan tier (no activation needed). */
  covered: boolean;
  /** Explicitly entitled to this workspace, or otherwise available. */
  isActivated: boolean;
  hasIt: boolean;
  /** Purchasable right now (published add-on with a Stripe product). */
  purchasable: boolean;
  price: string | null;
  /** Live Stripe subscription for this add-on, when the workspace has one. */
  sub?: ModuleSubscriptionRow;
}

export const ModulesActivationTab: React.FC = () => {
  const { activeWorkspaceId, workspaceRole, isPlatformOperator } = useWorkspace();
  const { planLevel, planName, availableSlugs, loading: entLoading } = useEntitlements();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [catalog, setCatalog] = useState<ModuleCatalogRow[]>([]);
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [subs, setSubs] = useState<Map<string, ModuleSubscriptionRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  /** Module pending cancellation confirmation — the dialog states the end date before acting. */
  const [confirmCancel, setConfirmCancel] = useState<ModuleTile | null>(null);

  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [cat, act, sub] = await Promise.all([
        fetchModuleCatalog(),
        fetchActivatedSlugs(activeWorkspaceId),
        fetchModuleSubscriptions(activeWorkspaceId),
      ]);
      setCatalog(cat);
      setActivated(act);
      setSubs(sub);
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
  // workspace launcher entry, joined with their presentation meta + entitlement state.
  const tiles = useMemo<ModuleTile[]>(
    () => catalog
      .filter((m) => m.is_addon || tenantFacingSlugs.has(m.slug))
      .map((row) => {
        const covered = planLevel >= tierRank(row.price_tier);
        const isActivated = activated.has(row.slug) || availableSlugs.has(row.slug);
        return {
          row,
          meta: resolveModuleMeta(row.slug, row),
          covered,
          isActivated,
          hasIt: covered || isActivated,
          purchasable: !!row.is_addon && !!row.addon_stripe_product_id,
          price: formatAddonPrice(row.addon_price_cents, row.addon_currency, row.billing_interval),
          sub: subs.get(row.slug),
        };
      })
      .sort((a, b) => a.row.name.localeCompare(b.row.name)),
    [catalog, planLevel, activated, availableSlugs, subs],
  );

  const counts = useMemo(() => ({
    all: tiles.length,
    active: tiles.filter((t) => t.hasIt).length,
    available: tiles.filter((t) => !t.hasIt).length,
  }), [tiles]);

  // Group the filtered tiles by Hub, preserving the launcher's Hub order.
  const groups = useMemo(() => {
    const visible = tiles.filter((t) => filter === 'all' || (filter === 'active' ? t.hasIt : !t.hasIt));
    const byHub = new Map<string, { label: string; hub: Hub | null; tiles: ModuleTile[]; order: number }>();
    for (const t of visible) {
      const key = t.meta.hub?.id ?? '__more__';
      const entry = byHub.get(key) ?? {
        label: t.meta.hub?.label ?? 'Platform & integrations',
        hub: t.meta.hub,
        tiles: [],
        order: hubOrder(t.meta.hub?.id ?? null),
      };
      entry.tiles.push(t);
      byHub.set(key, entry);
    }
    return [...byHub.values()].sort((a, b) => a.order - b.order);
  }, [tiles, filter]);

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
            : 'Request recorded, but no workspace owner is available to notify.',
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

  const filterPill = (id: Filter, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        filter === id
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  const renderTile = (t: ModuleTile) => {
    const { row: m, meta, covered, isActivated, hasIt, purchasable, price, sub } = t;
    const Icon = meta.icon;
    const isBusy = busy === m.slug;
    const periodEnd = formatDate(sub?.current_period_end);
    const canceling = sub?.status === 'canceling' || sub?.status === 'cancelling';

    // ── Cost line (bottom-left): what this actually costs, and what happens next. Driven by the
    //    live Stripe subscription row so a cancelled-but-still-running add-on says so. ──
    let status: React.ReactNode;
    if (covered) {
      status = <span className="text-xs text-muted-foreground">Included in {planName}</span>;
    } else if (hasIt && canceling) {
      status = (
        <span className="text-xs text-amber-500">
          Cancels{periodEnd ? ` ${periodEnd}` : ' at period end'} — active until then
        </span>
      );
    } else if (hasIt && sub?.status === 'past_due') {
      status = <span className="text-xs text-destructive">Payment failed — update your card</span>;
    } else if (hasIt && sub) {
      status = (
        <span className="text-xs text-emerald-500">
          {price ?? 'Add-on'}{periodEnd ? ` · renews ${periodEnd}` : ''}
        </span>
      );
    } else if (hasIt) {
      status = <span className="text-xs text-emerald-500">Active add-on{price ? ` · ${price}` : ''}</span>;
    } else if (purchasable) {
      status = <span className="text-xs text-muted-foreground">Add-on{price ? ` · ${price}` : ''}</span>;
    } else {
      const tierLabel = (m.price_tier || 'a higher').replace(/^\w/, (c) => c.toUpperCase());
      status = (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> {tierLabel} plan
        </span>
      );
    }

    // ── Action (bottom-right). ──
    let action: React.ReactNode;
    if (hasIt) {
      // Cancelling is destructive + billing-affecting → confirm with the end date first.
      const cancel = isOwner && isActivated && m.is_addon && !covered && !canceling ? (
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={isBusy} onClick={() => setConfirmCancel(t)}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
        </Button>
      ) : null;
      action = (
        <div className="flex items-center gap-1">
          {cancel}
          {meta.path && (
            <Button size="sm" variant="outline" asChild>
              <Link to={meta.path}>Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
      );
    } else if (isOwner) {
      action = purchasable ? (
        <Button size="sm" disabled={isBusy} onClick={() => handleActivate(m)}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 h-4 w-4" /> Add{price ? ` · ${price}` : ''}</>}
        </Button>
      ) : (
        <Button size="sm" variant="outline" asChild>
          <a href="/profile?tab=subscription">Upgrade plan</a>
        </Button>
      );
    } else {
      action = requested.has(m.slug) ? (
        <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> Requested</Badge>
      ) : (
        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => handleRequest(m)}>
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1 h-4 w-4" /> Request</>}
        </Button>
      );
    }

    return (
      <Card
        key={m.slug}
        className={cn(
          'h-full transition-colors',
          hasIt ? 'border-primary/25' : 'hover:border-foreground/20',
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              'shrink-0 rounded-lg p-2',
              hasIt ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate font-medium">{m.name}</div>
                {hasIt ? (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                  </Badge>
                ) : price ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">{price}</Badge>
                ) : null}
              </div>
              {meta.description && (
                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{meta.description}</p>
              )}
              {/* Credit disclosure — a subscription fee is not the whole cost for metered modules. */}
              {m.consumes_credits && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Coins className="h-3 w-3 shrink-0 text-amber-500" />
                  <span className="truncate">{m.credit_note || 'Also uses credits per operation'}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            {status}
            {action}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-semibold">Modules</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isOwner ? (
              <>Everything you can run in this workspace, grouped the same way as your Hubs.
              You're on <span className="font-medium text-foreground">{planName}</span> — modules it
              covers switch on for free, the rest are monthly add-ons you can cancel any time.</>
            ) : (
              <>Everything this workspace can run. You can request a module — the workspace owner is
              notified and decides.</>
            )}
          </p>
        </div>
      </div>

      {(loading || entLoading) ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
        </div>
      ) : tiles.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          No optional modules are published yet. Check back soon.
        </CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {filterPill('all', 'All', counts.all)}
            {filterPill('active', 'Active', counts.active)}
            {filterPill('available', 'Available to add', counts.available)}
          </div>

          {groups.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              {filter === 'available'
                ? 'Nothing left to add — every module available on your plan is already on.'
                : 'No modules match this filter yet.'}
            </CardContent></Card>
          ) : groups.map((g) => {
            const HubIcon = g.hub?.icon;
            return (
              <section key={g.label} className="space-y-3">
                {/* Headline: [icon] Hub ───────────── [count] — same rule-line as the App Launcher. */}
                <div className="flex items-center gap-2">
                  {HubIcon ? <HubIcon className="h-4 w-4 shrink-0 text-primary" /> : null}
                  <h3 className="shrink-0 text-base font-semibold">{g.label}</h3>
                  <span className="h-px flex-1 bg-muted" />
                  <span className="shrink-0 text-xs text-muted-foreground">{g.tiles.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.tiles.map(renderTile)}
                </div>
              </section>
            );
          })}
        </>
      )}

      {/* Unsubscribe confirmation — states the exact end date, because cancelling does NOT cut
          access immediately (Stripe cancels at period end and the webhook revokes on delete). */}
      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => { if (!o) setConfirmCancel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {confirmCancel?.row.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const end = formatDate(confirmCancel?.sub?.current_period_end);
                return end
                  ? `Billing stops at the end of the current period. ${confirmCancel?.row.name} stays available until ${end}, then turns off for everyone in this workspace.`
                  : `Billing stops at the end of the current period. ${confirmCancel?.row.name ?? 'The module'} stays available until then, then turns off for everyone in this workspace.`;
              })()}
              {' '}Your data is kept — you can re-activate later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirmCancel;
                setConfirmCancel(null);
                if (target) void handleDeactivate(target.row);
              }}
            >
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
