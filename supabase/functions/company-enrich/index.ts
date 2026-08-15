/**
 * company-enrich
 *
 * Web-search + Apollo.io business-info enrichment for a CRM company.
 * Called after a VIES / ΑΑΔΕ VAT lookup to auto-fill the *soft* identity fields
 * that a VAT registry never carries — website, socials, phone, email, a one-line
 * description, industry, employee band, and (best-effort) city/state.
 *
 *   POST /functions/v1/company-enrich
 *     body: { name: string, country_code?: string, vat_number?: string,
 *             workspace_id?: string, company_id?: string }
 *
 *   Returns: { ok, fields: { website, email, phone, linkedin, facebook, twitter,
 *              description, industry, employee_count, city, state, country },
 *              sources: string[], skipped: string[] }
 *
 * Data sources (merged; web search wins for website/socials/description, Apollo
 * fills the structured blanks + industry/employee band):
 *   1. Anthropic web_search (always available — uses ANTHROPIC_API_KEY)
 *   2. Apollo.io org search (only when APOLLO_API_KEY is configured)
 *
 * Credit model (invariant #10): reserve an affordability ceiling BEFORE any
 * upstream spend, refund it, then each provider debits its own actual cost.
 * A provider that finds nothing / errors never blocks the other — we always
 * return whatever we could gather, plus the list of sources that came back empty.
 *
 * If company_id is provided AND the caller owns the row (or is admin), any field
 * still EMPTY on that row is cached back onto crm_companies (never overwrites
 * operator-entered values).
 *
 * Auth: self-authenticates via the caller's JWT (deployed with --no-verify-jwt like
 * every function in this repo).
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { reserveCredits, refundCredits } from '../_shared/credit-reserve.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

// Ceiling reserved up front for affordability (web search ~2cr + Apollo ~7.5cr worst case).
const ENRICH_CREDIT_CEILING = 12;

/** The soft fields we try to fill. Every value is string|null. */
interface EnrichFields {
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

const EMPTY_FIELDS: EnrichFields = {
  website: null, email: null, phone: null, linkedin: null, facebook: null,
  twitter: null, description: null, industry: null, employee_count: null,
  city: null, state: null, country: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s || s === '---' || /^(n\/?a|none|null|unknown)$/i.test(s)) return null;
  return s;
}

