import { supabase } from '@/integrations/supabase/client';

export interface ViesValidationResult {
  valid: boolean | null;
  name?: string | null;
  address?: string | null;
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
