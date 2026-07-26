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
      operation_type: 'company_enrich_web_search',
      model_name: 'claude-haiku-4-5',
      api_provider: 'anthropic',
      input_tokens: inTok,
      output_tokens: outTok,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: 1.5,
      billed_cost_usd: billedCost,
      credits_debited: credits,
      metadata: { feature: 'company_enrich', sub_feature: 'web_search', name },
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
