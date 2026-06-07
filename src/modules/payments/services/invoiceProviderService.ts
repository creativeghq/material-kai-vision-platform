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
 * Resolve the currently-enabled payment providers from a given set of enabled
 * slugs. Pure function — easy to unit test. Sorted alphabetically by slug for
 * deterministic ordering.
 */
export function resolvePaymentProviders(enabledSlugs: ReadonlySet<string>): PaymentProvider[] {
  return registeredModules
    .filter(m => m.manifest.provides?.payments === true && enabledSlugs.has(m.manifest.slug))
    .map(m => ({ slug: m.manifest.slug, name: m.manifest.name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * React hook: subscribe to the active payment providers. Returns an empty
 * array while loading or when no provider is enabled (call sites should treat
 * empty as "no checkout possible — admin must enable a provider").
 */
export function useActivePaymentProviders(): PaymentProvider[] {
  const { rows } = useEnabledModules();

  return useMemo(() => {
    const enabledSlugs = new Set(rows.filter(r => r.enabled).map(r => r.slug));
    return resolvePaymentProviders(enabledSlugs);
  }, [rows]);
}
