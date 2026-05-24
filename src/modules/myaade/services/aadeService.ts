import { supabase } from '@/integrations/supabase/client';

export interface AadeBasicRec {
  afm: string | null;
  doy: string | null;
  doy_descr: string | null;
  i_ni_flag_descr: string | null;
  deactivation_flag: string | null;
  deactivation_flag_descr: string | null;
  firm_flag_descr: string | null;
  onomasia: string | null;
  commer_title: string | null;
  legal_status_descr: string | null;
  postal_address: string | null;
  postal_address_no: string | null;
  postal_zip_code: string | null;
  postal_area_description: string | null;
  regist_date: string | null;
  stop_date: string | null;
  normal_vat_system_flag: string | null;
}

export interface AadeFirmActivity {
  code: string | null;
  description: string | null;
  kind: number | null;
  kind_description: string | null;
}

export interface AadeLookupResult {
  ok: true;
  source: 'aade' | 'cache';
  checked_at: string;
  valid_afm: boolean;
  basic_rec: AadeBasicRec;
  activities: AadeFirmActivity[];
  secret_sources?: { username: string; password: string; afm_called_by: string };
}

export interface AadeLookupError {
  ok?: false;
  error: string;
  message?: string;
  code?: string | null;
  http_status?: number;
}

export const aadeService = {
  /**
   * Look up a Greek business by ΑΦΜ. If `companyId` is supplied, the server caches the result
   * on `crm_companies` and mirrors structured fields (commercial_title, kad_primary, tax_office, …).
   *
   * NOTE: every call writes an audit entry into the looked-up ΑΦΜ's TAXISnet inbox.
   * Only invoke when the user is looking up their own ΑΦΜ.
   */
  async lookup(args: { afm: string; companyId?: string }): Promise<AadeLookupResult | AadeLookupError> {
    const { data, error } = await supabase.functions.invoke('myaade-rgwspublic2', {
      body: { afm: args.afm, company_id: args.companyId },
    });
    if (error) return { error: error.message };
    if (data?.error) return data as AadeLookupError;
    return data as AadeLookupResult;
  },
};
