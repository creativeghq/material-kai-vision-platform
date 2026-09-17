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
  tradeName?: string;
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
  tradeName,
  countryName,
  vatNumber,
  workspaceId,
  companyId,
}: CompanyEnrichArgs): Promise<CompanyEnrichResult> {
  try {
    const { data, error } = await supabase.functions.invoke('company-enrich', {
      body: {
        name,
        trade_name: tradeName,
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

/** What the research concluded about a chat counterparty. Everything but the verdict is nullable. */
export interface CounterpartyIdentity {
  verdict: 'business' | 'person' | 'unclear' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | null;
  business_name: string | null;
  legal_name: string | null;
  country_code: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  description: string | null;
  vat_number: string | null;
  registry_id: string | null;
  linkedin: string | null;
  person_name: string | null;
  person_role: string | null;
  /** Short lines naming what was found and where — what the operator reads to decide. */
  evidence: string[];
  sources: string[];
  skipped: string[];
  /** False when we could not ask at all. Distinct from a verdict of "person". */
  ok: boolean;
  error?: string;
}

export interface IdentifyCounterpartyArgs {
  /** The name the channel shows — often a person AND their company ("Patricia (Unitiles)"). */
  displayName: string;
  phone?: string | null;
  /** Country display name derived from the dial code, e.g. "Italy". */
  countryName?: string | null;
  /** Domains and email domains seen in the conversation — the strongest lead there is. */
  domains?: string[];
  /** Recent message text. Sent as DATA; the edge fences it before the model sees it. */
  transcript?: string;
  workspaceId?: string;
}

/** Every identity field at "not established". Exported so a caller that answers WITHOUT the
 *  research — an internal hit on a number we already hold — returns the same shape. */
export const NO_IDENTITY: Omit<CounterpartyIdentity, 'verdict' | 'ok' | 'error'> = {
  confidence: null, business_name: null, legal_name: null, country_code: null, website: null,
  email: null, phone: null, city: null, state: null, industry: null, description: null,
  vat_number: null, registry_id: null, linkedin: null, person_name: null, person_role: null,
  evidence: [], sources: [], skipped: [],
};

/**
 * Work out who a chat counterparty is from what the channel gives us — a display name, a number
 * and what they said. Identification comes BEFORE enrichment: `enrichCompany` already knows it is
 * looking at a business and only wants its details.
 *
 * Never throws, and an unreachable provider returns `verdict: 'unknown'` — not "not a business",
 * which is a different answer and would quietly file a supplier as a private individual.
 */
export async function identifyCounterparty(args: IdentifyCounterpartyArgs): Promise<CounterpartyIdentity> {
  const fail = (error: string): CounterpartyIdentity => ({
    ...NO_IDENTITY, verdict: 'unknown', ok: false, error,
  });
  try {
    const { data, error } = await supabase.functions.invoke('company-enrich', {
      body: {
        action: 'identify-business',
        display_name: args.displayName,
        phone: args.phone ?? null,
        country_name: args.countryName ?? null,
        domains: args.domains ?? [],
        transcript: args.transcript ?? '',
        workspace_id: args.workspaceId,
      },
    });
    if (error) return fail(error.message);
    const d = (data ?? {}) as Partial<CounterpartyIdentity>;
    return {
      ...NO_IDENTITY,
      ...d,
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      sources: Array.isArray(d.sources) ? d.sources : [],
      skipped: Array.isArray(d.skipped) ? d.skipped : [],
      verdict: d.verdict ?? 'unknown',
      ok: d.ok === true,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'identification failed');
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
