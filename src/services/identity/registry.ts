import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';
import { validateVatViaVies } from '@/services/viesService';
import { researchCompany, summarizeResearch } from '@/modules/crm/services/companyResearch';
import type { IdentityLookupArgs, IdentityLookupResult, IdentityProviderId } from './types';
import { providerFor, providersFor, countryLabel, IDENTITY_PROVIDERS } from './providers';

/**
 * The network half of the identity-provider registry (#329).
 *
 * Callers ask which authority answers for a country; nothing outside this module branches on a
 * country code to decide WHERE to verify. Adding a country's registry is one adapter plus one
 * entry in `providers.ts` — no call-site changes.
 */

export { providerFor, providersFor, countryLabel, IDENTITY_PROVIDERS };
export type { IdentityLookupResult, IdentityLookupArgs } from './types';

/**
 * ΑΑΔΕ (Greece) — goes through the shared research chain (ΑΑΔΕ → ΓΕΜΗ → business research), the
 * same routine the CRM records and the Expenses-inbox "Add issuer to CRM" already run.
 */
async function lookupViaAade(
  { countryCode, vatNumber, name, workspaceId, companyId, onProgress }: IdentityLookupArgs,
): Promise<IdentityLookupResult> {
  const checkedAt = new Date().toISOString();
  const res = await researchCompany({
    vatNumber, countryCode, name: name || undefined,
    workspaceId, companyId, reason: 'crm_enrichment', onProgress,
  });
  if (!res.ok) {
    return {
      valid: null, provider: 'aade', checkedAt,
      skippedReason: 'unreachable', message: summarizeResearch(res.steps),
    };
  }
  const fields: Record<string, unknown> = {
    ...res.fields, vat_number: vatNumber, country_code: countryCode.toUpperCase(),
  };
  return {
    valid: true,
    provider: 'aade',
    legalName: (fields.vat_validated_name as string) ?? res.resolvedName ?? null,
    address: (fields.vat_validated_address as string) ?? null,
    fields,
    message: summarizeResearch(res.steps),
    checkedAt,
  };
}

/**
 * VIES (EU-wide) — name and address only, answered in the member state's own script. The Latin
 * transliteration is carried through as a readability aid, never as a trading name.
 */
async function lookupViaVies(
  { countryCode, vatNumber, companyId, workspaceId }: IdentityLookupArgs,
): Promise<IdentityLookupResult> {
  const cc = countryCode.trim().toUpperCase();
  // `workspaceId` was dropped here while the AADE adapter beside it passed it through — so the
  // VIES path could neither scope its cache write nor record a validation receipt (#353 CRM-7).
  const res = await validateVatViaVies({ countryCode: cc, vatNumber, companyId, workspaceId });

  if (res.valid === null) {
    return {
      valid: null, provider: 'vies', checkedAt: res.checked_at,
      skippedReason: res.skipped_reason === 'non_eu' ? 'unsupported_country' : 'unreachable',
      message: res.message,
    };
  }
  if (res.valid !== true) {
    return {
      valid: false, provider: 'vies', checkedAt: res.checked_at,
      message: 'VIES does not recognise this number for the given country.',
    };
  }

  const legal = res.legal_name ?? res.name ?? null;
  const adr = res.address_parsed;
  // The column patch is built HERE, not in the component. Every adapter returning the same
  // `fields` shape is what lets callers stay provider-agnostic; left in the UI, the caller would
  // still have to know which provider it had just called.
  return {
    valid: true,
    provider: 'vies',
    legalName: legal,
    legalNameLatin: res.legal_name_latin ?? null,
    address: res.address ?? null,
    checkedAt: res.checked_at,
    fields: {
      name: legal ?? '',
      vat_number: vatNumber,
      country_code: cc,
      country: VAT_COUNTRY_OPTIONS.find((o) => o.code === cc)?.name ?? null,
      state: adr?.state ?? null,
      address: res.address ?? null,
      street: adr?.street ?? null,
      street_number: adr?.street_number ?? null,
      postal_code: adr?.postal_code ?? null,
      city: adr?.city ?? null,
      vat_validated: true,
      vat_validated_at: res.checked_at,
      vat_validated_name: legal,
      vat_validated_address: res.address ?? null,
      vat_validated_name_latin: res.legal_name_latin ?? null,
      vat_validated_address_latin: res.address_latin ?? null,
      vat_validation_source: 'vies',
    },
  };
}

/** Typed as a full Record, so adding a provider id without an adapter is a compile error. */
const LOOKUPS: Record<IdentityProviderId, (args: IdentityLookupArgs) => Promise<IdentityLookupResult>> = {
  aade: lookupViaAade,
  vies: lookupViaVies,
};

/**
 * Look a business up with whichever authority covers its country.
 *
 * "No provider" comes back as a RESULT, not a thrown error or a silent no-op — the caller can
 * tell the operator that the country has no registry to ask, which is a real answer and the thing
 * the old `else` branch could only express as a shrug.
 */
export async function lookupBusinessIdentity(args: IdentityLookupArgs): Promise<IdentityLookupResult> {
  const cc = args.countryCode.trim().toUpperCase();
  const provider = providerFor(cc);
  const checkedAt = new Date().toISOString();

  if (!provider) {
    return {
      valid: null, provider: 'vies', checkedAt,
      skippedReason: 'unsupported_country',
      message: `${countryLabel(cc)} has no business registry we can query — fill the details in manually.`,
    };
  }

  if (provider.looksWellFormed && !provider.looksWellFormed(args.vatNumber, cc)) {
    return {
      valid: null, provider: provider.id, checkedAt,
      skippedReason: 'bad_input',
      message: `That does not look like a valid ${provider.label} number for ${countryLabel(cc)}.`,
    };
  }

  return LOOKUPS[provider.id]({ ...args, countryCode: cc });
}