/** Normalize a bare domain ("acme.com") or full URL into an https:// URL. */
function normalizeUrl(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, '')}`;
}

/** Pull the last balanced {...} JSON object out of an LLM text blob. */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Structured-output tool the extraction pass is forced to emit. */
const EXTRACT_TOOL = {
  name: 'record_business_info',
  description: 'Record the researched business identity fields. Use null for anything not confidently found.',
  input_schema: {
    type: 'object',
    properties: {
      website: { type: ['string', 'null'], description: 'Official homepage URL' },
      email: { type: ['string', 'null'], description: 'General contact email' },
      phone: { type: ['string', 'null'], description: 'Main phone number in international format' },
      linkedin: { type: ['string', 'null'], description: 'Company LinkedIn URL' },
      facebook: { type: ['string', 'null'], description: 'Facebook page URL' },
      twitter: { type: ['string', 'null'], description: 'X/Twitter profile URL' },
      description: { type: ['string', 'null'], description: 'One-sentence description of what the business does' },
      industry: { type: ['string', 'null'], description: 'Primary industry / sector' },
      city: { type: ['string', 'null'], description: 'Head-office city' },
      state: { type: ['string', 'null'], description: 'State / province / region' },
      country: { type: ['string', 'null'], description: 'Country name' },
    },
    required: [],
  },
};

async function anthropic(body: Record<string, unknown>): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Web-search enrichment: research the business, then force a structured extraction.
 * Two cheap Haiku calls (search → extract) for reliable JSON. Debits its own cost.
 */
async function enrichViaWebSearch(
  admin: any, userId: string, workspaceId: string | null,
  name: string, countryName: string | null, vat: string | null,
): Promise<Partial<EnrichFields> | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const scope = [countryName ? `in ${countryName}` : '', vat ? `(VAT/registration ${vat})` : '']
    .filter(Boolean).join(' ');
  const researchQuery =
    `Research the business "${name}" ${scope}. Find its official website, general contact email, ` +
    `main phone number, LinkedIn, Facebook and X/Twitter pages, a one-sentence description of what it does, ` +
    `its primary industry, and its head-office city / region. Prefer the company's own website and official ` +
    `social pages over directories. If you cannot confidently find a field, leave it out.`;

  let inTok = 0, outTok = 0;

  // Step 1 — web research (free-form text)
  const research = await anthropic({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
    messages: [{ role: 'user', content: researchQuery }],
  });
  inTok += research?.usage?.input_tokens ?? 0;
  outTok += research?.usage?.output_tokens ?? 0;
  const researchText = (research.content as any[])
    ?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';

  // Step 2 — forced structured extraction over the gathered text
  let fields: Partial<EnrichFields> = {};
  try {
    const extract = await anthropic({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'record_business_info' },
      messages: [{
        role: 'user',
        content: `From the research below about "${name}", fill the record_business_info tool. ` +
          `Use null for anything not clearly stated.\n\n<research>\n${researchText.slice(0, 12000)}\n</research>`,
      }],
    });
    inTok += extract?.usage?.input_tokens ?? 0;
    outTok += extract?.usage?.output_tokens ?? 0;
    const toolUse = (extract.content as any[])?.find((b) => b.type === 'tool_use');
    fields = (toolUse?.input as Partial<EnrichFields>) ?? {};
  } catch {
    // Fallback: parse JSON straight out of the research text
    fields = (extractJson(researchText) as Partial<EnrichFields>) ?? {};
  }

  // Cost log + debit (Haiku 4.5 $0.80/$4 per MTok + web_search surcharge ~$0.04 for 4 uses)
  try {
    const inputCost = (inTok / 1_000_000) * 0.80;
    const outputCost = (outTok / 1_000_000) * 4.00;
    const rawCost = inputCost + outputCost + 0.04;
    const billedCost = rawCost * 1.5;
    const credits = Math.round(billedCost * 100 * 100) / 100;
    await admin.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: credits,
      p_operation_type: 'company_enrich_web_search',
      p_description: `Business info web search (${name})`,
      p_metadata: { name, country: countryName },
      p_workspace_id: workspaceId,
    });
    await admin.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      operation_type: 'company_enrich_web_search',
      model_name: 'claude-haiku-4-5',
      input_tokens: inTok,
      output_tokens: outTok,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: 1.5,
      billed_cost_usd: billedCost,
      credits_debited: credits,
      module_slug: 'crm',
      metadata: { feature: 'company_enrich', sub_feature: 'web_search', provider: 'anthropic', name },
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[company-enrich] web-search cost log failed:', (e as Error)?.message);
  }

  return {
    website: normalizeUrl(fields.website),
    email: cleanStr(fields.email),
    phone: cleanStr(fields.phone),
    linkedin: normalizeUrl(fields.linkedin),
    facebook: normalizeUrl(fields.facebook),
    twitter: normalizeUrl(fields.twitter),
    description: cleanStr(fields.description),
    industry: cleanStr(fields.industry),
    city: cleanStr(fields.city),
    state: cleanStr(fields.state),
    country: cleanStr(fields.country),
  };
}

