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

/** A competing / similar business surfaced by discovery. All fields but `name` are nullable. */
export interface CompetitorOrg {
  name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  employee_count: string | null;
  linkedin: string | null;
  description: string | null;
  source: 'apollo' | 'gemini' | 'web_search';
}

export interface FindCompetitorsResult {
  ok: boolean;
  source: 'apollo' | 'gemini' | 'web_search' | 'none';
  competitors: CompetitorOrg[];
  skipped: string[];
  error?: string;
  message?: string;
}

export interface FindCompetitorsArgs {
  /** Seed company name (excluded from results). */
  name?: string;
  industry?: string;
  /** ΚΑΔ activity codes — the strongest same-industry seed. */
  kadCodes?: string[];
  city?: string;
  /** Country display name (e.g. "Greece"). */
  country?: string;
  /** Domains to exclude (e.g. the seed company's own website). */
  excludeDomains?: string[];
  limit?: number;
  workspaceId?: string;
  /**
   * Force ONE discovery provider instead of the first-wins chain. Without it every provider
   * after the first working one is unobservable — you cannot compare them, or notice one has
   * quietly rotted. Leave unset for normal use.
   */
  provider?: 'apollo' | 'gemini' | 'web_search';
}

/**
 * Discover businesses similar to / competing with a seed company. Backed by the same
 * `company-enrich` edge fn (`action: 'find-competitors'`) — Apollo when configured, else an
 * Anthropic web-search fallback. Best-effort: always resolves, never throws.
 */
export async function findCompetitors(args: FindCompetitorsArgs): Promise<FindCompetitorsResult> {
  try {
    const { data, error } = await supabase.functions.invoke('company-enrich', {
      body: {
        action: 'find-competitors',
        name: args.name,
        industry: args.industry,
        kad_codes: args.kadCodes,
        city: args.city,
        country: args.country,
        exclude_domains: args.excludeDomains,
        limit: args.limit,
        workspace_id: args.workspaceId,
        provider: args.provider,
      },
    });
    if (error) return { ok: false, source: 'none', competitors: [], skipped: [], error: error.message };
    return data as FindCompetitorsResult;
  } catch (e) {
    return { ok: false, source: 'none', competitors: [], skipped: [], error: e instanceof Error ? e.message : 'competitor search failed' };
  }
}
