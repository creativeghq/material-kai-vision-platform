/** Invoice Provider Registry */

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

// PAYMENT PROVIDERS — multi-provider registry
// Different from invoicing: multiple payment providers can coexist (an
// operator may take Stripe AND PayPal AND bank-transfer simultaneously and
// offer the customer a choice at checkout).

export interface PaymentProvider {
  /** Module slug. */
  slug: string;
  /** Human-readable name from the manifest. */
  name: string;
}

/** Resolve the payment providers available to the ACTIVE WORKSPACE. */
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

/** React hook: the payment providers the active workspace may actually offer. */
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
