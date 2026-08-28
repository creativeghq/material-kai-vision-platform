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
// Invariant 1 — tenancy comes from membership, never from the request body.
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { reserveCredits, refundCredits } from '../_shared/credit-reserve.ts';
import { debitExternalServiceCredits, getServicePricing } from '../_shared/credit-utils.ts';
import { resolveTokenPrice } from '../_shared/ai-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
// Lazy getters, never module-load captures: the secrets bootstrap populates env at HANDLER
// ENTRY, so `const X = Deno.env.get('Y')` at module scope reads undefined for anything that
// arrives from platform_secrets rather than a deploy-time secret. All three were captured at
// module load here.
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';
const APOLLO_API_KEY = () => Deno.env.get('APOLLO_API_KEY') || '';
/**
 * `GOOGLE_GENERATIVE_AI_API_KEY`, not `GEMINI_API_KEY`.
 *
 * This read `GEMINI_API_KEY`, which is set NOWHERE — empty on the MIVAA host, no value in
 * platform_secrets, and absent from the edge env. Every Gemini call that has ever succeeded on
 * this platform (generate-interior-gemini, _shared/ai-client.ts) reads
 * GOOGLE_GENERATIVE_AI_API_KEY. So `findCompetitorsViaGemini` returned null on its first line
 * every time and the chain fell silently through to Anthropic — a provider that was ordered
 * FIRST, documented as "the broadest live index", and never once executed.
 *
 * Proven from production on 2026-08-15: forcing provider=gemini against the deployed function
 * returned `skipped: ["gemini (no GEMINI_API_KEY)"]` and zero competitors in 0.8s.
 *
 * `generate-social-image` reads the same dead name and has likewise never logged a call.
 */
const GEMINI_API_KEY = () => Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') || '';
/**
 * One constant, used for the endpoint URL, the price lookup and the logged `model_name`, so
 * those three can never disagree about which model actually ran. This sat on
 * `gemini-2.0-flash` — two generations behind the rest of the repo, which is on
 * `gemini-3.5-flash` / `gemini-3.1-pro` — while its hardcoded rates described 2.0-Flash.
 * Must match a `model_key` in `ai_model_pricing`, or the call logs `pricing_missing` and is
 * not debited.
 */
const GEMINI_MODEL = 'gemini-3.5-flash';

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

/*
 * `extractJson` lived here — "pull the last balanced {...} out of an LLM text blob" — and it is
 * DELETED rather than left unused (#353 CRM-8). Its only caller was the enrichment fallback that
 * parsed the raw web-research text, and a salvage parser sitting in the file is an invitation:
 * the next person needing "just parse whatever came back" finds it ready to hand. Security
 * invariant 9 wants forced `tools` + `tool_choice` on anything whose verdict drives a DB write,
 * and a helper that exists to undo that should not exist.
 */

interface CallPrice {
  inputCost: number; outputCost: number; surcharge: number;
  rawCost: number; markup: number; billedCost: number; credits: number;
}

/**
 * Price one provider call. Token rates come from `ai_model_pricing` via `resolveTokenPrice`,
 * and the per-query search/grounding surcharge from the same table via `getServicePricing` —
 * NEVER from a constant in this file.
 *
 * This file used to carry its own: `0.80/4.00` for Haiku 4.5 (the table says 1.00/5.00, so
 * every enrichment since it shipped under-billed by 20%) and `0.10/0.40` for Gemini. That is
 * the second-price-table bug `ai-logger.ts` documents — ai-client.ts kept one for months and
 * priced Gemini 3.5 Flash at a third of its real rate. A wrong price is a valid number, so
 * neither typecheck nor an integrity probe can see it.
 *
 * Returns null when the model has no price row. We do NOT fall back to a guess: an unpriced
 * call is logged with an explicit marker and left undebited, which is loud, rather than
 * charged a made-up number, which is silent.
 */
