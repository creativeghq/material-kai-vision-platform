/**
 * Business-identity validation, as a provider interface rather than an `if` (#329).
 *
 * The platform used to decide where to verify a VAT number with a hardcoded branch:
 * Greek ΑΦΜ → ΑΑΔΕ, else in the EU → VIES, else "fill it in manually". That reads as
 * country-neutral until you try to add a country: VIES is EU-only, so every non-EU business is
 * unverifiable by construction, and the branch is duplicated wherever a VAT gets checked.
 *
 * A provider declares which countries it can answer for. Callers ask the registry, never the
 * country. Adding a country's registry becomes one adapter and one line in the registry — no
 * caller changes, and "no provider for XX" becomes a real, explainable answer instead of a
 * fallthrough.
 *
 * `id` doubles as the value written to `crm_companies.vat_validation_source`, so the row records
 * WHICH authority verified it — 'aade' and 'vies' are not interchangeable claims.
 */

export type IdentityProviderId = 'aade' | 'vies';

/** Normalized shape every adapter returns, whatever its upstream looks like. */
export interface IdentityLookupResult {
  /** true = the authority recognises it, false = it does not, null = we could not ask. */
  valid: boolean | null;
  provider: IdentityProviderId;
  /** Registered legal name, in the registry's own script. */
  legalName?: string | null;
  /** Latin transliteration when the registry answers in another script. A readability aid only. */
  legalNameLatin?: string | null;
  address?: string | null;
  /** Column patch for `crm_companies`, ready to write or prefill. */
  fields?: Record<string, unknown>;
  /** Set when we deliberately did not ask, or could not. */
  skippedReason?: 'unsupported_country' | 'unreachable' | 'bad_input';
  message?: string;
  checkedAt: string;
}

export interface IdentityLookupArgs {
  countryCode: string;
  vatNumber: string;
  /** Free-text name, when the caller has one — some adapters use it to disambiguate. */
  name?: string;
  workspaceId?: string;
  /** When set, the adapter may cache its answer onto that CRM row. */
  companyId?: string;
  onProgress?: (line: string) => void;
}

export interface IdentityProvider {
  id: IdentityProviderId;
  /** Shown in the UI: "verified via ΑΑΔΕ". */
  label: string;
  /**
   * Which countries this provider answers for. `'*'` means "any country" — reserved for a future
   * global provider; the registry treats a specific match as stronger than a wildcard.
   */
  countries: readonly string[] | '*';
  /**
   * Higher wins when more than one provider covers a country. ΑΑΔΕ outranks VIES for Greece: both
   * can answer, but ΑΑΔΕ returns the full registry record (ΚΑΔ, ΔΟΥ, legal form) where VIES
   * returns only name and address.
   */
  priority: number;
  /**
   * True when the provider's own lookup already runs the full enrichment chain, so the caller
   * must NOT run it again. Expressed as a capability rather than `if (provider.id === 'aade')`,
   * which is the branch this whole registry exists to remove.
   */
  enrichesAutomatically?: boolean;
  /** Cheap local check — length, checksum, format — before spending a network call. */
  looksWellFormed?(vatNumber: string, countryCode: string): boolean;
  lookup(args: IdentityLookupArgs): Promise<IdentityLookupResult>;
}
