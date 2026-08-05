/**
 * Payment provider registry + per-workspace resolution.
 *
 * A provider is usable by a workspace only when THREE things hold:
 *   1. **Published** — `modules.enabled` for `payments-<slug>`: the operator's
 *      platform-wide catalog/kill-switch (lets us disable a broken provider for
 *      everyone without touching tenants).
 *   2. **Entitled**  — `is_workspace_entitled(workspace, 'payments-<slug>')`: the
 *      tenant's own grant, written when the owner clicks Enable.
 *   3. **Configured** — the tenant actually connected the provider (credentials
 *      present). Derived, not a permission.
 *
 * (1) ∧ (2) is the load-bearing part. Checking only (1) — which is what the frontend
 * `resolvePaymentProviders` does today — means one tenant enabling a provider turns it
 * on for EVERY tenant. Checking only (2) would let a tenant keep using a provider the
 * operator has pulled. Both must hold, mirroring `useWorkspaceModuleNav`.
 *
 * (3) is reported rather than filtered by default, so the seller-facing settings UI can
 * say "entitled but not connected" instead of the provider silently vanishing.
 */

import { isWorkspaceEntitled } from '../entitlement.ts';
import { stripeProvider } from './stripe-provider.ts';
import { vivaProvider } from './viva-provider.ts';
import { revolutProvider } from './revolut-provider.ts';
import type { AvailableProvider, PaymentProvider, PaymentProviderSlug } from './types.ts';

const PROVIDERS: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
  viva: vivaProvider,
  revolut: revolutProvider,
};

export function getPaymentProvider(slug: string): PaymentProvider | null {
  return PROVIDERS[slug] ?? null;
}

/** `payments-stripe`, `payments-viva` — the module slug for a provider. */
export function moduleSlugFor(slug: PaymentProviderSlug): string {
  return `payments-${slug}`;
}

/** Which provider modules has the operator published platform-wide? */
async function publishedSlugs(supabase: any): Promise<Set<string>> {
  const wanted = Object.keys(PROVIDERS).map((s) => moduleSlugFor(s as PaymentProviderSlug));
  const { data, error } = await supabase
    .from('modules')
    .select('slug, enabled')
    .in('slug', wanted);
  if (error) {
    // Fail CLOSED: we are deciding who may take money. An unreadable catalog must not
    // silently widen the provider set.
    console.error('[payments/registry] modules read failed:', error.message || error);
    return new Set();
  }
  return new Set((data ?? []).filter((r: any) => r.enabled).map((r: any) => r.slug));
}

/**
 * Every payment provider available to this workspace, with its offered methods.
 *
 * @param opts.configuredOnly drop providers the tenant hasn't connected yet — use this
 *        on customer-facing surfaces (a buyer must never see a method that cannot charge).
 *        Leave false on seller-facing settings, which needs to show the unfinished ones.
 */
export async function resolveWorkspacePaymentProviders(
  supabase: any,
  workspaceId: string,
  opts: { configuredOnly?: boolean } = {},
): Promise<AvailableProvider[]> {
  const published = await publishedSlugs(supabase);

  const candidates = Object.values(PROVIDERS).filter((p) => published.has(moduleSlugFor(p.slug)));
  if (candidates.length === 0) return [];

  const resolved = await Promise.all(
    candidates.map(async (p) => {
      const entitled = await isWorkspaceEntitled(supabase, workspaceId, moduleSlugFor(p.slug));
      if (!entitled) return null;

      const ctx = await p.resolveContext(supabase, workspaceId).catch((err) => {
        console.error(`[payments/registry] ${p.slug} resolveContext threw:`, err);
        return null;
      });
      const configured = ctx !== null;
      if (opts.configuredOnly && !configured) return null;

      return {
        slug: p.slug,
        label: p.label,
        methods: enabledMethodsFor(p, ctx),
        configured,
      } as AvailableProvider;
    }),
  );

  return resolved
    .filter((r): r is AvailableProvider => r !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Methods actually offered = what the provider supports ∩ what the tenant ticked.
 * An empty/absent `methods` setting means "all of them" so a freshly-connected
 * provider works without extra configuration.
 */
function enabledMethodsFor(p: PaymentProvider, ctx: { credentials: Record<string, string> } | null) {
  const raw = ctx?.credentials?.__methods;
  if (!raw) return p.methods;
  const wanted = new Set(raw.split(',').map((m) => m.trim()).filter(Boolean));
  const intersect = p.methods.filter((m) => wanted.has(m));
  return intersect.length > 0 ? intersect : p.methods;
}

export type ChargeDispatch =
  | { ok: true; provider: PaymentProvider; ctx: Awaited<ReturnType<PaymentProvider['resolveContext']>> }
  | { ok: false; code: 'unknown_provider' | 'not_published' | 'not_entitled' | 'not_configured' | 'currency_unsupported'; error: string };

/**
 * Resolve ONE provider for an actual charge, re-checking every gate at the moment money
 * is about to move — never trusting a client-supplied provider slug.
 */
export async function dispatchToProvider(
  supabase: any,
  workspaceId: string,
  slug: string,
  currency: string,
): Promise<ChargeDispatch> {
  const provider = getPaymentProvider(slug);
  if (!provider) {
    return { ok: false, code: 'unknown_provider', error: `Unknown payment provider "${slug}".` };
  }

  const published = await publishedSlugs(supabase);
  if (!published.has(moduleSlugFor(provider.slug))) {
    return { ok: false, code: 'not_published', error: `${provider.label} is not available on this platform.` };
  }

  const entitled = await isWorkspaceEntitled(supabase, workspaceId, moduleSlugFor(provider.slug));
  if (!entitled) {
    return { ok: false, code: 'not_entitled', error: `${provider.label} is not enabled for this workspace.` };
  }

  if (provider.currencies && !provider.currencies.includes(currency.toUpperCase())) {
    return {
      ok: false,
      code: 'currency_unsupported',
      error: `${provider.label} cannot charge in ${currency.toUpperCase()}.`,
    };
  }

  const ctx = await provider.resolveContext(supabase, workspaceId);
  if (!ctx) {
    return {
      ok: false,
      code: 'not_configured',
      error: `${provider.label} is enabled but not connected yet — finish setup in Finance → Settings → Payments.`,
    };
  }

  return { ok: true, provider, ctx };
}