/** Apollo.io org search — structured fields, only when APOLLO_API_KEY is set. Debits its own cost. */
async function enrichViaApollo(
  admin: any, userId: string, workspaceId: string | null,
  name: string, countryName: string | null,
): Promise<Partial<EnrichFields> | null> {
  if (!APOLLO_API_KEY) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': APOLLO_API_KEY },
      body: JSON.stringify({
        q_organization_name: name,
        organization_locations: countryName ? [countryName] : undefined,
        page: 1,
        per_page: 3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();

    // Charged even on zero results (the search ran).
    await debitExternalServiceCredits(admin, userId, 'apollo-enrich', 'company_enrich_apollo', 1, { name }, workspaceId);

    const org = (data.organizations || [])[0];
    if (!org) return {};
    return {
      website: normalizeUrl(org.website_url || org.primary_domain),
      phone: cleanStr(org.phone || org.sanitized_phone),
      linkedin: normalizeUrl(org.linkedin_url),
      facebook: normalizeUrl(org.facebook_url),
      twitter: normalizeUrl(org.twitter_url),
      industry: cleanStr(org.industry),
      employee_count: org.estimated_num_employees ? String(org.estimated_num_employees) : null,
      city: cleanStr(org.city),
      state: cleanStr(org.state),
      country: cleanStr(org.country),
    };
  } catch (e) {
    console.warn('[company-enrich] apollo failed:', (e as Error)?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// find-competitors — similar / competing businesses for a seed company.
// Apollo (structured, when APOLLO_API_KEY is set) → Anthropic web_search fallback.
// ─────────────────────────────────────────────────────────────────────────────

interface CompetitorOrg {
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

interface CompetitorSeed {
  name: string | null;
  industry: string | null;
  kadCodes: string[];
  city: string | null;
  country: string | null;
  excludeDomains: string[];
  limit: number;
  workspaceId: string | null;
}

/** Reduce a URL/domain to a bare lowercase host ("acme.com") for de-dupe/exclusion. */
function toDomain(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase() || null;
}

/** Structured-output tool the competitor web-search pass is forced to emit. */
const COMPETITORS_TOOL = {
  name: 'record_competitors',
  description: 'Record the list of real competing / similar businesses found in the research.',
  input_schema: {
    type: 'object',
    properties: {
      competitors: {
        type: 'array',
        description: 'Distinct real companies that compete with or closely resemble the seed business.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Company name' },
            website: { type: ['string', 'null'], description: 'Official homepage URL' },
            industry: { type: ['string', 'null'], description: 'Primary industry / sector' },
            city: { type: ['string', 'null'], description: 'Head-office city' },
            country: { type: ['string', 'null'], description: 'Country name' },
            description: { type: ['string', 'null'], description: 'One-sentence description of what it does' },
          },
          required: ['name'],
        },
      },
    },
    required: ['competitors'],
  },
};

function mapApolloOrg(org: any): CompetitorOrg {
  return {
    name: cleanStr(org?.name) ?? '',
    website: normalizeUrl(org?.website_url || org?.primary_domain),
    domain: toDomain(org?.primary_domain || org?.website_url),
    industry: cleanStr(org?.industry),
    city: cleanStr(org?.city),
    country: cleanStr(org?.country),
    employee_count: org?.estimated_num_employees ? String(org.estimated_num_employees) : null,
    linkedin: normalizeUrl(org?.linkedin_url),
    description: cleanStr(org?.short_description || org?.seo_description),
    source: 'apollo',
  };
}

/** Apollo similar-company search by industry/ΚΑΔ keywords + location. Only when APOLLO_API_KEY is set. */
async function findCompetitorsViaApollo(
  admin: any, userId: string, workspaceId: string | null, seed: CompetitorSeed,
): Promise<CompetitorOrg[] | null> {
  if (!APOLLO_API_KEY) return null;
  try {
    const keywords = [seed.industry, ...seed.kadCodes].filter(Boolean) as string[];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': APOLLO_API_KEY },
      body: JSON.stringify({
        q_organization_keyword_tags: keywords.length ? keywords : undefined,
        organization_locations: seed.country ? [seed.country] : undefined,
        page: 1,
        per_page: Math.min(seed.limit + 5, 25),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    // Charged even on zero results (the search ran).
    await debitExternalServiceCredits(admin, userId, 'apollo-competitors', 'find_competitors_apollo', 1, { seed: seed.name }, workspaceId);
    const orgs = Array.isArray(data?.organizations) ? data.organizations : [];
    const selfName = (seed.name ?? '').toLowerCase();
    return orgs
      .map(mapApolloOrg)
      .filter((o: CompetitorOrg) => o.name && o.name.toLowerCase() !== selfName);
  } catch (e) {
    console.warn('[company-enrich] apollo competitors failed:', (e as Error)?.message);
    return null;
  }
}

/** Anthropic web_search fallback — lists competitors, then forces a structured extraction. */
async function findCompetitorsViaWebSearch(
  admin: any, userId: string, workspaceId: string | null, seed: CompetitorSeed,
): Promise<CompetitorOrg[] | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const researchQuery = competitorResearchQuery(seed);

    let inTok = 0, outTok = 0;
    const research = await anthropic({
      model: 'claude-haiku-4-5',
      max_tokens: 2560,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: researchQuery }],
    });
    inTok += research?.usage?.input_tokens ?? 0;
    outTok += research?.usage?.output_tokens ?? 0;
    const researchText = (research.content as any[])
      ?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';

    let list: any[] = [];
    try {
      const extract = await anthropic({
        model: 'claude-haiku-4-5',
        max_tokens: 1536,
        tools: [COMPETITORS_TOOL],
        tool_choice: { type: 'tool', name: 'record_competitors' },
        messages: [{
          role: 'user',
          content: `From the research below, fill record_competitors with the distinct real companies found. ` +
            `Use null for any field not clearly stated.\n\n<research>\n${researchText.slice(0, 14000)}\n</research>`,
        }],
      });
      inTok += extract?.usage?.input_tokens ?? 0;
      outTok += extract?.usage?.output_tokens ?? 0;
      const toolUse = (extract.content as any[])?.find((b) => b.type === 'tool_use');
      list = Array.isArray(toolUse?.input?.competitors) ? toolUse.input.competitors : [];
    } catch {
      list = [];
    }

    // Cost log + debit (2 Haiku calls + web_search surcharge).
    try {
      const inputCost = (inTok / 1_000_000) * 0.80;
      const outputCost = (outTok / 1_000_000) * 4.00;
      const rawCost = inputCost + outputCost + 0.05;
      const billedCost = rawCost * 1.5;
      const credits = Math.round(billedCost * 100 * 100) / 100;
      await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: credits,
        p_operation_type: 'find_competitors_web_search',
        p_description: `Competitor discovery (${seed.name ?? seed.industry ?? 'company'})`,
        p_metadata: { name: seed.name, industry: seed.industry, country: seed.country },
        p_workspace_id: workspaceId,
      });
      await admin.from('ai_usage_logs').insert({
        user_id: userId,
        workspace_id: workspaceId,
        operation_type: 'find_competitors_web_search',
        model_name: 'claude-haiku-4-5',
        input_tokens: inTok,
        output_tokens: outTok,
        input_cost_usd: inputCost,
        output_cost_usd: outputCost,
        raw_cost_usd: rawCost,
        markup_multiplier: 1.5,
        billed_cost_usd: billedCost,
        credits_debited: credits,
        module_slug: 'crm',
        metadata: { feature: 'find_competitors', provider: 'anthropic', name: seed.name },
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[company-enrich] competitor cost log failed:', (e as Error)?.message);
    }

    const selfName = (seed.name ?? '').toLowerCase();
    return list
      .map((c): CompetitorOrg => ({
        name: cleanStr(c?.name) ?? '',
        website: normalizeUrl(c?.website),
        domain: toDomain(c?.website),
        industry: cleanStr(c?.industry),
        city: cleanStr(c?.city),
        country: cleanStr(c?.country),
        employee_count: null,
        linkedin: null,
        description: cleanStr(c?.description),
        source: 'web_search',
      }))
      .filter((c) => c.name && c.name.toLowerCase() !== selfName);
  } catch (e) {
    console.warn('[company-enrich] web-search competitors failed:', (e as Error)?.message);
    return null;
  }
}

