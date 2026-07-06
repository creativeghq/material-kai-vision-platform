// #251 module framework — client for owner self-serve module activation + add-on billing.
// The workspace OWNER activates/purchases optional modules from Profile → Modules.
//
// Free (plan-covered) path and paid (Stripe add-on) path both go through the
// `stripe-api` edge function's `activate-module` action, which decides which
// applies and either grants the entitlement or returns a Stripe checkout URL.
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
export function tierRank(tier: string | null | undefined): number {
  return TIER_RANK[(tier || '').toLowerCase()] ?? 999;
}

/** A published module row incl. the #251 add-on/catalog columns (not yet in generated types). */
export interface ModuleCatalogRow {
  slug: string;
  name: string;
  description: string | null;
  summary: string | null;
  long_description: string | null;
  category: string | null;
  price_tier: string | null;
  icon: string | null;
  enabled: boolean;
  is_addon: boolean;
  addon_price_cents: number | null;
  addon_currency: string | null;
  addon_stripe_price_id: string | null;
  screenshot_url: string | null;
}

export interface ActivateResult {
  activated?: boolean;
  free?: boolean;
  already?: boolean;
  checkout_url?: string;
  module?: string;
}

/** All published (enabled) modules with their add-on pricing/catalog fields. */
export async function fetchModuleCatalog(): Promise<ModuleCatalogRow[]> {
  const { data, error } = await supabase.from('modules').select('*').eq('enabled', true);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ModuleCatalogRow[];
}

/** Slugs the active workspace has an explicit ENABLED entitlement row for. */
export async function fetchActivatedSlugs(workspaceId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('workspace_module_entitlements')
    .select('module_slug, enabled')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).filter((r) => r.enabled).map((r) => r.module_slug));
}

/**
 * Activate a module for a workspace. Owner-only (enforced server-side). Returns either an
 * `activated` result (free / plan-covered) or a `checkout_url` for the paid add-on flow —
 * the caller should redirect to it.
 */
export async function activateModule(workspaceId: string, moduleSlug: string): Promise<ActivateResult> {
  const origin = window.location.origin;
  const { data, error } = await supabase.functions.invoke('stripe-api', {
    body: {
      action: 'activate-module',
      workspace_id: workspaceId,
      module_slug: moduleSlug,
      successUrl: `${origin}/profile?tab=modules&activated=${moduleSlug}`,
      cancelUrl: `${origin}/profile?tab=modules`,
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  return (data ?? {}) as ActivateResult;
}

/**
 * A non-owner member asks the workspace owner to activate a module. Notifies the owner via
 * the Flows engine (bell). Owner resolution + delivery happen server-side.
 */
export async function requestModule(
  workspaceId: string,
  moduleSlug: string,
): Promise<{ requested: boolean; notified: number }> {
  const { data, error } = await supabase.functions.invoke('stripe-api', {
    body: { action: 'request-module', workspace_id: workspaceId, module_slug: moduleSlug },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  return (data ?? { requested: false, notified: 0 }) as { requested: boolean; notified: number };
}

/** Deactivate a module. Cancels the Stripe add-on at period end, or turns off a free entitlement. */
export async function deactivateModule(
  workspaceId: string,
  moduleSlug: string,
): Promise<{ status?: string; deactivated?: boolean }> {
  const { data, error } = await supabase.functions.invoke('stripe-api', {
    body: { action: 'deactivate-module', workspace_id: workspaceId, module_slug: moduleSlug },
  });
  if (error) throw new Error(await edgeErrorMessage(error));
  return (data ?? {}) as { status?: string; deactivated?: boolean };
}

/** Format an add-on price like "€19/mo" from cents + currency. */
export function formatAddonPrice(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  const symbol = (currency || 'eur').toLowerCase() === 'eur' ? '€'
    : (currency || '').toLowerCase() === 'usd' ? '$' : `${(currency || '').toUpperCase()} `;
  const amount = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `${symbol}${amount}/mo`;
}
