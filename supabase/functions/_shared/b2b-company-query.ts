/** The B2B company-search request rendered against its prompt rows — ONE derivation for agent-chat, the validation lane and flow-engine (#473). */

// deno-lint-ignore-file no-explicit-any

import { B2B_COMPANY_TYPES, B2B_COMPANY_TYPES_VOCABULARY, type B2BCompanyType } from './b2bCompanyTypes.generated.ts';
import { buildMarketScope, loadVocabulary, resolveMarket, termsInGroup, type VocabularyTerm } from './vocabularies.ts';
import { getToolPrompt, loadPrompt, renderPromptTemplate } from './prompt-utils.ts';

export const B2B_COMPANY_QUERY_PROMPT = 'b2b_company_query';
export const B2B_COMPANY_SYSTEM_PROMPT = 'b2b_company_search';
/** Appended only by callers that bind the `record_companies` tool; flow-engine's text search does not. */
export const B2B_COMPANY_RECORD_PROMPT = 'b2b_company_record';

export interface CompanySearchRequest {
  category: string;
  country?: string | null;
  region?: string | null;
  limit: number;
  company_types: B2BCompanyType[];
  keywords: string[];
}

export interface CompanyTypeDefinition {
  key: B2BCompanyType;
  label: string;
  definition: string;
  core_business_test: string;
  counter_examples: string[];
  terms_by_language: Record<string, string[]>;
}

/** A requested type with no vocabulary row. Raised, never defaulted: a type searched without its definition is the hardcoded-word search again. */
export class CompanyTypeNotConfigured extends Error {
  constructor(keys: string[]) {
    super(`B2B company type(s) not configured in reference_vocabularies('${B2B_COMPANY_TYPES_VOCABULARY}'): ${keys.join(', ')}`);
    this.name = 'CompanyTypeNotConfigured';
  }
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : [];

/** Requested keys narrowed to the vocabulary, deduplicated, `manufacturer` when none survive. */
export function normaliseCompanyTypes(raw: unknown): B2BCompanyType[] {
  const picked = strings(typeof raw === 'string' ? raw.split(',') : raw)
    .filter((v): v is B2BCompanyType => (B2B_COMPANY_TYPES as readonly string[]).includes(v));
  return picked.length ? [...new Set(picked)] : ['manufacturer'];
}

export function normaliseKeywords(raw: unknown): string[] {
  const list = typeof raw === 'string' ? raw.split(',') : strings(raw);
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))].slice(0, 20);
}

export function companyTypeDefinitions(rows: VocabularyTerm[], keys: B2BCompanyType[]): CompanyTypeDefinition[] {
  const byKey = new Map(rows.map((r) => [r.value, r]));
  const missing = keys.filter((k) => {
    const m = byKey.get(k)?.metadata as Record<string, unknown> | undefined;
    return !m || typeof m.definition !== 'string' || typeof m.core_business_test !== 'string';
  });
  if (missing.length) throw new CompanyTypeNotConfigured(missing);
  return keys.map((key) => {
    const row = byKey.get(key)!;
    const m = row.metadata as Record<string, unknown>;
    const terms = (m.terms_by_language ?? {}) as Record<string, unknown>;
    return {
      key,
      label: row.label,
      definition: String(m.definition),
      core_business_test: String(m.core_business_test),
      counter_examples: strings(m.counter_examples),
      terms_by_language: Object.fromEntries(Object.entries(terms).map(([lang, t]) => [lang, strings(t)])),
    };
  });
}

/** The market rows a country/region selection covers; every market when neither is set. */
export function marketsInScope(
  markets: VocabularyTerm[],
  sel: { country?: string | null; region?: string | null },
): VocabularyTerm[] {
  if (sel.country) return [resolveMarket(markets, sel.country)].filter((m): m is VocabularyTerm => m !== null);
  if (sel.region) return termsInGroup(markets, sel.region.toLowerCase());
  return markets;
}

export function renderCompanyTypesClause(defs: CompanyTypeDefinition[]): string {
  return defs.map((d) => [
    `- ${d.label} (company_type "${d.key}"): ${d.definition}`,
    `  Core-business test: ${d.core_business_test}`,
    ...(d.counter_examples.length ? [`  Does NOT qualify: ${d.counter_examples.join('; ')}`] : []),
  ].join('\n')).join('\n');
}