/** Build the free-text competitor research prompt shared by the web/grounded providers. */
function competitorResearchQuery(seed: CompetitorSeed): string {
  const scopeBits = [
    seed.industry ? `in the ${seed.industry} sector` : '',
    seed.kadCodes.length ? `(activity codes ${seed.kadCodes.slice(0, 5).join(', ')})` : '',
    seed.country ? `operating in ${seed.country}` : '',
    seed.city ? `around ${seed.city}` : '',
  ].filter(Boolean).join(' ');
  const target = seed.name ? `the business "${seed.name}"` : `a business ${scopeBits}`;
  return (
    `Find up to ${seed.limit} real companies that compete with or are closely similar to ${target} ${scopeBits}. ` +
    `For each competitor give the company name, official website, head-office city/country, and a one-sentence ` +
    `description of what it does. Prefer direct competitors in the same market. ${seed.name ? `Exclude "${seed.name}" itself. ` : ''}` +
    `Only list companies you can actually find — do not invent names.`
  );
}

/**
 * Gemini + Google Search grounding — the broadest live web index for freeform competitor
 * research. Two Flash calls: (1) grounded research (text, google_search tool), (2) JSON-mode
 * structured extraction. Only when GEMINI_API_KEY is set. Debits its own cost.
 */
async function findCompetitorsViaGemini(
  admin: any, userId: string, workspaceId: string | null, seed: CompetitorSeed,
): Promise<CompetitorOrg[] | null> {
  if (!GEMINI_API_KEY) return null;
  const base = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  try {
    // Step 1 — grounded research (Google Search).
    const rc = new AbortController();
    const rt = setTimeout(() => rc.abort(), 30_000);
    const researchRes = await fetch(`${base}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: competitorResearchQuery(seed) }] }],
        tools: [{ google_search: {} }],
      }),
      signal: rc.signal,
    });
    clearTimeout(rt);
    if (!researchRes.ok) return null;
    const research = await researchRes.json();
    const researchText = (research?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text).filter(Boolean).join('\n') || '';
    let inTok = research?.usageMetadata?.promptTokenCount ?? 0;
    let outTok = research?.usageMetadata?.candidatesTokenCount ?? 0;
    if (!researchText) return [];

    // Step 2 — structured extraction (JSON mode, no grounding).
    let list: any[] = [];
    try {
      const ec = new AbortController();
      const et = setTimeout(() => ec.abort(), 20_000);
      const extractRes = await fetch(`${base}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `From the research below, extract the distinct real companies found. Use null for any field not clearly stated.\n\n<research>\n${researchText.slice(0, 14000)}\n</research>` }],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                competitors: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      name: { type: 'STRING' },
                      website: { type: 'STRING', nullable: true },
                      industry: { type: 'STRING', nullable: true },
                      city: { type: 'STRING', nullable: true },
                      country: { type: 'STRING', nullable: true },
                      description: { type: 'STRING', nullable: true },
                    },
                    required: ['name'],
                  },
                },
              },
              required: ['competitors'],
            },
          },
        }),
        signal: ec.signal,
      });
      clearTimeout(et);
      if (extractRes.ok) {
        const extract = await extractRes.json();
        inTok += extract?.usageMetadata?.promptTokenCount ?? 0;
        outTok += extract?.usageMetadata?.candidatesTokenCount ?? 0;
        const raw = (extract?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text).filter(Boolean).join('');
        const parsed = raw ? JSON.parse(raw) : null;
        list = Array.isArray(parsed?.competitors) ? parsed.competitors : [];
      }
    } catch {
      list = [];
    }

    // Cost log + debit (Gemini Flash tokens + Google-Search grounding surcharge).
    try {
      const inputCost = (inTok / 1_000_000) * 0.10;
      const outputCost = (outTok / 1_000_000) * 0.40;
      const rawCost = inputCost + outputCost + 0.035; // grounded-query surcharge
      const billedCost = rawCost * 1.5;
      const credits = Math.round(billedCost * 100 * 100) / 100;
      await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: credits,
        p_operation_type: 'find_competitors_gemini',
        p_description: `Competitor discovery via Gemini (${seed.name ?? seed.industry ?? 'company'})`,
        p_metadata: { name: seed.name, industry: seed.industry, country: seed.country },
        p_workspace_id: workspaceId,
      });
      await admin.from('ai_usage_logs').insert({
        user_id: userId,
        workspace_id: workspaceId,
        operation_type: 'find_competitors_gemini',
        model_name: 'gemini-2.0-flash',
        input_tokens: inTok,
        output_tokens: outTok,
        input_cost_usd: inputCost,
        output_cost_usd: outputCost,
        raw_cost_usd: rawCost,
        markup_multiplier: 1.5,
        billed_cost_usd: billedCost,
        credits_debited: credits,
        module_slug: 'crm',
        metadata: { feature: 'find_competitors', provider: 'gemini', grounded: true, name: seed.name },
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[company-enrich] gemini competitor cost log failed:', (e as Error)?.message);
    }

    const selfName = (seed.name ?? '').toLowerCase();
    return list
      .map((c): CompetitorOrg => ({
        name: cleanStr(c?.name) ?? '',
        website: normalizeUrl(c?.website),
        domain: toDomain(c?.website),
        industry: cleanStr(c?.industry),
        city: cleanStr(c?.city),
        country: cleanStr(c?.country),
        employee_count: null,
        linkedin: null,
        description: cleanStr(c?.description),
        source: 'gemini',
      }))
      .filter((c) => c.name && c.name.toLowerCase() !== selfName);
  } catch (e) {
    console.warn('[company-enrich] gemini competitors failed:', (e as Error)?.message);
    return null;
  }
}

