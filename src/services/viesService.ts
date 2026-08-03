import { supabase } from '@/integrations/supabase/client';

export interface ViesParsedAddress {
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
  /** State / province where the local address convention carries one (e.g. IT province code). NULL otherwise. */
  state: string | null;
}

export interface ViesValidationResult {
  valid: boolean | null;
  /** Raw name as returned by VIES (may contain "legal_name||trade_name"). */
  name?: string | null;
  /** Legal name (the part before `||`). Prefer this over `name` when adopting into our DB. */
  legal_name?: string | null;
  /** Trade name (the part after `||`), if VIES provided one. */
  trade_name?: string | null;
  /** Raw address string from VIES — country-specific format. */
  address?: string | null;
  /** Best-effort parsed address (per-country regex). NULL on unsupported countries. */
  address_parsed?: ViesParsedAddress | null;
  /**
   * Latin transliteration of `legal_name`. VIES answers in the member state's own script
   * (Cyrillic for BG, Greek for EL/CY) and has no language option, so this is derived server-side.
   * It is a READABILITY AID, not a translation and not a trading name — `Виваком България - ЕАД`
   * transliterates to `Vivakom Bulgaria - EAD` while the company trades as "Vivacom".
   * NULL when the registered name is already Latin, so non-null always means real conversion.
   */
  legal_name_latin?: string | null;
  /** Latin transliteration of `trade_name`. NULL when already Latin or absent. */
  trade_name_latin?: string | null;
  /** Latin transliteration of `address`. NULL when already Latin or absent. */
  address_latin?: string | null;
  country_code?: string;
  vat_number?: string;
  checked_at: string;
  source: 'vies';
  /** Set when the call was deliberately skipped: 'non_eu' (country outside VIES) or 'vies_unreachable' (transient). */
  skipped_reason?: 'non_eu' | 'vies_unreachable';
  /** Human-readable accompaniment to skipped_reason. */
  message?: string;
}

export interface ViesValidateArgs {
  countryCode: string;
  vatNumber: string;
  /** If provided, the server caches the result onto crm_companies.vat_validated*. */
  companyId?: string;
}

export async function validateVatViaVies({
  countryCode,
  vatNumber,
  companyId,
}: ViesValidateArgs): Promise<ViesValidationResult> {
  const { data, error } = await supabase.functions.invoke('vies-validate', {
    body: {
      country_code: countryCode,
      vat_number: vatNumber,
      company_id: companyId,
    },
  });
  if (error) {
    return {
      valid: null,
      skipped_reason: 'vies_unreachable',
      message: error.message,
      checked_at: new Date().toISOString(),
      source: 'vies',
    };
  }
  return data as ViesValidationResult;
}
