import { supabase } from '@/integrations/supabase/client';

export interface ViesParsedAddress {
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;
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