/** Handle the `find-competitors` action: seed → Apollo/web-search → de-duped competitor list. */
async function handleFindCompetitors(userId: string, body: any): Promise<Response> {
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const seed: CompetitorSeed = {
    name: cleanStr(body?.name),
    industry: cleanStr(body?.industry),
    kadCodes: Array.isArray(body?.kad_codes)
      ? (body.kad_codes.filter((x: unknown) => typeof x === 'string') as string[]).slice(0, 10)
      : [],
    city: cleanStr(body?.city),
    country: cleanStr(body?.country_name) || cleanStr(body?.country),
    excludeDomains: Array.isArray(body?.exclude_domains)
      ? (body.exclude_domains.map(toDomain).filter(Boolean) as string[])
      : [],
    limit: Math.min(Math.max(Number(body?.limit) || 10, 1), 25),
    workspaceId: cleanStr(body?.workspace_id),
  };
  if (!seed.name && !seed.industry && seed.kadCodes.length === 0) {
    return jsonResponse({ error: 'Provide at least a company name, industry, or ΚΑΔ codes.' }, 400);
  }

  // Affordability gate up front (invariant #10); refund immediately, each provider debits its actual cost.
  const gate = await reserveCredits(admin, userId, seed.workspaceId ?? undefined, ENRICH_CREDIT_CEILING, 'find_competitors');
  if (!gate.ok) return jsonResponse({ error: 'insufficient_credits', message: gate.message }, 402);
  await refundCredits(admin, userId, seed.workspaceId ?? undefined, ENRICH_CREDIT_CEILING, 'find_competitors');

  const skipped: string[] = [];
  let competitors: CompetitorOrg[] = [];
  let source: 'apollo' | 'gemini' | 'web_search' | 'none' = 'none';

  // Optional single-provider override. The chain below is FIRST-WINS, which means every
  // provider after the first working one is unobservable: you cannot see what the fallback
  // would have returned, so you cannot compare them or notice one has quietly rotted. As of
  // 2026-08-15 that was not hypothetical — ai_usage_logs held zero find_competitors rows of
  // any kind, so no provider here had ever been measured against another.
  // Anything outside the three names runs the normal chain.
  const only = cleanStr(body?.provider);
  const forced = only === 'apollo' || only === 'gemini' || only === 'web_search' ? only : null;
  const notAttempted = (p: string) => `${p} (not attempted: provider=${forced})`;

  // Chain: Apollo (structured firmographics) → Gemini + Google-Search grounding (broadest live
  // web index) → Anthropic web_search. First provider that returns results wins.
  if (!forced || forced === 'apollo') {
    const viaApollo = await findCompetitorsViaApollo(admin, userId, seed.workspaceId ?? null, seed);
    if (viaApollo && viaApollo.length) { competitors = viaApollo; source = 'apollo'; }
    else skipped.push(APOLLO_API_KEY ? 'apollo' : 'apollo (no APOLLO_API_KEY)');
  } else skipped.push(notAttempted('apollo'));

  if (competitors.length === 0 && (!forced || forced === 'gemini')) {
    const viaGemini = await findCompetitorsViaGemini(admin, userId, seed.workspaceId ?? null, seed);
    if (viaGemini && viaGemini.length) { competitors = viaGemini; source = 'gemini'; }
    else skipped.push(GEMINI_API_KEY ? 'gemini' : 'gemini (no GEMINI_API_KEY)');
  } else if (forced && forced !== 'gemini') skipped.push(notAttempted('gemini'));

  if (competitors.length === 0 && (!forced || forced === 'web_search')) {
    const viaWeb = await findCompetitorsViaWebSearch(admin, userId, seed.workspaceId ?? null, seed);
    if (viaWeb && viaWeb.length) { competitors = viaWeb; source = 'web_search'; }
    else skipped.push(ANTHROPIC_API_KEY ? 'web_search' : 'web_search (no ANTHROPIC_API_KEY)');
  } else if (forced && forced !== 'web_search') skipped.push(notAttempted('web_search'));

  // Drop the seed company's own domains + de-dupe by domain/name.
  const ex = new Set(seed.excludeDomains);
  const seen = new Set<string>();
  competitors = competitors.filter((c) => {
    if (c.domain && ex.has(c.domain)) return false;
    const key = c.domain || c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, seed.limit);

  return jsonResponse({ ok: true, source, competitors, skipped });
}

/** Merge: primary wins per-field, secondary fills only the blanks. */
function mergeFields(primary: Partial<EnrichFields>, secondary: Partial<EnrichFields>): EnrichFields {
  const out: EnrichFields = { ...EMPTY_FIELDS };
  for (const k of Object.keys(EMPTY_FIELDS) as (keyof EnrichFields)[]) {
    out[k] = (primary[k] ?? null) || (secondary[k] ?? null) || null;
  }
  return out;
}

Deno.serve(withApiLogging('company-enrich', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));

    // Competitor discovery is a distinct action on this fn (merge-functions rule) — seed a
    // company's identity → similar/competing businesses. Returns before the enrich flow.
    if (cleanStr(body?.action) === 'find-competitors') {
      return await handleFindCompetitors(user.id, body);
    }

    const name = cleanStr(body?.name);
    const countryName = cleanStr(body?.country_name) || cleanStr(body?.country);
    const vat = cleanStr(body?.vat_number);
    const workspaceId = cleanStr(body?.workspace_id);
    const companyId = cleanStr(body?.company_id);

    if (!name) return jsonResponse({ error: 'name is required' }, 400);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Affordability gate up front (invariant #10). Refund immediately — each provider
    // debits its actual cost below.
    const gate = await reserveCredits(admin, user.id, workspaceId ?? undefined, ENRICH_CREDIT_CEILING, 'company_enrich');
    if (!gate.ok) return jsonResponse({ error: 'insufficient_credits', message: gate.message }, 402);
    await refundCredits(admin, user.id, workspaceId ?? undefined, ENRICH_CREDIT_CEILING, 'company_enrich');

    // Run both providers; neither blocks the other.
    const [webRes, apolloRes] = await Promise.allSettled([
      enrichViaWebSearch(admin, user.id, workspaceId ?? null, name, countryName, vat),
      enrichViaApollo(admin, user.id, workspaceId ?? null, name, countryName),
    ]);

    const web = webRes.status === 'fulfilled' ? webRes.value : null;
    const apollo = apolloRes.status === 'fulfilled' ? apolloRes.value : null;

    const sources: string[] = [];
    const skipped: string[] = [];
    if (web) sources.push('web_search'); else skipped.push(ANTHROPIC_API_KEY ? 'web_search' : 'web_search (no ANTHROPIC_API_KEY)');
    if (apollo) sources.push('apollo'); else skipped.push(APOLLO_API_KEY ? 'apollo' : 'apollo (no APOLLO_API_KEY)');

    // Web search wins for the soft fields; Apollo fills structured blanks + employee band.
    const fields = mergeFields(web ?? {}, apollo ?? {});

    // Optionally cache onto crm_companies — only fields currently EMPTY on the row,
    // and only if the caller owns it (or is admin). Never overwrites operator input.
    if (companyId) {
      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by, website, email, phone, linkedin, facebook, twitter, description, industry, employee_count, city, state, country')
        .eq('id', companyId)
        .maybeSingle();

      if (company) {
        let canWrite = company.created_by === user.id;
        if (!canWrite) {
          const { data: profile } = await admin
            .from('user_profiles')
            .select('roles!user_profiles_role_id_fkey(name)')
            .eq('user_id', user.id)
            .maybeSingle();
          const rn = (profile as any)?.roles?.name;
          canWrite = rn === 'admin' || rn === 'super_admin' || rn === 'owner';
        }
        if (canWrite) {
          const patch: Record<string, string> = {};
          for (const k of Object.keys(EMPTY_FIELDS) as (keyof EnrichFields)[]) {
            const existing = cleanStr((company as any)[k]);
            if (!existing && fields[k]) patch[k] = fields[k]!;
          }
          if (Object.keys(patch).length > 0) {
            patch.updated_at = new Date().toISOString();
            await admin.from('crm_companies').update(patch).eq('id', companyId);
          }
        }
      }
    }

    return jsonResponse({ ok: true, fields, sources, skipped });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[company-enrich] error:', err);
    return jsonResponse({ error: 'internal_error', detail }, 500);
  }
}));
