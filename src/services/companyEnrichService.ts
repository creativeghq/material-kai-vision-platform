import { supabase } from '@/integrations/supabase/client';

/** Soft business-identity fields a VAT registry never carries. All nullable. */
export interface CompanyEnrichFields {
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  facebook: string | null;
  twitter: string | null;
  description: string | null;
  industry: string | null;
  employee_count: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface CompanyEnrichResult {
  ok: boolean;
  fields: CompanyEnrichFields | null;
  /** Providers that returned data. */
  sources: string[];
  /** Providers that were skipped / returned nothing (with reason). */
  skipped: string[];
  error?: string;
  message?: string;
}

export interface CompanyEnrichArgs {
  name: string;
  /** Country display name (e.g. "Greece") — improves match quality. */
  countryName?: string;
  vatNumber?: string;
  /** Routes credit debit to the workspace pool when provided. */
  workspaceId?: string;
  /** If set + caller owns the row, empty columns are cached back onto crm_companies. */
  companyId?: string;
}

/**
 * Auto-fill website / socials / phone / description etc. for a business, using
 * web search + Apollo. Best-effort: always resolves (never throws) so a failed
 * enrichment can never block the VAT-lookup flow that triggered it.
 */
export async function enrichCompany({
  name,
  countryName,
  vatNumber,
  workspaceId,
  companyId,
}: CompanyEnrichArgs): Promise<CompanyEnrichResult> {
  try {
    const { data, error } = await supabase.functions.invoke('company-enrich', {
      body: {
        name,
        country_name: countryName,
        vat_number: vatNumber,
        workspace_id: workspaceId,
        company_id: companyId,
      },
    });
    if (error) {
      return { ok: false, fields: null, sources: [], skipped: [], error: error.message };
    }
    return data as CompanyEnrichResult;
  } catch (e) {
    return { ok: false, fields: null, sources: [], skipped: [], error: e instanceof Error ? e.message : 'enrich failed' };
  }
}