/** Market language × the requested types' trade terms, one line per language that has any. */
export function renderNativeTerms(defs: CompanyTypeDefinition[], inScope: VocabularyTerm[]): string {
  const languages = new Map<string, string>();
  for (const m of inScope) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.language_code === 'string') {
      languages.set(meta.language_code, typeof meta.language_name === 'string' ? meta.language_name : meta.language_code);
    }
  }
  const lines: string[] = [];
  for (const [code, name] of languages) {
    const terms = [...new Set(defs.flatMap((d) => d.terms_by_language[code] ?? []))];
    if (terms.length) lines.push(`- ${name}: ${terms.join(', ')}`);
  }
  return lines.join('\n');
}

/** ISO-3166 alpha-2 for `user_location`, only when the scope is ONE market that states it. */
export function searchCountryCode(markets: VocabularyTerm[], country?: string | null): string | null {
  const code = (resolveMarket(markets, country)?.metadata as Record<string, unknown> | undefined)?.iso_code;
  return typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null;
}

export interface RenderedCompanySearch {
  query: string;
  systemPrompt: string;
  definitions: CompanyTypeDefinition[];
}

/** @throws CompanyTypeNotConfigured, PromptNotConfigured, PromptStoreUnavailable, VocabularyStoreUnavailable */
export async function renderCompanySearch(
  supabase: any,
  markets: VocabularyTerm[],
  req: CompanySearchRequest,
  opts: { structured?: boolean } = {},
): Promise<RenderedCompanySearch> {
  const definitions = companyTypeDefinitions(
    await loadVocabulary(supabase, B2B_COMPANY_TYPES_VOCABULARY),
    req.company_types,
  );
  const sel = { country: req.country, region: req.region };
  const search = renderPromptTemplate(await loadPrompt(supabase, 'tool', B2B_COMPANY_QUERY_PROMPT), {
    category: req.category,
    scope: buildMarketScope(markets, sel),
    limit: req.limit,
    company_types_clause: renderCompanyTypesClause(definitions),
    keywords_clause: req.keywords.length ? req.keywords.join(', ') : 'none',
    native_terms: renderNativeTerms(definitions, marketsInScope(markets, sel)) || 'none',
  });
  const query = opts.structured
    ? `${search}\n\n${await loadPrompt(supabase, 'tool', B2B_COMPANY_RECORD_PROMPT)}`
    : search;
  const systemPrompt = await getToolPrompt(supabase, B2B_COMPANY_SYSTEM_PROMPT);
  return { query, systemPrompt, definitions };
}

type CompanyRow = Record<string, any>;

/** A row is a MATCH only with a requested type and a quote proving it; anything else is returned unverified with the reason. */
export function classifyCompanyRows(
  rows: CompanyRow[],
  requested: B2BCompanyType[],
  known: Set<string>,
  toDomain: (url: string | null | undefined) => string,
): { matches: CompanyRow[]; unverified: CompanyRow[] } {
  const matches: CompanyRow[] = [];
  const unverified: CompanyRow[] = [];
  for (const r of rows) {
    const domain = toDomain(r?.domain ?? r?.website) || null;
    const row = {
      ...r,
      domain,
      is_manufacturer: r?.company_type === 'manufacturer',
      already_in_crm: !!domain && known.has(domain),
    };
    const reason = !(requested as string[]).includes(r?.company_type)
      ? `recorded as "${r?.company_type ?? 'unknown'}", which is not a requested type`
      : !(typeof r?.type_evidence === 'string' && r.type_evidence.trim())
        ? 'no quote from its own website proves the core business'
        : null;
    if (reason) unverified.push({ ...row, unverified_reason: reason });
    else matches.push(row);
  }
  return { matches, unverified };
}

/** "stock / surplus traders" — the requested types' labels, for titles and progress lines. */
export function companyTypesLabel(defs: Array<Pick<CompanyTypeDefinition, 'label'>>): string {
  const labels = defs.map((d) => d.label.toLowerCase());
  return labels.length <= 1 ? (labels[0] ?? 'companies') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