async function priceCall(
  admin: any, model: string, inTok: number, outTok: number,
  surchargeService: string | null, units: number,
): Promise<CallPrice | null> {
  const price = await resolveTokenPrice(admin, model);
  if (!price) return null;
  const svc = surchargeService ? await getServicePricing(admin, surchargeService) : null;
  if (surchargeService && !svc) {
    console.error(`[company-enrich] no price row for service '${surchargeService}' — surcharge not billed`);
  }
  const inputCost = (inTok / 1_000_000) * price.input;
  const outputCost = (outTok / 1_000_000) * price.output;
  const surcharge = (svc?.cost_per_unit ?? 0) * units;
  const rawCost = inputCost + outputCost + surcharge;
  const billedCost = rawCost * price.markup;
  return {
    inputCost, outputCost, surcharge, rawCost,
    markup: price.markup, billedCost,
    credits: Math.round(billedCost * 100 * 100) / 100,
  };
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
      'x-api-key': ANTHROPIC_API_KEY(),
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
  if (!ANTHROPIC_API_KEY()) return null;

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
  } catch (e) {
    /**
     * NO SALVAGE PARSER (#353 CRM-8, security invariant 9).
     *
     * This used to fall back to `extractJson(researchText)` — parsing a JSON object straight out
     * of the WEB RESEARCH TEXT. That text is whatever the open internet said about a company
     * name, so a page that ranks for that name and embeds
     * `{"website":"…","email":"…","phone":"…"}` could write attacker-chosen contact details into
     * a CRM record, every time the primary extraction happened to throw. The forced
     * `tools` + `tool_choice` above exists precisely so the model cannot be talked into a
     * different shape; a fallback that reads the raw page undoes it on the one path nobody
     * watches.
     *
     * Invariant 9 is explicit: a classifier whose verdict drives a DB write MUST use
     * `tools=[...]` + `tool_choice`, "not free-form JSON + a salvage parser". The competitor
     * path in this same file already gets this right — it returns `[]` on exception. Enrichment
     * now does the same: no fields is a correct, honest answer, and the caller reports which
     * ones are missing.
     */
    console.warn('[company-enrich] structured extraction failed; returning no fields rather than parsing the research text:', e);
    fields = {};
  }

  // Cost log + debit — rates from ai_model_pricing, never from a constant here. 4 web searches.
  try {
    const p = await priceCall(admin, 'claude-haiku-4-5', inTok, outTok, 'anthropic-web-search', 4);
    if (p) {
      await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: p.credits,
        p_operation_type: 'company_enrich_web_search',
        p_description: `Business info web search (${name})`,
        p_metadata: { name, country: countryName },
        p_workspace_id: workspaceId,
      });
    } else {
      console.error('[company-enrich] no price row for claude-haiku-4-5 — enrichment NOT debited');
    }
    await admin.from('ai_usage_logs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      operation_type: 'company_enrich_web_search',
      model_name: 'claude-haiku-4-5',
      input_tokens: inTok,
      output_tokens: outTok,
      input_cost_usd: p?.inputCost ?? null,
      output_cost_usd: p?.outputCost ?? null,
      raw_cost_usd: p?.rawCost ?? null,
      markup_multiplier: p?.markup ?? null,
      billed_cost_usd: p?.billedCost ?? null,
      credits_debited: p?.credits ?? 0,
      module_slug: 'crm',
      metadata: {
        // Post-call row. `success` is the key ops.silent_zero_provider reads;
        // without it this provider's calls are invisible to that probe.
        success: true,
        feature: 'company_enrich', sub_feature: 'web_search', provider: 'anthropic', name,
        // Explicit marker, not an absence: a NULL cost must be readable as "we could not
        // price this", never as "it was free".
        ...(p ? {} : { pricing_missing: true }),
      },
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
  if (!APOLLO_API_KEY()) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': APOLLO_API_KEY() },
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
  if (!APOLLO_API_KEY()) return null;
  try {
    const keywords = [seed.industry, ...seed.kadCodes].filter(Boolean) as string[];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': APOLLO_API_KEY() },
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
  if (!ANTHROPIC_API_KEY()) return null;
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

    // Cost log + debit (2 Haiku calls + 5 web searches). Rates from ai_model_pricing.
    try {
      const p = await priceCall(admin, 'claude-haiku-4-5', inTok, outTok, 'anthropic-web-search', 5);
      if (!p) console.error('[company-enrich] no price row for claude-haiku-4-5 — competitor search NOT debited');
      if (p) await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: p.credits,
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
        input_cost_usd: p?.inputCost ?? null,
        output_cost_usd: p?.outputCost ?? null,
        raw_cost_usd: p?.rawCost ?? null,
        markup_multiplier: p?.markup ?? null,
        billed_cost_usd: p?.billedCost ?? null,
        credits_debited: p?.credits ?? 0,
        module_slug: 'crm',
        metadata: {
          feature: 'find_competitors', provider: 'anthropic', name: seed.name,
          ...(p ? {} : { pricing_missing: true }),
        },
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
 * structured extraction. Only when GOOGLE_GENERATIVE_AI_API_KEY is set. Debits its own cost.
 */
async function findCompetitorsViaGemini(
  admin: any, userId: string, workspaceId: string | null, seed: CompetitorSeed,
  note: (s: string) => void,
): Promise<CompetitorOrg[] | null> {
  if (!GEMINI_API_KEY()) { note('gemini (no GOOGLE_GENERATIVE_AI_API_KEY)'); return null; }
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  try {
    // Step 1 — grounded research (Google Search).
    // 90s, not 30s. Measured 2026-08-15 against the deployed function: grounded research on
    // gemini-3.5-flash blew the old 30s abort (30.8s round trip, zero results) while Anthropic
    // answered the same seed in 21.6s. Google Search grounding fans out to real searches and
    // reads pages; it is simply slower than the budget it was given, and the abort landed in a
    // catch that returned null — indistinguishable from "found nothing".
    const rc = new AbortController();
    const rt = setTimeout(() => rc.abort(), 90_000);
    const researchRes = await fetch(`${base}?key=${GEMINI_API_KEY()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: competitorResearchQuery(seed) }] }],
        tools: [{ google_search: {} }],
      }),
      signal: rc.signal,
    });
    clearTimeout(rt);
    if (!researchRes.ok) { note(`gemini (research HTTP ${researchRes.status})`); return null; }
    const research = await researchRes.json();
    const researchText = (research?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text).filter(Boolean).join('\n') || '';
    let inTok = research?.usageMetadata?.promptTokenCount ?? 0;
    let outTok = research?.usageMetadata?.candidatesTokenCount ?? 0;
    if (!researchText) { note('gemini (grounding returned no text)'); return []; }

    // Step 2 — structured extraction (JSON mode, no grounding).
    let list: any[] = [];
    try {
      const ec = new AbortController();
      const et = setTimeout(() => ec.abort(), 20_000);
      const extractRes = await fetch(`${base}?key=${GEMINI_API_KEY()}`, {
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

    // Cost log + debit — Gemini tokens + ONE grounded query. Rates from ai_model_pricing.
    try {
      const p = await priceCall(admin, GEMINI_MODEL, inTok, outTok, 'google-search-grounding', 1);
      if (!p) console.error(`[company-enrich] no price row for ${GEMINI_MODEL} — competitor search NOT debited`);
      if (p) await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: p.credits,
        p_operation_type: 'find_competitors_gemini',
        p_description: `Competitor discovery via Gemini (${seed.name ?? seed.industry ?? 'company'})`,
        p_metadata: { name: seed.name, industry: seed.industry, country: seed.country },
        p_workspace_id: workspaceId,
      });
      await admin.from('ai_usage_logs').insert({
        user_id: userId,
        workspace_id: workspaceId,
        operation_type: 'find_competitors_gemini',
        model_name: GEMINI_MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        input_cost_usd: p?.inputCost ?? null,
        output_cost_usd: p?.outputCost ?? null,
        raw_cost_usd: p?.rawCost ?? null,
        markup_multiplier: p?.markup ?? null,
        billed_cost_usd: p?.billedCost ?? null,
        credits_debited: p?.credits ?? 0,
        module_slug: 'crm',
        metadata: {
          feature: 'find_competitors', provider: 'gemini', grounded: true, name: seed.name,
          ...(p ? {} : { pricing_missing: true }),
        },
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
    const msg = (e as Error)?.message ?? String(e);
    // An abort and a network error must not read the same, and neither may read as "found no
    // competitors" — that ambiguity is exactly what hid a dead provider for weeks.
    note((e as Error)?.name === 'AbortError' || /abort/i.test(msg)
      ? 'gemini (timed out after 90s)'
      : `gemini (error: ${msg.slice(0, 80)})`);
    console.warn('[company-enrich] gemini competitors failed:', msg);
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
    else skipped.push(APOLLO_API_KEY() ? 'apollo' : 'apollo (no APOLLO_API_KEY)');
  } else skipped.push(notAttempted('apollo'));

  if (competitors.length === 0 && (!forced || forced === 'gemini')) {
    // The provider reports its OWN reason. A bare 'gemini' in `skipped` told you nothing:
    // no key, timed out, HTTP error and genuinely-no-results all looked the same, and the
    // first two were true for weeks without anyone being able to tell.
    const notes: string[] = [];
    const viaGemini = await findCompetitorsViaGemini(
      admin, userId, seed.workspaceId ?? null, seed, (s) => notes.push(s));
    if (viaGemini && viaGemini.length) { competitors = viaGemini; source = 'gemini'; }
    else skipped.push(notes[0] ?? 'gemini (no results)');
  } else if (forced && forced !== 'gemini') skipped.push(notAttempted('gemini'));

  if (competitors.length === 0 && (!forced || forced === 'web_search')) {
    const viaWeb = await findCompetitorsViaWebSearch(admin, userId, seed.workspaceId ?? null, seed);
    if (viaWeb && viaWeb.length) { competitors = viaWeb; source = 'web_search'; }
    else skipped.push(ANTHROPIC_API_KEY() ? 'web_search' : 'web_search (no ANTHROPIC_API_KEY)');
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
    const requestedWorkspaceId = cleanStr(body?.workspace_id);
    const companyId = cleanStr(body?.company_id);

    if (!name) return jsonResponse({ error: 'name is required' }, 400);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    /**
     * The workspace this call is BILLED and AUDITED against (#353 CRM-9, invariant 1).
     *
     * It arrives in the request body, and it was used unverified: for `reserveCredits`, for the
     * `p_workspace_id` on every provider debit, and for the `ai_usage_logs` rows. So a caller
     * could bill an enrichment to a tenant they have nothing to do with, and that tenant's cost
     * view would show spend it never authorised — a wrong number in someone else's ledger, which
     * nothing raises because it is a perfectly valid uuid.
     *
     * Not rejected outright when it fails: enrichment is a legitimate action for a user with no
     * workspace context, and the fallback (bill the person, not a tenant) is exactly what
     * `reserveCredits` does with an undefined workspace. Dropping it is therefore the safe
     * degradation, and it is logged so a genuine misconfiguration is visible.
     */
    const workspaceId = requestedWorkspaceId
      && await userCanAccessWorkspace(admin, user.id, requestedWorkspaceId)
      ? requestedWorkspaceId
      : undefined;
    if (requestedWorkspaceId && !workspaceId) {
      console.warn(
        `[company-enrich] rejected body workspace_id ${requestedWorkspaceId} for user ${user.id} `
        + '— not a member; billing the caller personally instead',
      );
    }

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
    if (web) sources.push('web_search'); else skipped.push(ANTHROPIC_API_KEY() ? 'web_search' : 'web_search (no ANTHROPIC_API_KEY)');
    if (apollo) sources.push('apollo'); else skipped.push(APOLLO_API_KEY() ? 'apollo' : 'apollo (no APOLLO_API_KEY)');

    // Web search wins for the soft fields; Apollo fills structured blanks + employee band.
    const fields = mergeFields(web ?? {}, apollo ?? {});

    // Optionally cache onto crm_companies — only fields currently EMPTY on the row,
    // and only if the caller owns it (or is admin). Never overwrites operator input.
    if (companyId) {
      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by, workspace_id, website, email, phone, linkedin, facebook, twitter, description, industry, employee_count, city, state, country')
        .eq('id', companyId)
        .maybeSingle();

      if (company) {
        /**
         * TENANCY FIRST (#353 CRM-6, invariant 1). This is a service-role client writing to a
         * row identified by a body-supplied id, and it had no workspace check at all.
         *
         * `created_by === user.id` is not a tenancy check: a user who created a company in a
         * workspace they have since LEFT still satisfies it, and could keep writing website,
         * email, phone, socials, description, industry and address into that tenant's record.
         * Neither is the account-tier fallback below — `public.roles` is the GLOBAL tier, true
         * in every workspace at once, so a platform `admin` could write to any tenant's company.
         *
         * Membership is the boundary; the creator/tier test below stays as the within-tenant
         * rule about WHO may cache-write. Silent skip rather than an error: this is an
         * opportunistic cache of fields that are already being returned to the caller, so
         * failing the whole enrichment over it would be worse than not caching.
         */
        const sameTenant = await userCanAccessWorkspace(admin, user.id, (company as any).workspace_id);
        let canWrite = sameTenant && company.created_by === user.id;
        if (sameTenant && !canWrite) {
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
