/**
 * Which myDATA exemption cause a 0%-VAT line most likely needs.
 *
 * **This SUGGESTS; it never decides.** Novus and AADE validate the cause you send — neither
 * derives it — because picking it is a VAT-law determination that stays the issuer's legal
 * responsibility. So this produces a default for the operator to confirm, with the reasoning
 * shown, and deliberately reports low confidence rather than guessing quietly. A wrong cause is a
 * rejected or misfiled document carrying your VAT number.
 *
 * Every input is already on the record: the buyer's country and VIES-validated VAT number come
 * from their CRM party, the seller's from `finance_settings.business_country_code`, and
 * goods-vs-services from the catalog product (or the line's off-warehouse flag).
 *
 * Codes are the ΑΑΔΕ catalog in [mydataExemptionCategories.ts](src/lib/mydataExemptionCategories.ts).
 */
import { MYDATA_EXEMPTION_CATEGORIES } from '@/lib/mydataExemptionCategories';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

/** What is being supplied. The same destination gives different answers for each. */
export type SupplyKind = 'goods' | 'services' | 'unknown';

export interface ExemptionInputs {
  /** Seller's country. Defaults to Greece, the only regime these rules encode. */
  sellerCountry?: string | null;
  buyerCountry?: string | null;
  buyerVatNumber?: string | null;
  /** Whether that VAT number was actually VIES-verified — an unverified one is not a B2B proof. */
  buyerVatValidated?: boolean | null;
  supply?: SupplyKind;
}

export interface ExemptionSuggestion {
  /** The ΑΑΔΕ cause, or null when no exemption applies and VAT should simply be charged. */
  code: number | null;
  label: string | null;
  /** Why — shown to the operator, because a suggestion they cannot check is one they cannot own. */
  rationale: string;
  /** `high` = the inputs determine it. `low` = a fact is missing or assumed; do not auto-apply. */
  confidence: 'high' | 'low';
  /** The specific thing to verify before accepting. */
  caveat?: string;
}

/** VAT prefix letters, not ISO: Greece is `EL` on a VAT number and `GR` in an address. */
const toVatPrefix = (c: string | null | undefined): string => {
  const u = (c ?? '').trim().toUpperCase();
  return u === 'GR' ? 'EL' : u;
};

const EU_PREFIXES = new Set(VAT_COUNTRY_OPTIONS.filter((o) => o.eu).map((o) => o.code));

const labelOf = (code: number | null): string | null =>
  code == null ? null : MYDATA_EXEMPTION_CATEGORIES.find((c) => c.code === code)?.label ?? null;

const suggestion = (
  code: number | null,
  confidence: 'high' | 'low',
  rationale: string,
  caveat?: string,
): ExemptionSuggestion => ({ code, label: labelOf(code), rationale, confidence, caveat });

/**
 * Suggest the exemption cause for a 0% line.
 *
 * Only a Greek seller is modelled. Anything else returns no suggestion rather than applying Greek
 * articles to a regime they do not govern — silently wrong is worse than visibly absent.
 */
export function suggestVatExemption(input: ExemptionInputs): ExemptionSuggestion {
  const seller = toVatPrefix(input.sellerCountry) || 'EL';
  const buyer = toVatPrefix(input.buyerCountry);
  const supply: SupplyKind = input.supply ?? 'unknown';

  if (seller !== 'EL') {
    return suggestion(null, 'low',
      'These rules cover a Greek issuer only. Pick the cause that applies in your own regime.');
  }

  if (!buyer) {
    // The commonest real state, and the one worth naming: nothing is wrong, the record is just
    // incomplete. Defaulting to an exemption here would invent a cross-border sale.
    return suggestion(null, 'low',
      'The customer has no country on record, so this cannot be determined. A domestic sale carries VAT at the normal rate.',
      'Set the customer’s country before treating this as exempt.');
  }

  const hasVat = (input.buyerVatNumber ?? '').trim() !== '';
  const viesOk = hasVat && input.buyerVatValidated === true;
  const staleVat = hasVat && !viesOk
    ? 'The customer’s VAT number has not been VIES-verified. An intra-community supply needs a valid one at the time of supply.'
    : undefined;

  // ── Domestic ────────────────────────────────────────────────────────────────
  if (buyer === seller) {
    return suggestion(null, 'high',
      'Domestic Greek sale — VAT applies at the normal rate.',
      'A 0% domestic line needs a specific ground (art. 22 exemption, or the art. 39a reverse charge on certain goods). Only you can confirm which.');
  }

  // ── Elsewhere in the EU ─────────────────────────────────────────────────────
  if (EU_PREFIXES.has(buyer)) {
    if (viesOk) {
      if (supply === 'services') {
        return suggestion(4, 'high',
          `B2B services to a VAT-registered business in ${buyer}: place of supply moves to the customer, so no Greek VAT.`);
      }
      if (supply === 'goods') {
        return suggestion(14, 'high',
          `Intra-community supply of goods to a VAT-registered business in ${buyer}.`);
      }
      return suggestion(14, 'low',
        `Intra-community supply to a VAT-registered business in ${buyer} — assuming goods.`,
        'If this line is a service, art. 14 (cause 4) applies instead.');
    }
    // No verified VAT number ⇒ treat as a consumer.
    if (supply === 'services') {
      return suggestion(null, 'low',
        `Services to a non-business customer in ${buyer} are normally taxed in Greece.`,
        staleVat ?? 'Check whether you report this under OSS instead.');
    }
    return suggestion(29, 'low',
      `Goods to a non-business customer in ${buyer} — intra-community distance sale.`,
      staleVat ?? 'Below the distance-sales threshold, or without OSS registration, Greek VAT applies instead.');
  }

  // ── Outside the EU ──────────────────────────────────────────────────────────
  if (supply === 'services') {
    return suggestion(4, 'high',
      `Services to a customer in ${buyer}, outside the EU: place of supply is outside Greece.`);
  }
  if (supply === 'goods') {
    return suggestion(8, 'high',
      `Export of goods to ${buyer}, outside the EU.`,
      'Keep the export evidence — the exemption stands on proof the goods left the EU.');
  }
  return suggestion(8, 'low',
    `Customer in ${buyer}, outside the EU — assuming an export of goods.`,
    'If this line is a service, art. 14 (cause 4) applies instead.');
}
