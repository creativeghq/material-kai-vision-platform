import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import type { IdentityProviderId } from './types';

/**
 * The pure half of the identity-provider registry (#329) — who covers which country, and which
 * one wins. No network, no Supabase client, no React.
 *
 * Split from `registry.ts` for the same reason `companyIdentity.ts` was split from its component:
 * the adapters import the Supabase client, which throws on import in the node test environment.
 * The rules worth guarding are all here, so `tests/unit/identityProviderRegistry.test.ts` can
 * reach them.
 */

export interface IdentityProviderMeta {
  id: IdentityProviderId;
  /** Shown in the UI: "verified via ΑΑΔΕ". */
  label: string;
  /** Countries this provider answers for. `'*'` = any (reserved for a future global provider). */
  countries: readonly string[] | '*';
  /**
   * Higher wins when more than one provider covers a country. ΑΑΔΕ outranks VIES for Greece:
   * both can answer, but ΑΑΔΕ returns the full registry record (ΚΑΔ, ΔΟΥ, legal form, ΓΕΜΗ)
   * where VIES returns only name and address.
   */
  priority: number;
  /**
   * True when the provider's own lookup already runs the full enrichment chain, so the caller
   * must not run it again. A capability rather than `if (provider.id === 'aade')` — that branch
   * is what this registry exists to remove.
   */
  enrichesAutomatically?: boolean;
  /** Cheap local check — length, checksum, format — before spending a network call. */
  looksWellFormed?(vatNumber: string, countryCode: string): boolean;
}

/** Every EU member state, derived from the one country list rather than re-listed here. */
const EU_COUNTRIES: readonly string[] = VAT_COUNTRY_OPTIONS.filter((o) => o.eu).map((o) => o.code);

export const AADE_PROVIDER: IdentityProviderMeta = {
  id: 'aade',
  label: 'ΑΑΔΕ',
  // 'EL' is the fiscal prefix used on VAT numbers; 'GR' is the ISO code. Both must resolve —
  // callers get country codes from both conventions.
  countries: ['EL', 'GR'],
  priority: 100,
  enrichesAutomatically: true,
  // A Greek ΑΦΜ is exactly 9 digits. Checking locally avoids a pointless SOAP round trip AND a
  // TAXISnet audit entry — ΑΑΔΕ writes one into the looked-up business's inbox on every call.
  looksWellFormed: (vat) => vat.replace(/\D/g, '').length === 9,
};

export const VIES_PROVIDER: IdentityProviderMeta = {
  id: 'vies',
  label: 'VIES',
  countries: EU_COUNTRIES,
  priority: 50,
};

/** Registration order is irrelevant — resolution is by country support, then priority. */
export const IDENTITY_PROVIDERS: readonly IdentityProviderMeta[] = [AADE_PROVIDER, VIES_PROVIDER];

/** Every provider that can answer for this country, strongest first. */
export function providersFor(countryCode: string): IdentityProviderMeta[] {
  const cc = countryCode.trim().toUpperCase();
  if (!cc) return [];
  return IDENTITY_PROVIDERS
    .filter((p) => p.countries === '*' || p.countries.includes(cc))
    // A specific country match beats a wildcard provider regardless of priority: a registry that
    // actually covers the country knows more than a global fallback ever will.
    .sort((a, b) => {
      const aSpecific = a.countries !== '*' ? 1 : 0;
      const bSpecific = b.countries !== '*' ? 1 : 0;
      return bSpecific - aSpecific || b.priority - a.priority;
    });
}

/** The provider that should answer for this country, or null when none covers it. */
export function providerFor(countryCode: string): IdentityProviderMeta | null {
  return providersFor(countryCode)[0] ?? null;
}

/** Human-readable country name for messages, falling back to the raw code. */
export function countryLabel(countryCode: string): string {
  const cc = countryCode.trim().toUpperCase();
  return VAT_COUNTRY_OPTIONS.find((o) => o.code === cc)?.name ?? cc;
}
