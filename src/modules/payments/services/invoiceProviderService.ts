/**
 * Invoice Provider Registry
 *
 * The platform supports multiple invoice providers (built-in via the Payments
 * module, plus ERP integrations like Xero / QuickBooks / SAP). Only
 * ONE provider is active at any time.
 *
 * Discovery is **manifest-driven**: each ERP module declares
 *   `"provides": { "invoicing": true }` in its `manifest.json`.
 * The registry intersects the in-memory module list with the workspace's
 * enabled-modules set; the first match wins. Otherwise the built-in
 * Payments provider is active.
 *
 * To add a new ERP integration:
 *   1. Build the module as normal (folder under `src/modules/<slug>/`)
 *   2. In its `manifest.json`, set `"provides": { "invoicing": true }`
 *   3. Done — `useInvoiceProvider()` picks it up automatically when enabled.
 *      No SQL migration, no provider-list update, no IssueInvoiceButton edit.
 */

import { useMemo } from 'react';
import { registeredModules, useEnabledModules } from '@/modules/_core';
import { useEntitlements } from '@/hooks/useEntitlements';

export interface InvoiceProvider {
  /** Module slug. `'payments'` = the built-in fallback. */
  slug: string;
  /** Human-readable name from the manifest. */
  name: string;
  /** True when an ERP module wins; false for the built-in Payments provider. */
  isErp: boolean;
}

export const BUILT_IN_PROVIDER: InvoiceProvider = {
  slug: 'payments',
  name: 'Built-in (Payments)',
  isErp: false,
};

/**
 * Resolve the active invoice provider from a given set of enabled slugs.
 * Pure function — easy to unit test, no React or DB.
 */
export function resolveInvoiceProvider(enabledSlugs: ReadonlySet<string>): InvoiceProvider {
  const erpCandidates = registeredModules
    .filter(m => m.manifest.provides?.invoicing === true && enabledSlugs.has(m.manifest.slug))
    .sort((a, b) => a.manifest.slug.localeCompare(b.manifest.slug));

  if (erpCandidates.length > 0) {
    const winner = erpCandidates[0];
    return { slug: winner.manifest.slug, name: winner.manifest.name, isErp: true };
  }
  return BUILT_IN_PROVIDER;
}

/**
 * React hook: subscribe to the active invoice provider. Reads enabled modules
 * from the existing `useEnabledModules` hook (already cached via React Query),
 * so no extra DB roundtrip and no separate cache to invalidate.
 *
 * Returns `null` only briefly during the very first fetch of the enabled
 * modules list — callers can treat this as a loading state.
 */
export function useInvoiceProvider(): InvoiceProvider | null {
  const { rows, isLoading } = useEnabledModules();

  return useMemo(() => {
    if (isLoading && rows.length === 0) return null;
    const enabledSlugs = new Set(rows.filter(r => r.enabled).map(r => r.slug));
    return resolveInvoiceProvider(enabledSlugs);
  }, [rows, isLoading]);
}

/**
 * Deprecated: when the provider service was DB-backed it needed a cache to
 * invalidate. The hook now reads from `useEnabledModules` (React Query cached),
 * so toggling a module via `refreshModuleRegistry()` invalidates everything
 * automatically. Kept as a no-op for back-compat with existing callers.
 */
export function invalidateInvoiceProviderCache(): void {
  // no-op — see JSDoc above
}

// =====================================================
// PAYMENT PROVIDERS — multi-provider registry
// =====================================================
//
// Different from invoicing: multiple payment providers can coexist (an
// operator may take Stripe AND PayPal AND bank-transfer simultaneously and
// offer the customer a choice at checkout). So the API returns an array, not
// a single winner.

export interface PaymentProvider {
  /** Module slug. */
  slug: string;
  /** Human-readable name from the manifest. */
  name: string;
}

/**
 * Resolve the payment providers available to the ACTIVE WORKSPACE.
 *
 * TWO gates, both required (#273) — this is the same intersection
 * `useWorkspaceModuleNav` applies, and the same one the server-side
 * `_shared/payments/registry.ts` enforces:
 *
 *   1. `publishedSlugs` — `modules.enabled`, the operator's platform-wide
 *      catalog/kill-switch. Lets us pull a broken provider for everyone.
 *   2. `entitledSlugs`  — the workspace's own grant (`workspace_module_entitlements`,
 *      written when the owner clicks Enable).
 *
 * Checking only (1) — which this function used to do — meant ANY tenant seeing a
 * provider implied EVERY tenant saw it, because `modules.enabled` is global. On a
 * payments surface that is a tenant-isolation break, not a cosmetic bug.
 *
 * Pure function — easy to unit test. Sorted by slug for deterministic ordering.
 */
export function resolvePaymentProviders(
  publishedSlugs: ReadonlySet<string>,
  entitledSlugs: ReadonlySet<string>,
): PaymentProvider[] {
  return registeredModules
    .filter(m =>
      m.manifest.provides?.payments === true &&
      publishedSlugs.has(m.manifest.slug) &&
      entitledSlugs.has(m.manifest.slug))
    .map(m => ({ slug: m.manifest.slug, name: m.manifest.name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * React hook: the payment providers the active workspace may actually offer.
 *
 * Returns an empty array while loading or when none is enabled — call sites should
 * treat empty as "no checkout possible; the owner must enable a provider in
 * Finance → Settings → Payments".
 *
 * NOTE this answers "is this provider ENABLED for the tenant", not "is it CONNECTED".
 * Credential readiness is provider-specific and resolved server-side; a customer-facing
 * surface must additionally require `configured` from the edge function rather than
 * offering a method that cannot charge.
 */
export function useActivePaymentProviders(): PaymentProvider[] {
  const { rows } = useEnabledModules();
  const { availableSlugs, loading } = useEntitlements();

  return useMemo(() => {
    // Don't resolve mid-flight: an empty entitlement set during the first fetch would
    // read as "nothing available" and flash a spurious "no providers" empty state.
    if (loading) return [];
    const published = new Set(rows.filter(r => r.enabled).map(r => r.slug));
    return resolvePaymentProviders(published, availableSlugs);
  }, [rows, availableSlugs, loading]);
}
