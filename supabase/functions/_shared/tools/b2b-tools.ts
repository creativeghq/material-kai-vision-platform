/**
 * B2B Tools: validateEmailWithZeroBounce, createB2BManufacturerSearchTool,
 * createCompanyWebsiteScrapeTool, createCompanyEnrichmentTool,
 * createContactDiscoveryTool, createEmailValidateTool, createSaveToCRMTool
 *
 * Workflow chunks: each tool emits step_progress for the b2b-research wizard.
 * Run_id stability comes from the agent passing `_workflow_run_id` (extracted
 * from `[workflow:b2b-research/<step>:<run_id>]` prefix). The first tool
 * (search) generates and emits the workflow_plan; the last (save_to_crm)
 * emits workflow_finished.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.5.6');
const { createClient } = await import('npm:@supabase/supabase-js@2');
const { createWorkflowEmitter, STEPS } = await import('./_workflow-chunks.ts');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type B2BChunkSink = ((chunk: any) => void) | undefined;

import { debitExternalServiceCredits, debitOrRefuse, preflightOrRefuse } from '../credit-utils.ts';
import { reserveCredits, refundCredits } from '../credit-reserve.ts';
import { resolveTokenPrice } from '../ai-logger.ts';
import { getToolPrompt, loadPrompt, renderPromptTemplate } from '../prompt-utils.ts';
import { allValues, buildMarketScope, describeGroups, groupKeys, resolveMarket, termsInGroup, type VocabularyTerm } from '../vocabularies.ts';
import { escapeLike, foldForSearch } from '../searchFold.ts';
import { domainFromUrl } from '../seo-website.ts';
import { transliterateToLatin } from '../transliterate.ts';
import { extractContactDetails } from '../contact-extract.ts';
import { FACILITY_SECTORS, lookupDomainAge, searchIndustrialFacilities, type FacilitySector } from '../eea-facilities.ts';

/**
 * Entry affordability gate for a paid B2B tool: reserve the tool's expected cost
 * (blocks a 0/under-credit caller BEFORE any upstream spend), then release it —
 * the tool's own per-unit debitExternalServiceCredits calls charge the actual cost.
 * Returns a user-facing message to return straight from the tool when blocked, else null.
 */
async function b2bAffordabilityGate(userId: string, ceiling: number, opType: string): Promise<string | null> {
  const gate = await reserveCredits(supabase, userId, undefined, ceiling, opType);
  if (!gate.ok) return gate.message;
  await refundCredits(supabase, userId, undefined, ceiling, opType);
  return null;
}

// ============================================================================
// B2B RESEARCH TOOLS FOR INSIGHTS AGENT
// These tools enable manufacturer discovery, verification, and CRM integration
// ============================================================================

/**
 * ZeroBounce Email Validation Helper
 * Validates a single email address and returns detailed status
 */
export async function validateEmailWithZeroBounce(
  email: string,
  onProgress?: (status: string) => void
): Promise<{
  validated: boolean;
  status?: string;
  sub_status?: string;
  free_email?: boolean;
  mx_found?: string;
  firstname?: string;
  lastname?: string;
  domain?: string;
  error?: string;
}> {
  const ZEROBOUNCE_API_KEY = Deno.env.get('ZEROBOUNCE_API_KEY');
  if (!ZEROBOUNCE_API_KEY) {
    return { validated: false, error: 'ZEROBOUNCE_API_KEY not configured' };
  }

  try {
    onProgress?.(`Validating ${email}...`);

    const validateUrl = new URL('https://api.zerobounce.net/v2/validate');
    validateUrl.searchParams.set('api_key', ZEROBOUNCE_API_KEY);
    validateUrl.searchParams.set('email', email);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(validateUrl.toString(), {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { validated: false, error: `ZeroBounce API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      validated: true,
      status: data.status,
      sub_status: data.sub_status,
      free_email: data.free_email,
      mx_found: data.mx_found,
      firstname: data.firstname,
      lastname: data.lastname,
      domain: data.domain,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { validated: false, error: 'ZeroBounce validation timeout' };
    }
    return { validated: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}

/**
 * B2B Research Tool: Manufacturer Search
 * Uses Claude's built-in web_search to find B2B manufacturers.
 * No extra API key required — uses ANTHROPIC_API_KEY.
 */
/**
 * Opus 5 at effort:low, measured against Sonnet 5 on the identical 6-company Polish sweep:
 *
 *            time    searches   input tok   domains   sources/rec   cost
 *   opus-5    52s        8         35k        100%       1.2       $0.21
 *   sonnet-5  65s       19         89k        100%       0.0       $0.31
 *
 * Opus wins on every axis including price — Sonnet burned 19 searches and 89k tokens getting less.
 * The cheaper-tier intuition is backwards for this task, so this is pinned rather than left to a
 * "use the cheap model for tool calls" reflex. Opus also surfaced small specialist factories
 * (Fabryka Mebli Wersal, Ropez, Brattex) where Sonnet returned the household names you would find
 * without a tool at all.
 */
const SEARCH_MODEL = 'claude-opus-5';
/** The model the website-analysis pass runs on. Named so the price lookup and the usage row
 *  cannot name two different models, which is exactly what they did. */
const ANALYSIS_MODEL = 'claude-opus-5';

/**
 * Apollo circuit breaker.
 *
 * Telling the agent "do not retry" is a request; this is the mechanism. On 2026-08-19 a single
 * "save these two companies to my CRM" spent 190 seconds calling company_enrichment into a 403
 * over and over and never reached the save. Once Apollo has answered 401/402/403 the account is
 * unusable and every further call in the next few minutes will fail identically — at ~1s of
 * latency each, plus the model round trip to decide to try again.
 *
 * Short TTL on purpose: this is about not hammering a dead provider inside one conversation, not
 * about caching an outage. Funding the account should take effect within a minute, not a deploy.
 */
let apolloUnavailableUntil = 0;
const APOLLO_BREAKER_MS = 120_000;
const apolloIsKnownDown = () => Date.now() < apolloUnavailableUntil;
const APOLLO_DOWN_PAYLOAD = JSON.stringify({
  success: false,
  enrichment_unavailable: true,
  retryable: false,
  error: 'Apollo enrichment is unavailable (checked moments ago in this conversation). Do NOT call '
    + 'it again this turn. Enrichment is optional — continue with the search and website-scrape data '
    + 'you already have, save to CRM if that is what was asked (save_to_crm needs only a company '
    + 'name), and note in one line that enrichment was skipped.',
});

/**
 * POST to Anthropic, retrying the TRANSIENT failures — inside a DEADLINE.
 *
 * 529 (overloaded), 429 (rate limited) and 5xx say "the upstream was busy", not "your request was
 * wrong", and this call had no retry at all: two 529s seven seconds apart killed a real sweep on
 * 2026-08-18 and sent the agent hunting for a background lane it did not need.
 *
 * But retrying blindly is worse than not retrying. The agent-chat tool runner kills a tool at 90s
 * — tighter than the 150s edge idle timeout — and a single search already takes ~52s. Two naive
 * retries would therefore guarantee the timeout, turning a recoverable blip into a hard failure
 * and burning two full-price calls on the way. So each attempt is only started if there is
 * plausibly time left for it; otherwise the last response is returned and the caller reports a
 * retryable upstream failure, which is the honest answer.
 */
async function postAnthropicWithRetry(init: RequestInit, budgetMs = 85_000): Promise<Response> {
  const BACKOFF_MS = [2000, 6000];
  const startedAt = Date.now();
  let res!: Response;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', init);
    if (res.ok) return res;
    const transient = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!transient || attempt === BACKOFF_MS.length) return res;
    // Only retry if the backoff AND another attempt of the length we just spent could finish
    // inside the budget. A retry that is certain to be killed helps nobody and costs full price.
    const spent = Date.now() - startedAt;
    const perAttempt = spent / (attempt + 1);
    if (spent + BACKOFF_MS[attempt] + perAttempt > budgetMs) {
      console.warn(`[b2b_manufacturer_search] Anthropic ${res.status} — no time left to retry (${spent}ms spent)`);
      return res;
    }
    // Drain the body so the connection is released before we sleep on it.
    await res.text().catch(() => undefined);
    console.warn(`[b2b_manufacturer_search] Anthropic ${res.status} — retrying in ${BACKOFF_MS[attempt]}ms`);
    await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
  }
  return res;
}

/**
 * "…also search in Polish, Romanian and Turkish" — built from the language each market row now
 * carries. Returns '' when the scope has no languages we know, so the query degrades to
 * English-only rather than instructing the model to search in nothing.
 */
function nativeLanguageClause(
  markets: VocabularyTerm[],
  sel: { country?: string | null; region?: string | null },
): string {
  // Through resolveMarket, not an exact name match: `Czechia`, `Türkiye` and `UK` are the markets
  // we sweep under another name, and matching on `value` alone dropped this clause for every one
  // of them — the search ran, English-only, with nothing to say it had.
  const inScope = sel.country
    ? [resolveMarket(markets, sel.country)].filter((m): m is VocabularyTerm => m !== null)
    : sel.region
      ? termsInGroup(markets, sel.region.toLowerCase())
      : markets;

  const languages = [...new Set(
    inScope
      .map((m) => (m.metadata as Record<string, unknown> | undefined)?.language_name)
      .filter((l): l is string => typeof l === 'string' && l !== 'English'),
  )];
  if (!languages.length) return '';

  const list = languages.length === 1
    ? languages[0]
    : `${languages.slice(0, -1).join(', ')} and ${languages[languages.length - 1]}`;
  return `\n\nSearch in ${list} as well as English — local-language queries surface local producers `
    + `that English-only queries miss (a Polish factory advertises "producent mebli", not "furniture manufacturer").`;
}

/**
 * Structured output. The search returns ROWS, not prose.
 *
 * `strict: true` + a closed schema means the fields exist or are explicitly null; there is no
 * salvage parser between the model and a CRM write (security invariant 9). Every field is
 * `required` with a nullable type rather than optional, because "the model omitted it" and "the
 * model checked and there is none" are different facts and only the second one is safe to store.
 */
const RECORD_MANUFACTURERS_TOOL = {
  name: 'record_manufacturers',
  description: 'Record every manufacturer found, as structured rows. Use null for anything you could not verify — never guess a website, email or city.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      manufacturers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            company_name: { type: 'string' },
            website: { type: ['string', 'null'] },
            domain: { type: ['string', 'null'], description: 'Bare domain, e.g. "meblewojcik.pl"' },
            city: { type: ['string', 'null'] },
            country: { type: 'string' },
            products: { type: 'array', items: { type: 'string' } },
            is_manufacturer: { type: 'boolean', description: 'False for a distributor, retailer or marketplace listing.' },
            employee_estimate: { type: ['string', 'null'] },
            contact_email: { type: ['string', 'null'], description: 'Only a PUBLISHED address found on their site. Never constructed.' },
            source_urls: { type: 'array', items: { type: 'string' } },
          },
          required: ['company_name', 'website', 'domain', 'city', 'country', 'products', 'is_manufacturer', 'employee_estimate', 'contact_email', 'source_urls'],
        },
      },
    },
    required: ['manufacturers'],
  },
  strict: true,
};

/**
 * The sourcing markets are DATA — `reference_vocabularies['sourcing_markets']`, loaded by the
 * caller and passed in (issue #370, Class A).
 *
 * They used to be a const right here, reachable by nothing but the scope string a few lines below.
 * The model could not read it from the prompt, the schema (`region` was a bare `z.string()`), the
 * description (it named the five region KEYS and never their members) or the KB. Asked to "search
 * the countries list we have in place" the agent searched the Knowledge Base three times, found
 * nothing, INVENTED a list, and presented it as ours — Bulgaria in the wrong region, 13 markets
 * missing. A wrong country list is a valid country list, so nothing raised.
 *
 * Now one row set feeds the `region` enum, the description the model reads, and the picker form.
 */
export const createB2BManufacturerSearchTool = (
  /** Active `sourcing_markets` terms, in sort order. Loaded by agent-chat's registerTools. */
  markets: VocabularyTerm[],
  userId: string,
  /**
   * The workspace this tool is running in — for ATTRIBUTION on the usage row, not for the
   * debit. The per-call fee here deliberately comes from the caller's personal balance
   * (`p_workspace_id: null` below); this answers the separate question of whose tenant the
   * call belongs to, which is what decides whether a workspace admin can see it at all.
   */
  workspaceId: string | null,
  onProgress?: (status: string) => void,
  onChunk?: B2BChunkSink,
) => {
  return tool(
    async ({ country, region, category, limit = 8, _workflow_run_id }) => {
      const _blocked = await b2bAffordabilityGate(userId, 5, 'b2b_manufacturer_search');
      if (_blocked) return _blocked;
      // CLAMP, don't just document. The schema says >10 will blow the 90s tool timeout, but a
      // description is a suggestion and the model is free to ignore it — watched live on
      // 2026-08-18, the agent asked for limit 25 per region and every call was killed at 90s,
      // three times in a row, having spent full price on each. A measured 6-company search takes
      // ~52s, so anything past ~10 cannot return. Capping here converts a guaranteed timeout into
      // a smaller result plus an explicit instruction to call again, which the agent can act on.
      // 8, not 10. The clamp landed on 2026-08-18 and did NOT stop the timeouts — six more
      // followed on 08-22. The arithmetic says why: 6 companies measured at ~52s, so 10 lands
      // around 85s against what was then a 90s wall, i.e. inside the noise of a single slow
      // upstream call. agent-chat now gives this tool 110s specifically (see
      // LONG_RUNNING_TOOL_TIMEOUT_MS), and 8 keeps the expected run near 70s so the extra budget
      // is headroom rather than the new wall.
      const MAX_PER_CALL = 8;
      const requestedLimit = limit;
      if (limit > MAX_PER_CALL) limit = MAX_PER_CALL;

      // ONE resolution of what the country string means, at the boundary, so the scope clause, the
      // native-language clause, the progress line, the workflow card and the usage row all name the
      // same market. `country` is a free string by design — the model types whatever it has, and
      // `Czechia` / `Türkiye` / `UK` are ours under another name. An unresolved one is NOT an
      // error (any country is searchable), but it is worth a line in the log, because the visible
      // symptom of getting this wrong is nothing at all: the search runs and quietly loses the
      // local-language half of its query.
      const market = resolveMarket(markets, country);
      if (market) country = market.value;
      else if (country) console.warn(`[b2b_manufacturer_search] "${country}" is not a defined sourcing market — searching it in English only`);

      const runId = _workflow_run_id || crypto.randomUUID();
      const emitter = createWorkflowEmitter({ onChunk, definition_id: 'b2b-research', run_id: runId });
      emitter.plan({ title: `${category} manufacturers`, subtitle: country || region || 'global', metadata: { country, region, category, limit } });
      emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'running', status_line: `Searching for ${category} manufacturers…`, input: { country, region, category, limit } });
      try {
        if (!ANTHROPIC_API_KEY) {
          emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'failed', error_message: 'ANTHROPIC_API_KEY not configured.' });
          return JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured.' });
        }

        // Shared with flow-engine — see buildMarketScope for why there is only one of these.
        const scope = buildMarketScope(markets, { country, region });

        // Both this and flow-engine used to carry their own copy of this query, and the two
        // had already drifted — flow-engine's dropped "or retailers" and stopped asking for
        // manufacturing indicators. One row, two readers (#347 phase 3P).
        const query = renderPromptTemplate(
          await loadPrompt(supabase, 'tool', 'b2b_manufacturer_query'),
          { category, scope, limit },
        )
          // Native-language search. A Polish factory's site says "producent mebli", not "furniture
          // manufacturer", so an English-only query finds the exporters with English marketing and
          // misses the workshops — which are the interesting half for sourcing. The Insights prompt
          // has instructed this since it was written ("use native language queries — Polish,
          // Turkish, Romanian") and no code ever did it: the language mapping sat in
          // _shared/b2b-markets.ts, a file nothing imported. It now lives on the market rows.
          + nativeLanguageClause(markets, { country, region })
          // The rows are the deliverable; the prose is a courtesy.
          + '\n\nWhen you are done, call record_manufacturers with every company you found. Use null '
          + 'for any field you could not verify — never guess a website, city or email address.';

        // The system prompt has existed in the table all along with nothing reading it.
        const systemPrompt = await getToolPrompt(supabase, 'b2b_manufacturer_search');

        // Search budget. Measured: Opus 5 at effort:low used 8 searches for 6 companies and
        // finished in 52s, comfortably inside the 150s edge idle timeout. Scaling roughly with the
        // ask, floored so a small request still gets to look around and capped so one call cannot
        // run the request off the end of the window.
        const searchBudget = Math.min(20, Math.max(6, Math.ceil(limit * 1.5)));

        const regionLabel = region ? (termsInGroup(markets, region.toLowerCase())[0]?.group_label ?? region) : '';
        onProgress?.(`Searching for ${category} manufacturers${country ? ` in ${country}` : region ? ` in ${regionLabel}` : ''}...`);

        const response = await postAnthropicWithRetry({
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: SEARCH_MODEL,
            max_tokens: 8000,
            // effort:low is not a cost compromise here — it is the SETTING THAT WORKS. Measured on
            // the same 6-company Polish sweep: at default (high) effort the model over-deliberated
            // about verification and returned 3 records in 116s with ZERO domains and zero sources;
            // at low it returned 6 records in 52s with 100% domains, 1.2 sources each, for less
            // money. High effort spent its thinking refusing to assert a URL it had just read.
            output_config: { effort: 'low' },
            system: systemPrompt,
            tools: [
              { type: 'web_search_20260209', name: 'web_search', max_uses: searchBudget },
              RECORD_MANUFACTURERS_TOOL,
            ],
            messages: [{ role: 'user', content: query }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`❌ Web search API error ${response.status}: ${errText}`);
          emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'failed', error_message: `Web search failed: ${response.status}` });
          // 429/529/5xx are TRANSIENT — the request was fine, the upstream was busy. Two 529s in
          // seven seconds killed a real sweep on 2026-08-18 and sent the agent looking for a
          // background lane it did not need. `retryable` tells the agent to try again rather than
          // reroute; `postRequest` above already retries the transient ones itself, so reaching
          // here means the retries were exhausted too.
          const retryable = response.status === 429 || response.status === 529 || response.status >= 500;
          return JSON.stringify({
            success: false,
            retryable,
            error: retryable
              ? `The web search provider is overloaded (${response.status}) and did not recover after retries. `
                + `This is upstream and temporary — it is NOT a problem with the query, the account or the markets. `
                + `Say so plainly and offer to retry in a minute or to run a narrower scope now.`
              : `Web search failed: ${response.status}`,
          });
        }

        const data = await response.json();
        const blocks = (data.content ?? []) as any[];
        const textContent = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';

        // The RECORDS are the result. This used to return `search_results: <prose blob>` and
        // nothing else, so every downstream step — scrape, enrich, contact discovery — had to
        // re-read prose to find a domain, and mostly failed: ~75% of a real Poland sweep came back
        // with no website captured, which then blocked the whole rest of the pipeline. It also put
        // a CRM write at the end of a free-form parse, which security invariant 9 forbids.
        const recordBlock = blocks.find((b) => b.type === 'tool_use' && b.name === 'record_manufacturers');
        const manufacturers: any[] = Array.isArray(recordBlock?.input?.manufacturers)
          ? recordBlock.input.manufacturers
          : [];

        // Cost attribution: Opus 5 ($5 in / $25 out per MTok) + the web_search server-tool fee
        // (~$0.01/use; Anthropic does not break it out in the response, so the worst case is
        // priced from the budget we set). Measured on a real 6-company sweep: 35k in / 1.4k out
        // ≈ $0.21 before markup. These rates MUST move with SEARCH_MODEL — priced as Haiku while
        // running Opus, this row would under-report by ~6x and the operations dashboard would
        // quietly show a fraction of the real spend.
        try {
          const inputTokens = data?.usage?.input_tokens ?? 0;
          const outputTokens = data?.usage?.output_tokens ?? 0;
          const searchPrice = await resolveTokenPrice(supabase, SEARCH_MODEL);
          if (!searchPrice) {
            console.warn(`[b2b] no ai_model_pricing row for ${SEARCH_MODEL} — not charging for an unpriced call`);
            return;
          }
          const inputCost = (inputTokens / 1_000_000) * searchPrice.input;
          const outputCost = (outputTokens / 1_000_000) * searchPrice.output;
          const webSearchSurcharge = searchBudget * 0.01; // worst case: every allowed search used
          const rawCost = inputCost + outputCost + webSearchSurcharge;
          const billedCost = rawCost * searchPrice.markup;

          await supabase.rpc('debit_credits', {
            p_user_id: userId,
            p_amount: Math.round(billedCost * 100 * 100) / 100, // 1 credit = $0.01
            p_operation_type: 'b2b_manufacturer_search',
            p_description: `B2B manufacturer web search (${category})`,
            p_metadata: { country, region, category, limit, web_search_max_uses: searchBudget },
            p_workspace_id: null,
          });

          await supabase.from('ai_usage_logs').insert({
            user_id: userId,
            workspace_id: workspaceId,
            operation_type: 'b2b_manufacturer_search',
            model_name: SEARCH_MODEL,
            api_provider: 'anthropic',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            input_cost_usd: inputCost,
            output_cost_usd: outputCost,
            raw_cost_usd: rawCost,
            markup_multiplier: 1.5,
            billed_cost_usd: billedCost,
            credits_debited: Math.round(billedCost * 100 * 100) / 100,
            metadata: {
              feature: 'b2b_research',
              sub_feature: 'web_search',
              country, region, category, limit,
              web_search_surcharge_usd: webSearchSurcharge,
            },
            created_at: new Date().toISOString(),
          });
        } catch (logErr) {
          // Non-blocking — even if usage log/debit fails, the search has
          // already happened (cost already incurred on Anthropic side).
          console.warn('[b2b_manufacturer_search] cost log failed:', logErr);
        }

        const withDomain = manufacturers.filter((m) => m?.domain).length;
        onProgress?.(`Search complete — ${manufacturers.length} companies, ${withDomain} with a domain.`);
        emitter.step({
          step_id: STEPS.B2B_RESEARCH[0],
          status: 'done',
          status_line: manufacturers.length
            ? `${manufacturers.length} manufacturers (${withDomain} with a domain)`
            : 'No results found',
          output: { source: 'claude_web_search', has_results: manufacturers.length > 0, count: manufacturers.length, with_domain: withDomain },
        });

        return JSON.stringify({
          // Success is RECORDS, not prose. The old shape reported success on any text at all, so a
          // paragraph explaining that nothing was found counted as a successful search.
          success: manufacturers.length > 0,
          _workflow_run_id: runId,
          // Tell the agent it asked for more than one call can deliver, so it splits the work
          // instead of assuming the tool under-delivered.
          ...(requestedLimit > MAX_PER_CALL
            ? { limit_clamped: { requested: requestedLimit, used: MAX_PER_CALL,
                note: `Capped at ${MAX_PER_CALL} per call — more than that cannot finish inside the 90s tool timeout. Call again for another country/region, or dispatch a background task for a full multi-market sweep.` } }
            : {}),
          // `results` is the countable array shape shapeToolResult() recognises, so a search that
          // finds nothing registers as zero-result rather than as unknown — which is what stops it
          // being mistaken for work by the memory gate (#370, Class E).
          results: manufacturers,
          manufacturers,
          count: manufacturers.length,
          with_domain: withDomain,
          // Kept for the human-facing summary only. Downstream steps must read `manufacturers`:
          // parsing this prose for a domain is exactly what lost ~75% of a real Poland sweep.
          search_results: textContent || (manufacturers.length ? '' : 'No results found.'),
          query_params: { country, region, category, limit },
          source: 'claude_web_search',
        });
      } catch (error) {
        console.error('B2B manufacturer search error:', error);
        emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'failed', error_message: error instanceof Error ? error.message : 'search failed' });
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'B2B manufacturer search failed',
        });
      }
    },
    {
      name: 'b2b_manufacturer_search',
      // The description now ENUMERATES the markets, because the model cannot read the vocabulary
      // table and the old wording ("a region (cee/balkans/…)") named the keys without ever saying
      // which countries were in them. That gap is the whole reason the agent invented a list when
      // asked what countries we cover.
      description:
        'Search for B2B manufacturers using web search. Finds actual production companies with their '
        + 'websites, locations and product info. '
        + `The platform's defined sourcing markets are — ${describeGroups(markets)}. `
        + 'Pass `country` for one market (any country is searchable, not just those listed), `region` '
        + 'for a whole group, or OMIT BOTH to sweep every market above. Omitting both is a supported '
        + 'default: do not ask the user which countries they want before calling this.',
      schema: z.object({
        // Deliberately NOT interpolated: `npm run tools:manifest` is a static AST projection and
        // cannot evaluate the vocabulary, so an interpolated list lands in the manifest as a
        // literal "…". The markets are enumerated in the tool description above, which is what
        // the model reads; this stays static so the manifest stays truthful.
        country: z.string().optional().describe(
          'One country to search, e.g. "Poland". Any country is searchable, not only the defined markets listed in this tool\'s description. Omit to search a whole region or every market.',
        ),
        // A real enum, built from the vocabulary. It was a bare string, so a value the tool did not
        // recognise produced `in the <garbage> region` and searched nothing meaningful, silently.
        region: z.enum(groupKeys(markets) as [string, ...string[]]).optional().describe(
          'A whole market group. Ignored if `country` is provided.',
        ),
        category: z.string().describe('Product category (e.g., "ceramic tiles", "bathroom furniture", "flexible panels")'),
        // 8, not 30. MEASURED: 6 companies takes ~52s; the agent-chat tool runner kills a tool at
        // 90s (tighter than the 150s edge idle timeout I had been sizing against), and on
        // 2026-08-18 three real sweeps died on exactly that — `Tool 'b2b_manufacturer_search'
        // timed out after 90s`. A default of 30 could therefore never return: the call was
        // guaranteed to be killed before it answered, which reads to the agent as a broken tool
        // rather than an over-large request. Ask for more than ~10 and you need the background
        // lane, not a bigger timeout.
        limit: z.number().optional().default(8).describe('Max manufacturers per call, hard-capped at 8. A larger number is silently clamped, not honoured — one call researches at most 8 companies. For more, run several calls (vary country/region/category) or dispatch a background task.'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from `[workflow:b2b-research/search:<run_id>]` prefix.'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Website Scrape
 * Uses Firecrawl API to extract structured information from company websites
 */
export const createCompanyWebsiteScrapeTool = (
  userId: string,
  /** Attribution only — see createB2BManufacturerSearchTool. */
  workspaceId: string | null,
  onProgress?: (status: string) => void,
) => {
  return tool(
    async ({ url, extract, country }) => {
      const _blocked = await b2bAffordabilityGate(userId, 15, 'company_website_scrape');
      if (_blocked) return _blocked;
      try {
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Scraping website: ${url}...`);

        const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
        if (!FIRECRAWL_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'FIRECRAWL_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        // Charge BEFORE the paid call (invariant 10). This debit was previously below, after
        // Firecrawl had already run and been paid for; its result was discarded, so an exhausted
        // workspace scraped for free at our expense. Moving it changes nothing about WHAT is
        // billed -- this scrape is charged whether or not it returns content -- only about
        // whether we find out we cannot bill for it before or after we pay. (audit #312)
        {
          const refusal = await debitOrRefuse(supabase, userId, 'firecrawl-scrape', 'company_website_scrape', 1, { url });
          if (refusal) return refusal;
        }

        // Scrape the website using Firecrawl with timeout (30 seconds)
        const TIMEOUT_MS = 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: url,
              // `links` carries the page's own `tel:` and `mailto:` hrefs — a phone number the site
              // author declared, rather than a digit run a pattern guessed at. That distinction
              // matters on this platform's targets, whose pages are full of article codes and size
              // charts that any general phone regex matches perfectly.
              formats: ['markdown', 'links'],
              // onlyMainContent is a deterministic HTML filter that removes header, nav and FOOTER —
              // and Firecrawl applies it to `links` as well as to the markdown. The footer and the
              // imprint are exactly where a company publishes its switchboard number, its contact
              // address and its VAT number, so leaving this on meant paying to fetch the page and
              // then discarding the three fields most worth having, before asking a model to find
              // contact details in text they had been stripped from.
              //
              // The cost of turning it off is some nav boilerplate in the markdown the analysis
              // model reads. That trade is worth taking here: this tool profiles a COMPANY, and the
              // legal footer is signal for that, not noise.
              onlyMainContent: false,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Website scrape timeout after ${TIMEOUT_MS / 1000} seconds. The site may be slow or blocking scrapers.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Firecrawl API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Firecrawl API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const scrapeElapsed = Date.now() - startTime;

        const markdown = data.data?.markdown || '';
        const metadata = data.data?.metadata || {};

        // If no content was scraped, return early with metadata only
        if (!markdown || markdown.length < 100) {
          return JSON.stringify({
            success: true,
            url: url,
            company_data: { error: 'Could not extract meaningful content from website' },
            page_title: metadata.title || '',
            page_description: metadata.description || '',
            elapsed_ms: scrapeElapsed,
          });
        }

        // Use Claude to extract structured company information from the scraped content
        const extractSections = extract || ['about', 'products', 'contact', 'certifications'];

        // Send progress update for analysis phase
        onProgress?.(`Analyzing website content...`);

        let companyData;
        let analysisFailure: string | null = null;
        try {
          // The model name comes from ANALYSIS_MODEL, not a literal. This constructor carried its
          // own `'claude-opus-4-8'` string while the cost log below read ANALYSIS_MODEL — the very
          // drift the constant was introduced to stop, reintroduced one scope down.
          //
          // NO `temperature`. It was 0.3 here, and sampling parameters are REMOVED on Opus 4.7+
          // and Sonnet 5: langchain-anthropic's validateInvocationParamCompatibility throws before
          // the request is sent. So this pass threw on EVERY call and the catch below quietly
          // handed back a 2 000-character preview instead — see the comment there.
          const analysisModel = new ChatAnthropic({
            model: ANALYSIS_MODEL,
            maxTokens: 2048,
          });

          // Load prompt from database (editable via /admin/ai-configs)
          const scraperPrompt = await getToolPrompt(supabase, 'company_website_scraper');

          const analysisPrompt = `${scraperPrompt}

Sections to extract: ${extractSections.join(', ')}

Website content:
${markdown.substring(0, 15000)}`;

          const analysisResponse = await analysisModel.invoke([
            { role: 'user', content: analysisPrompt }
          ]);

          const analysisText = typeof analysisResponse.content === 'string'
            ? analysisResponse.content
            : analysisResponse.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n');

          // Cost log for the website-analysis pass. The rate is NOT written here: this block
          // charged 15.00/75.00 while the row it writes says claude-opus-4-8, whose real rate is
          // 5.00/25.00 — a 3x overcharge on every scrape, from a literal whose own comment named
          // yet a third model (Opus 4.7). One derivation, from ai_model_pricing. The agent tool
          // currently only debits the firecrawl scrape (~$0.001) but the Opus
          // pass on a 15K-char page costs orders of magnitude more — without
          // this log + debit, every scrape silently absorbs $0.05-0.15 of
          // platform cost.
          try {
            const usage = (analysisResponse as any).usage_metadata
              ?? (analysisResponse as any).response_metadata?.usage
              ?? {};
            const inputTokens = usage.input_tokens ?? usage.inputTokens ?? 0;
            const outputTokens = usage.output_tokens ?? usage.outputTokens ?? 0;
            if (inputTokens > 0 || outputTokens > 0) {
              const price = await resolveTokenPrice(supabase, ANALYSIS_MODEL);
              if (!price) {
                console.warn(`[b2b] no ai_model_pricing row for ${ANALYSIS_MODEL} — not charging for an unpriced call`);
                return;
              }
              const inputCost = (inputTokens / 1_000_000) * price.input;
              const outputCost = (outputTokens / 1_000_000) * price.output;
              const rawCost = inputCost + outputCost;
              const billedCost = rawCost * price.markup;
              const creditsToDebit = Math.round(billedCost * 100 * 100) / 100;

              await supabase.rpc('debit_credits', {
                p_user_id: userId,
                p_amount: creditsToDebit,
                p_operation_type: 'company_website_scrape_analysis',
                p_description: 'Claude Opus website analysis',
                p_metadata: { url, sections: extractSections },
                p_workspace_id: null,
              });
              await supabase.from('ai_usage_logs').insert({
                user_id: userId,
                workspace_id: workspaceId,
                operation_type: 'company_website_scrape_analysis',
                model_name: ANALYSIS_MODEL,
                api_provider: 'anthropic',
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                input_cost_usd: inputCost,
                output_cost_usd: outputCost,
                raw_cost_usd: rawCost,
                markup_multiplier: 1.5,
                billed_cost_usd: billedCost,
                credits_debited: creditsToDebit,
                metadata: { feature: 'b2b_research', sub_feature: 'website_scrape_analysis', url },
                created_at: new Date().toISOString(),
              });
            }
          } catch (logErr) {
            console.warn('[company_website_scrape] cost log failed:', logErr);
          }

          // Try to parse the JSON response
          try {
            // Remove any markdown code blocks if present
            const jsonStr = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            companyData = JSON.parse(jsonStr);
          } catch {
            companyData = { raw_analysis: analysisText };
          }
        } catch (analysisError) {
          // A FAILED ANALYSIS IS A FAILED CALL. Say so at the top level.
          //
          // This used to set `company_data.error` and a `raw_markdown_preview` of the first 2 000
          // characters, and the response still said `success: true`. The model reading it could
          // not tell a short page from a truncated one, so on 2026-08-25 an agent asked to
          // enumerate a competitor's brands from `pwb-brand-sitemap.xml` received the first ~29
          // slugs of ~100, concluded "the scraper truncates at ~2000 chars", and spent its whole
          // iteration budget inventing workarounds for a bug that was in this catch block. Eight
          // paid Firecrawl fetches, one useful answer between them.
          //
          // No preview: a partial page shaped like a whole one is worse than no page. The agent
          // is told which tool actually returns page text instead.
          analysisFailure = analysisError instanceof Error ? analysisError.message : String(analysisError);
          console.error('Claude analysis error:', analysisError);
          companyData = null;
        }

        // Deterministic contact extraction, beside the model rather than through it. A regex that
        // finds nothing is visibly empty; a model asked for a phone number returns something that
        // looks like one. The `country` hint is what unlocks a VAT written bare under a local label
        // ("P.IVA 01411010356", "ΑΦΜ: …") — without a country there is no telling a 9-digit Greek
        // ΑΦΜ from a 9-digit German USt-IdNr, so that case is skipped rather than guessed.
        const contacts = extractContactDetails(markdown, data.data?.links, country);

        const totalElapsed = Date.now() - startTime;

        // The contact extraction above is deterministic and still ran, so a failed analysis pass
        // does not make the call worthless — but it does make it UNSUCCESSFUL, and the caller has
        // to be able to tell. `success: false` plus whatever we do have, never a plausible stub.
        if (analysisFailure) {
          return JSON.stringify({
            success: false,
            url: url,
            error: `Page fetched, but the analysis pass failed: ${analysisFailure}`,
            analysis_failed: true,
            contact_details: contacts,
            page_title: metadata.title || '',
            page_description: metadata.description || '',
            page_chars: markdown.length,
            next_step: 'The contact details above are read straight off the page and are reliable. '
              + 'For the page TEXT itself (a sitemap, a brand index, a product list), call web_fetch '
              + 'on this URL — it returns the document rather than a profile of the company.',
            elapsed_ms: totalElapsed,
          });
        }

        return JSON.stringify({
          success: true,
          url: url,
          company_data: companyData,
          contact_details: contacts,
          // The VAT number is the point of all this. `create_company_from_vat` already turns one
          // into an official ΑΑΔΕ / VIES record — legal name, registered address — and VIES covers
          // all 27 member states, but discovery could never reach it because a web search yields a
          // name and VIES needs a VAT. The company's own site is the link between the two.
          ...(contacts.vat_numbers.length
            ? {
              next_step: `Found VAT ${contacts.vat_numbers[0].country_code}${contacts.vat_numbers[0].vat_number}. `
                + `Call create_company_from_vat with country_code="${contacts.vat_numbers[0].country_code}" and `
                + `vat_number="${contacts.vat_numbers[0].vat_number}" to pull the OFFICIAL registered name and `
                + `address, which beats anything read off the page. Note Germany and Spain return no name.`,
            }
            : {}),
          page_title: metadata.title || '',
          page_description: metadata.description || '',
          elapsed_ms: totalElapsed,
        });
      } catch (error) {
        console.error('Company website scrape error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Website scrape failed',
        });
      }
    },
    {
      name: 'company_website_scrape',
      description: 'Scrape a company website to extract structured information about the company, products, and verify if they are a B2B manufacturer. Also returns `contact_details` read straight off the page — phone numbers from its own tel: links, emails, and the VAT number from its footer or imprint. A VAT number here is worth more than anything else on the page: pass it to create_company_from_vat for the OFFICIAL registered name and address.',
      schema: z.object({
        url: z.string().describe('Company website URL to scrape'),
        extract: z.array(z.string()).optional().describe('Sections to extract: about, products, contact, certifications'),
        country: z.string().optional().describe(
          '2-letter ISO country code of the company. Pass it whenever you know it: it is what lets a VAT '
          + 'number written bare under a local label ("P.IVA 01411010356", "ΑΦΜ: …") be recognised, and a VAT '
          + 'number is what unlocks the official registry name via create_company_from_vat.',
        ),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Enrichment
 * Uses Apollo.io API to get structured company data from B2B databases
 */
export const createCompanyEnrichmentTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ company_name, domain, country }) => {
      const _blocked = await b2bAffordabilityGate(userId, 5, 'company_enrichment');
      if (_blocked) return _blocked;
      try {
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Enriching company data for ${company_name}...`);

        // Breaker: Apollo already told us it is unusable, moments ago. Do not spend another
        // round trip finding that out again.
        if (apolloIsKnownDown()) return APOLLO_DOWN_PAYLOAD;

        const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
        if (!APOLLO_API_KEY) {
          return JSON.stringify({
            success: false,
            enrichment_unavailable: true,
            retryable: false,
            error: 'Apollo enrichment is not configured (APOLLO_API_KEY is unset), and it is read from '
              + 'the environment so it cannot be added without a redeploy. Do NOT retry. Enrichment is '
              + 'optional — continue with the data you have and save to CRM if that is what was asked.',
          });
        }

        // Charged even if no results -- which is exactly why this belongs BEFORE the call rather
        // than after it. Same billing outcome, but a workspace that cannot pay no longer gets the
        // Apollo query run on our account first. (audit #312)
        {
          const refusal = await debitOrRefuse(supabase, userId, 'apollo-enrich', 'company_enrichment', 1, { company_name, domain });
          if (refusal) return refusal;
        }

        // Search for the company in Apollo.io with timeout (20 seconds)
        const TIMEOUT_MS = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'X-Api-Key': APOLLO_API_KEY,
            },
            body: JSON.stringify({
              q_organization_name: company_name,
              organization_locations: country ? [country] : undefined,
              organization_domains: domain ? [domain] : undefined,
              page: 1,
              per_page: 5,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Apollo API timeout after ${TIMEOUT_MS / 1000} seconds.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Apollo API error: ${response.status} - ${errorText}`);
          // 401/402/403 mean the Apollo account itself is unusable — wrong key, no plan, no
          // credit. Retrying cannot fix that, and a bare "Apollo API error: 403" reads to the
          // agent as a transient blip: on 2026-08-19 it retried enrichment for 190 seconds and
          // never reached the CRM save the user had actually asked for. Enrichment is a NICE-TO-
          // HAVE — save_to_crm needs a company name and nothing else — so the failure says so.
          const unavailable = response.status === 401 || response.status === 402 || response.status === 403;
          if (unavailable) apolloUnavailableUntil = Date.now() + APOLLO_BREAKER_MS;
          return JSON.stringify({
            success: false,
            enrichment_unavailable: unavailable,
            retryable: !unavailable,
            error: unavailable
              ? `Apollo enrichment is unavailable (${response.status}: key missing, unfunded or forbidden). `
                + `Do NOT retry it and do NOT call it for other companies this turn — it will fail the same way. `
                + `Enrichment is optional: continue with what you already have from the search and the website `
                + `scrape, save to CRM if that is what was asked (save_to_crm needs only a company name), and `
                + `mention in one line that employee-count/revenue enrichment was skipped because the provider `
                + `is unavailable.`
              : `Apollo API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        const companies = data.organizations || [];

        if (companies.length === 0) {
          return JSON.stringify({
            success: true,
            found: false,
            message: 'No matching company found in Apollo database',
            query: { company_name, domain, country },
          });
        }

        // Return the best match
        const company = companies[0];

        return JSON.stringify({
          success: true,
          found: true,
          company: {
            name: company.name,
            domain: company.primary_domain,
            industry: company.industry,
            employee_count: company.estimated_num_employees,
            employee_range: company.organization_estimated_num_employees,
            founded_year: company.founded_year,
            linkedin_url: company.linkedin_url,
            headquarters: {
              city: company.city,
              state: company.state,
              country: company.country,
            },
            phone: company.phone,
            technologies: company.technologies || [],
            keywords: company.keywords || [],
            annual_revenue: company.annual_revenue,
            total_funding: company.total_funding,
          },
          total_matches: companies.length,
          elapsed_ms: elapsed,
          source: 'apollo.io',
        });
      } catch (error) {
        console.error('Company enrichment error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Company enrichment failed',
        });
      }
    },
    {
      name: 'company_enrichment',
      description: 'Get structured company data from B2B databases including employee count, founding year, industry, LinkedIn URL, and headquarters location.',
      schema: z.object({
        company_name: z.string().describe('Company name to search for'),
        domain: z.string().optional().describe('Company website domain (e.g., "paradyz.com")'),
        country: z.string().optional().describe('Country to filter results'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Official-registry lookup — FREE, and deliberately so.
 *
 * The paid providers (Apollo here, Explee in #334) sell employee counts, revenue and
 * technographics. Those are not the only things worth knowing about a factory, and they were the
 * only things we were paying to learn. The official registries answer a different and, for a
 * SOURCING workflow, more load-bearing question — is this a real, active legal entity, what is it
 * called on paper, where is it registered, what is its registration number — and they answer it
 * for nothing, from public endpoints that need no key and no account.
 *
 * This is NOT a second copy of `create_company_from_vat`. That tool goes VAT → company through
 * ΑΑΔΕ / VIES, which is the right path when someone hands you a VAT number. Discovery runs the
 * other way: `b2b_manufacturer_search` yields a NAME and a website and no VAT at all, so the VIES
 * path cannot be entered from it. This closes that gap by starting from the name, and the
 * registration id it recovers is what makes the existing VIES/ΑΑΔΕ path reachable afterwards.
 * Chain them; do not reimplement either.
 *
 * GLEIF is the always-on source — 3.4M legal entities worldwide, so it answers for every one of
 * the 30 `sourcing_markets`. On top of it sits `NATIONAL_REGISTRIES`, a ROUTING TABLE keyed by
 * country: the authoritative national register, where that country publishes one for free.
 *
 * The table is the point. Adding a country is one entry — an endpoint and a mapper — not a new
 * branch in the tool body, and the covered list is derived from the table in one place so the
 * tool description, the response and the guard test cannot disagree about what is covered.
 *
 * Every entry below was run against the live endpoint before it was added. What did NOT survive
 * that, and should not be re-added without re-measuring:
 *   • Germany (OffeneRegister) — persistent 502. The service is down, not slow.
 *   • Greece (ΓΕΜΗ)           — no public API. Greece is served by ΑΑΔΕ through
 *                               `create_company_from_vat`, which needs the ΑΦΜ.
 *   • BG, SI, HR, LT, LV, UA, IT, PT — no free machine-readable company lookup; the "open data"
 *                               portals publish dataset CATALOGUES, not a company endpoint.
 *   • UK (Companies House) and NL (KVK) — both 401. Free, but they need a registration key, so
 *                               they are a decision to make rather than something to just wire.
 *   • OpenStreetMap           — was in here as "the free phone source" and was removed. Overpass
 *                               times out on a country-wide name regex (it is not a name search
 *                               engine) and Nominatim returned a phone for none of four test
 *                               manufacturers. It reported `unavailable` on 100% of calls while
 *                               the tool still looked healthy — the silent-zero shape exactly.
 *
 * Every source reports `hit` / `miss` / `unavailable` SEPARATELY (pipeline convention 1). A single
 * empty return would collapse "the Czech register has no such company" into "the Czech register
 * was down", and only the first of those means the answer is actually no.
 */
const REGISTRY_TIMEOUT_MS = 12000;

type RegistrySource = { status: 'hit' | 'miss' | 'unavailable'; error?: string; [k: string]: unknown };

/** Fetch with a hard deadline. Never throws — an unreachable registry is a reported state, not a crash. */
async function registryFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const { timeoutMs = REGISTRY_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...rest, signal: controller.signal });
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      body: null,
      error: aborted ? `timed out after ${timeoutMs}ms` : (e instanceof Error ? e.message : 'fetch failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does the searched-for name actually appear in this company's legal name?
 *
 * GLEIF's `filter[fulltext]` searches every indexed field, not just the name — a director's
 * surname, an "other name", an address line. Searching Italy for **Marazzi** returns
 * **PRO-BIKE SRL as the top result**, and the word Marazzi is nowhere in that company's name. Six
 * genuine MARAZZI companies rank below it. Handed straight to the agent that is not a bad match,
 * it is a DIFFERENT COMPANY presented as a confident hit, with a real LEI and a real address on it.
 *
 * Transliterated before folding, because dropping a non-matching result would otherwise break the
 * case this platform cares most about: GLEIF holds Karelia as `ΚΑΠΝΟΒΙΟΜΗΧΑΝΙΑ ΚΑΡΕΛΙΑ ΑΝΩΝΥΜΟΣ
 * ΕΤΑΙΡΕΙΑ`, and a Latin query never touches Greek text. `foldForSearch` handles case and accents
 * and explicitly does NOT transliterate — that is `transliterateToLatin`'s job, and both are needed.
 */
function nameMatchesQuery(query: string, legalName: unknown): boolean {
  const fold = (v: unknown) => foldForSearch(transliterateToLatin(String(v ?? '')) ?? String(v ?? ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const haystack = fold(legalName);
  if (!haystack) return false;
  // Tokens under 3 chars are legal-form noise ("sa", "srl", "ag") and match everything.
  const tokens = fold(query).split(' ').filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  return tokens.every((t) => haystack.includes(t));
}

/**
 * GLEIF fulltext search.
 *
 * `filter[entity.legalName]` is an exact-ish match and misses real companies — "KARELIA" returns
 * nothing through it and 15 records through fulltext. Use fulltext, then re-rank by whether the
 * name actually matches, because fulltext's own ranking does not (see `nameMatchesQuery`).
 */
async function lookupGleif(name: string, country?: string): Promise<RegistrySource> {
  const params = new URLSearchParams({ 'filter[fulltext]': name, 'page[size]': '5' });
  if (country) params.set('filter[entity.legalAddress.country]', country);
  const r = await registryFetch(`https://api.gleif.org/api/v1/lei-records?${params}`, {
    headers: { Accept: 'application/vnd.api+json' },
  });
  if (!r.ok) return { status: 'unavailable', error: r.error || `GLEIF HTTP ${r.status}` };
  const records = Array.isArray(r.body?.data) ? r.body.data : [];
  if (!records.length) return { status: 'miss' };
  const mapped = records.map((rec: any) => {
      const e = rec?.attributes?.entity ?? {};
      const addr = e.legalAddress;
      return {
        lei: rec?.attributes?.lei ?? null,
        legal_name: e.legalName?.name ?? null,
        legal_form: e.legalForm?.id ?? null,
        status: e.status ?? null,
        registered_as: e.registeredAs ?? null,
        jurisdiction: e.jurisdiction ?? null,
        name_matches_query: nameMatchesQuery(name, e.legalName?.name),
        registered_address: addr
          ? {
            lines: addr.addressLines ?? [],
            city: addr.city ?? null,
            region: addr.region ?? null,
            postal_code: addr.postalCode ?? null,
            country: addr.country ?? null,
          }
          : null,
      };
  });

  // Re-ranked, never filtered. Dropping the non-matching ones would be wrong for the case this
  // platform cares most about: a name written in another script is a legitimate match that this
  // check cannot always confirm, and a silent drop there is worse than a flagged extra row.
  const byName = mapped.filter((m: any) => m.name_matches_query);
  const rest = mapped.filter((m: any) => !m.name_matches_query);

  return {
    status: 'hit',
    total: r.body?.meta?.pagination?.total ?? mapped.length,
    name_matched: byName.length,
    ...(byName.length ? {} : {
      caution: 'GLEIF matched these on some field OTHER than the legal name — a director\'s surname, '
        + 'an address, a former name. Treat them as leads, not as this company, and confirm against '
        + 'the national register before saving anything.',
    }),
    matches: [...byName, ...rest],
  };
}

/**
 * The national-registry routing table.
 *
 * `keyedBy` is the part that decides the call shape, not a detail:
 *   • 'name' — the register has a name search, so it runs CONCURRENTLY with GLEIF.
 *   • 'id'   — the register only answers on its own registration number (Poland's KRS, Romania's
 *              CUI). Those wait for GLEIF, because GLEIF's `registeredAs` IS that number, which is
 *              what turns "I have a company name" into a national-register hit with no VAT and no
 *              paid provider in between.
 *
 * `timeoutMs` overrides the default only where a register is measurably slow. Slovakia's RPO takes
 * ~5s consistently; the default 12s would be a coin-flip for it, and a timeout there would be
 * reported as `unavailable` — the register saying nothing is not the same as the register being
 * down, and the whole point of the per-source verdicts is keeping those apart.
 */
/**
 * Pick the CURRENT entry out of a register's versioned list.
 *
 * Slovakia and Finland both return every name and address a company has ever had, each with a
 * validity window. Taking the first — or the last — element gives you whichever one the register
 * happened to order first: the Slovak lookup for "Slovenské magnezitové závody" returned the
 * 1993 state-enterprise name, expired in 1995, presented as the company's name. A wrong-but-real
 * company name is the money-number defect wearing different clothes: it is a valid string, so
 * nothing raises, and the operator writes to a company that has not existed for thirty years.
 *
 * An open window (`validTo` / `endDate` absent) is current. Failing that, the latest start wins.
 */
function currentVersion<T extends Record<string, any>>(arr: unknown, from: string, to: string): T | null {
  if (!Array.isArray(arr) || !arr.length) return null;
  const open = arr.filter((x) => x && !x[to]);
  const pool = open.length ? open : arr;
  return pool.reduce((best, x) => (String(x?.[from] ?? '') > String(best?.[from] ?? '') ? x : best), pool[0]) as T;
}

/**
 * Put the still-trading companies first, keeping the register's own order within each group.
 *
 * A national register ranks by string match, not by whether the company still exists. Searching
 * RPO for "Slovenské magnezitové závody" returns four state enterprises wound up between 1994 and
 * 1996 ABOVE the a.s. that succeeded them, and the live one is fifth. An agent reading match[0]
 * gets a factory that closed thirty years ago, and every field on it is real — which is why this
 * cannot be left to the caller to notice.
 */
function activeFirst<T extends { registration_status?: string | null }>(matches: T[]): T[] {
  const isActive = (m: T) => !String(m.registration_status ?? '').startsWith('DISSOLVED');
  return [...matches.filter(isActive), ...matches.filter((m) => !isActive(m))];
}

type RegistryLookupArgs = { name: string; registrationId?: string };
type NationalRegistry = {
  /** Human name, used in the tool description and the response. */
  register: string;
  keyedBy: 'name' | 'id';
  /** What the id IS, so the agent can tell the operator what to go and find. */
  idLabel?: string;
  timeoutMs?: number;
  lookup: (args: RegistryLookupArgs) => Promise<RegistrySource>;
};

const NATIONAL_REGISTRIES: Record<string, NationalRegistry> = {
  CZ: {
    register: 'ARES (Czech business register)',
    keyedBy: 'name',
    lookup: async ({ name }) => {
      const r = await registryFetch('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ obchodniJmeno: name, pocet: 5 }),
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `ARES HTTP ${r.status}` };
      const rows = Array.isArray(r.body?.ekonomickeSubjekty) ? r.body.ekonomickeSubjekty : [];
      if (!rows.length) return { status: 'miss' };
      return {
        status: 'hit',
        total: r.body?.pocetCelkem ?? rows.length,
        matches: rows.map((row: any) => ({
          registration_id: row.ico ?? null,
          legal_name: row.obchodniJmeno ?? null,
          address: row.sidlo?.textovaAdresa ?? null,
          city: row.sidlo?.nazevObce ?? null,
          country: row.sidlo?.kodStatu ?? 'CZ',
        })),
      };
    },
  },

  SK: {
    register: 'RPO (Slovak register of legal entities)',
    keyedBy: 'name',
    // ~5s measured, every time. See the note above the table.
    timeoutMs: 20000,
    lookup: async ({ name }) => {
      const r = await registryFetch(`https://api.statistics.sk/rpo/v1/search?fullName=${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json' },
        timeoutMs: 20000,
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `RPO HTTP ${r.status}` };
      const rows = Array.isArray(r.body?.results) ? r.body.results : [];
      if (!rows.length) return { status: 'miss' };
      return {
        status: 'hit',
        total: rows.length,
        matches: activeFirst(rows.slice(0, 5).map((row: any) => {
          const nm = currentVersion<any>(row.fullNames, 'validFrom', 'validTo');
          const addr = currentVersion<any>(row.addresses, 'validFrom', 'validTo');
          const ident = currentVersion<any>(row.identifiers, 'validFrom', 'validTo');
          return {
            registration_id: ident?.value ?? null,
            legal_name: nm?.value ?? null,
            address: addr ? [addr.street, addr.buildingNumber, addr.municipality?.value, addr.postalCodes?.[0]].filter(Boolean).join(' ') || null : null,
            city: addr?.municipality?.value ?? null,
            // `currentVersion` prefers an OPEN window, so a closed one coming back means the
            // company has no open version at all — it is dissolved, not merely renamed. RPO answers
            // a name search with defunct entities ranked alongside live ones ("Slovenské magnezitové
            // závody, štátny podnik" wound up in 1995 outranks the a.s. that succeeded it), and
            // without this the agent would offer an operator a factory that closed thirty years ago
            // as a sourcing candidate. Nothing about the record looks wrong; it is just over.
            registration_status: nm?.validTo ? `DISSOLVED (${nm.validTo})` : 'ACTIVE',
            country: 'SK',
          };
        })),
      };
    },
  },

  EE: {
    register: 'Äriregister (Estonian business register)',
    keyedBy: 'name',
    lookup: async ({ name }) => {
      const r = await registryFetch(`https://ariregister.rik.ee/est/api/autocomplete?q=${encodeURIComponent(name)}&results=5`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `Äriregister HTTP ${r.status}` };
      const rows = Array.isArray(r.body?.data) ? r.body.data : [];
      if (!rows.length) return { status: 'miss' };
      return {
        status: 'hit',
        total: rows.length,
        matches: rows.slice(0, 5).map((row: any) => ({
          registration_id: row.reg_code != null ? String(row.reg_code) : null,
          legal_name: row.name ?? null,
          address: row.legal_address ?? null,
          postal_code: row.zip_code ?? null,
          // 'R' is registrisse kantud — entered in the register, i.e. active.
          registration_status: row.status === 'R' ? 'ACTIVE' : (row.status ?? null),
          country: 'EE',
        })),
      };
    },
  },

  FI: {
    register: 'PRH / YTJ (Finnish Patent and Registration Office)',
    keyedBy: 'name',
    lookup: async ({ name }) => {
      const r = await registryFetch(`https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name=${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `PRH HTTP ${r.status}` };
      const rows = Array.isArray(r.body?.companies) ? r.body.companies : [];
      if (!rows.length) return { status: 'miss' };
      return {
        status: 'hit',
        total: r.body?.totalResults ?? rows.length,
        matches: activeFirst(rows.slice(0, 5).map((row: any) => {
          // Same versioned shape as Slovakia, different field names.
          const nm = currentVersion<any>(row.names, 'registrationDate', 'endDate');
          const addr = currentVersion<any>(row.addresses, 'registrationDate', 'endDate');
          return {
            registration_id: row.businessId?.value ?? null,
            legal_name: nm?.name ?? null,
            address: addr ? [addr.street, addr.buildingNumber, addr.postCode, addr.postOffices?.[0]?.city].filter(Boolean).join(' ') || null : null,
            activity_code: row.mainBusinessLine?.type ?? null,
            // Same reasoning as Slovakia: no open name version means the company is wound up.
            registration_status: nm?.endDate ? `DISSOLVED (${nm.endDate})` : 'ACTIVE',
            country: 'FI',
          };
        })),
      };
    },
  },

  FR: {
    register: 'Recherche Entreprises (INSEE / INPI, data.gouv.fr)',
    keyedBy: 'name',
    lookup: async ({ name }) => {
      const r = await registryFetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(name)}&per_page=5`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `Recherche Entreprises HTTP ${r.status}` };
      const rows = Array.isArray(r.body?.results) ? r.body.results : [];
      if (!rows.length) return { status: 'miss' };
      return {
        status: 'hit',
        total: r.body?.total_results ?? rows.length,
        matches: rows.slice(0, 5).map((row: any) => ({
          registration_id: row.siren ?? null,
          legal_name: row.nom_raison_sociale || row.nom_complet || null,
          address: row.siege?.adresse ?? null,
          city: row.siege?.libelle_commune ?? null,
          postal_code: row.siege?.code_postal ?? null,
          // NAF is the French NACE code — 23.44Z is "manufacture of other technical ceramic
          // products", which is the single most useful field here for telling a factory from a
          // reseller without reading a website.
          activity_code_naf: row.siege?.activite_principale ?? null,
          employee_range: row.tranche_effectif_salarie ?? null,
          establishments: row.nombre_etablissements_ouverts ?? null,
          registration_status: row.etat_administratif === 'A' ? 'ACTIVE' : (row.etat_administratif ?? null),
          country: 'FR',
        })),
      };
    },
  },

  PL: {
    register: 'KRS (Polish National Court Register)',
    keyedBy: 'id',
    idLabel: 'KRS number (10 digits) — GLEIF returns it as `registered_as`',
    lookup: async ({ registrationId }) => {
      const krs = String(registrationId ?? '').replace(/\D/g, '').padStart(10, '0');
      if (krs.length !== 10) return { status: 'miss', error: 'KRS needs a 10-digit KRS number' };
      // Two registers share the numbering space: P (entrepreneurs) and S (associations). A factory
      // is in P; try it first and fall back rather than reporting a miss on the wrong register.
      for (const rejestr of ['P', 'S']) {
        const r = await registryFetch(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=${rejestr}&format=json`, {
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) {
          if (r.status === 404) continue;
          return { status: 'unavailable', error: r.error || `KRS HTTP ${r.status}` };
        }
        const d = r.body?.odpis?.dane;
        const head = r.body?.odpis?.naglowekA;
        if (!d) continue;
        const ident = d?.dzial1?.danePodmiotu ?? {};
        const seat = d?.dzial1?.siedzibaIAdres ?? {};
        return {
          status: 'hit',
          match: {
            registration_id: head?.numerKRS ?? krs,
            legal_name: ident?.nazwa ?? null,
            legal_form: ident?.formaPrawna ?? null,
            vat_number: ident?.identyfikatory?.nip ?? null,
            statistical_id_regon: ident?.identyfikatory?.regon ?? null,
            address: [seat?.adres?.ulica, seat?.adres?.nrDomu, seat?.adres?.kodPocztowy, seat?.adres?.miejscowosc].filter(Boolean).join(' ') || null,
            city: seat?.siedziba?.miejscowosc ?? seat?.adres?.miejscowosc ?? null,
            registered_since: head?.dataRejestracjiWKRS ?? null,
            country: 'PL',
          },
        };
      }
      return { status: 'miss' };
    },
  },

  RO: {
    register: 'ANAF (Romanian tax authority)',
    keyedBy: 'id',
    idLabel: 'CUI / CIF (the Romanian tax id)',
    lookup: async ({ registrationId }) => {
      const cui = String(registrationId ?? '').replace(/\D/g, '');
      if (!cui) return { status: 'miss', error: 'ANAF needs a Romanian CUI' };
      // UTC today is correct HERE, and it is not the `todayLocalISO()` case (CLAUDE.md 1b). This is
      // not a date of record: it is "was this company VAT-registered as at date X" asked of a
      // Romanian government API, and the operator's local midnight has no bearing on the answer.
      const asAt = new Date().toISOString().slice(0, 10);
      const r = await registryFetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ cui: Number(cui), data: asAt }]),
      });
      if (!r.ok) return { status: 'unavailable', error: r.error || `ANAF HTTP ${r.status}` };
      const found = Array.isArray(r.body?.found) ? r.body.found : [];
      if (!found.length) return { status: 'miss' };
      const g = found[0]?.date_generale ?? {};
      return {
        status: 'hit',
        match: {
          registration_id: g.cui != null ? String(g.cui) : null,
          legal_name: g.denumire ?? null,
          address: g.adresa ?? null,
          phone: g.telefon || null,
          activity_code_caen: g.cod_CAEN ?? null,
          legal_form: g.forma_juridica ?? null,
          trade_register_no: g.nrRegCom ?? null,
          registration_status: g.stare_inregistrare ?? null,
          vat_registered: found[0]?.inregistrare_scop_Tva?.scpTVA ?? null,
          country: 'RO',
        },
      };
    },
  },
};

/** Countries with a national register wired in, derived from the table so nothing can drift out of step. */
const REGISTRY_COUNTRIES = Object.keys(NATIONAL_REGISTRIES).sort();

export const createCompanyRegistryLookupTool = (_userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ company_name, country, registration_id, domain }) => {
      const name = String(company_name || '').trim();
      if (!name) return JSON.stringify({ success: false, error: 'Provide a company name.' });
      const cc = String(country || '').trim().toUpperCase().slice(0, 2) || undefined;

      onProgress?.(`Checking official registries for ${name}…`);
      const startTime = Date.now();

      // Concurrent, because the sources are independent and the slowest should set the wall clock
      // rather than the sum. `registryFetch` never throws, so no source can take the others down.
      const registry = cc ? NATIONAL_REGISTRIES[cc] : undefined;

      // A name-keyed register runs alongside GLEIF; an id-keyed one has to wait for it, because
      // GLEIF's `registeredAs` IS the id it needs. That chain is the whole trick: it turns a
      // company NAME into a national-register record with no VAT number and no paid provider in
      // between, which is the step discovery could not previously take at any price.
      const gleifPromise = lookupGleif(name, cc);
      const nationalPromise: Promise<RegistrySource> = !registry
        ? Promise.resolve<RegistrySource>({
          status: 'miss',
          error: cc
            ? `No free national register wired for ${cc}. Covered: ${REGISTRY_COUNTRIES.join(', ')}.`
            : 'Pass `country` to reach a national register.',
        })
        : registry.keyedBy === 'name'
          ? registry.lookup({ name })
          : gleifPromise.then((g) => {
            const fromGleif = g.status === 'hit'
              ? ((g.matches as any[])?.find((m) => m.registered_as)?.registered_as ?? null)
              : null;
            const id = registration_id ? String(registration_id) : fromGleif;
            if (!id) {
              return {
                status: 'miss',
                error: `${registry.register} answers only on its ${registry.idLabel ?? 'registration number'}, `
                  + `and neither the caller nor GLEIF supplied one.`,
              } as RegistrySource;
            }
            return registry.lookup({ name, registrationId: id });
          });

      // Domain age runs beside the registers because it answers the same question from the only
      // angle they cannot: a factory trading since 1998 has a domain registered around then, and a
      // company that is real on paper but whose website appeared last month is worth a second look.
      // Free, and it never blocks — no domain, no probe.
      const [gleif, national, domainAge] = await Promise.all([
        gleifPromise,
        nationalPromise,
        domain ? lookupDomainAge(String(domain)) : Promise.resolve(null),
      ]);

      const sources: Record<string, RegistrySource> = { gleif };
      if (registry && cc) sources[cc.toLowerCase()] = national;
      else sources.national_register = national;

      const hits = Object.entries(sources).filter(([, s]) => s.status === 'hit').map(([k]) => k);
      const down = Object.entries(sources).filter(([, s]) => s.status === 'unavailable').map(([k]) => k);

      // Absent is `null`, never an empty string. A caller testing truthiness cannot tell them
      // apart; a caller STORING the value very much can.
      const phone = national.status === 'hit' ? ((national.match as any)?.phone || null) : null;

      onProgress?.(hits.length ? `Found ${name} in: ${hits.join(', ')}` : `No registry record for ${name}`);

      return JSON.stringify({
        // Success means the LOOKUP RAN. `found` carries whether anything was there. A registry
        // that legitimately holds no record of a company is a real and useful answer, and it must
        // not read to the agent as a failed call it should retry.
        success: true,
        found: hits.length > 0,
        results: hits,
        company_name: name,
        country: cc ?? null,
        phone,
        sources,
        sources_hit: hits,
        sources_unavailable: down,
        // Stated explicitly so a miss on an uncovered country reads as "we have no register wired
        // for Bulgaria", not as "this company does not exist". Those are opposite conclusions and
        // the agent has no other way to tell them apart.
        ...(domainAge ? { domain_age: domainAge } : {}),
        coverage: {
          national_register: registry ? registry.register : null,
          countries_with_a_national_register: REGISTRY_COUNTRIES,
          note: registry
            ? null
            : 'GLEIF only for this country — it is worldwide, but registration is voluntary, so a miss '
              + 'here is not evidence the company is fake.',
        },
        cost: { credits: 0, note: 'Official public registries — no key, no account, no charge.' },
        next_step: 'A `registered_as` / `registration_id` from these sources is what `create_company_from_vat` '
          + 'needs to pull the ΑΑΔΕ / VIES record. Chain to that rather than looking the company up again.',
        elapsed_ms: Date.now() - startTime,
      });
    },
    {
      name: 'company_registry_lookup',
      description:
        'Look a company up in the OFFICIAL public registries. FREE: no credits, no API key, no '
        + 'account. GLEIF covers legal entities WORLDWIDE, and on top of it the national register '
        + 'for Czechia, Estonia, Finland, France, Poland, Romania and Slovakia. Returns the legal '
        + 'name, legal form, registered address, registration number, activity code and whether the '
        + 'entity is still active — the things that tell you a factory is real and actually makes '
        + 'things. ALWAYS start here before any PAID enrichment: it costs nothing, and the '
        + 'registration number it returns is what `create_company_from_vat` needs to reach ΑΑΔΕ / '
        + 'VIES. It does NOT return employee counts, revenue or technologies — use '
        + '`company_enrichment` for those, and only when they are actually needed.',
      schema: z.object({
        company_name: z.string().describe('Company name as found — a legal suffix (S.A., Sp. z o.o., a.s.) helps but is not required.'),
        // Deliberately a plain string, not a z.enum of the covered countries: any country is worth
        // asking about because GLEIF is worldwide, and an enum would advertise that the seven with
        // a national register are the only ones this tool can answer for.
        country: z.string().optional().describe('2-letter ISO country code (PL, CZ, SK, RO, FR, FI, EE have a national register wired; anywhere else still gets GLEIF). Narrows every source.'),
        registration_id: z.string().optional().describe('A known national registration number, if you have one — Polish KRS, Romanian CUI. Usually unnecessary: GLEIF supplies it.'),
        domain: z.string().optional().describe(
          'The company website domain, if you have one. Adds a free age check (domain registration date, '
          + 'falling back to the Internet Archive): a maker trading for decades has an old domain, and a '
          + 'real-on-paper company whose site appeared last month is worth a second look.',
        ),
      }),
    }
  );
};

/**
 * B2B Research Tool: industrial facilities — the only DISCOVERY source here, and free.
 *
 * The registries answer "is this company real". This answers "which factories exist", which is a
 * different and, for sourcing, more useful question — and it returns the PLANT address rather than
 * the registered office, which for most manufacturers is an accountant's in another town.
 */
export const createIndustrialFacilitySearchTool = (_userId: string, onProgress?: (status: string) => void, onChunk?: B2BChunkSink) => {
  return tool(
    async ({ sector, country, company_name, city, limit }) => {
      const cc = String(country || '').trim().toUpperCase().slice(0, 2) || undefined;
      if (!sector && !company_name && !cc) {
        return JSON.stringify({
          success: false,
          error: 'Give at least a sector, a country or a company name — an unfiltered scan of every '
            + 'industrial installation in Europe is not a useful answer.',
        });
      }

      const describes = [
        sector ? FACILITY_SECTORS[sector as FacilitySector].label : 'industrial installations',
        cc ? `in ${cc}` : null,
        city ? `near ${city}` : null,
        company_name ? `operated by "${company_name}"` : null,
      ].filter(Boolean).join(' ');
      onProgress?.(`Searching the EU industrial register: ${describes}…`);

      const r = await searchIndustrialFacilities({
        sector: sector as FacilitySector | undefined,
        country: cc,
        companyName: company_name,
        city,
        limit,
      });

      if (r.status === 'unavailable') {
        return JSON.stringify({
          success: false,
          retryable: true,
          error: `The EU industrial register did not answer (${r.error}). This is free and optional — `
            + 'say so and carry on with what you have rather than retrying in a loop.',
        });
      }

      // A `run:` quick-start calls this deterministically, with no model turn to narrate the
      // result, so the chunk IS the output — without it the user gets the cheerful `done` copy
      // over an empty screen. Registered in AGENT_RESULT_TITLES.
      if (r.status === 'hit') {
        onChunk?.({
          type: 'industrial_facilities',
          data: { query_describes: describes, facilities: r.facilities ?? [] },
          timestamp: Date.now(),
        });
      }

      return JSON.stringify({
        success: true,
        found: r.status === 'hit',
        query_describes: describes,
        results: r.facilities ?? [],
        facilities: r.facilities ?? [],
        count: r.facilities?.length ?? 0,
        cost: { credits: 0, note: 'EU Industrial Emissions Database — public, no key, no charge.' },
        ...(r.status === 'miss'
          ? {
            // A miss here has two very different meanings and the agent cannot tell them apart
            // without being told, so it is told.
            note: 'No installation matched. That is NOT evidence the company does not exist: reporting '
              + 'is mandatory only above capacity thresholds, so a workshop-scale maker is legitimately '
              + 'absent, and `parentCompanyName` is self-reported so a trading BRAND often differs from '
              + 'the operator name on file. Searching by sector + country is far more reliable than by name.',
          }
          : {
            note: '`parent_company` is the operator on file, which is a legal entity and may differ from '
              + 'the brand. Run it through company_registry_lookup to get the registered identity.',
          }),
      });
    },
    {
      name: 'industrial_facility_search',
      description:
        'Find real FACTORIES from the EU Industrial Emissions Database — ceramics, glass, cement, '
        + 'stone, steel, foundries, wood panels and more, across EU27 plus the UK, Switzerland, Norway '
        + 'and Iceland. FREE: no credits, no API key. Unlike a company register, this returns the PLANT '
        + '(name, operator, city, street, coordinates) rather than the registered office. It is the only '
        + 'tool here that can DISCOVER manufacturers rather than verify one you already named: ask for a '
        + 'sector and a country to enumerate the plants. Searching by sector + country is much more '
        + 'reliable than by company name, because the operator on file is often a legal entity rather '
        + 'than the trading brand.',
      schema: z.object({
        sector: z.enum([
          'ceramics', 'glass', 'cement_lime', 'stone_minerals', 'quarrying', 'steel',
          'metal_processing', 'foundry', 'non_ferrous', 'metal_finishing', 'wood_panels',
          'paper', 'chemicals',
        ]).optional().describe(
          'Industrial sector. ceramics = tiles, sanitaryware, bricks and refractories fired in a kiln; '
          + 'stone_minerals = mineral substances and fibres; wood_panels = chipboard, fibreboard, plywood.',
        ),
        country: z.string().optional().describe('2-letter ISO country code (PL, IT, ES, GR…).'),
        company_name: z.string().optional().describe('Operator or facility name, if you are checking a specific maker. Less reliable than sector + country.'),
        city: z.string().optional().describe('Town or city, to narrow a sector search to one industrial district.'),
        limit: z.number().optional().describe('Max facilities to return, 1-50. Default 15.'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Contact Discovery
 * Uses Hunter.io Email Finder + domain search, Apollo.io fallback, and ZeroBounce validation
 */
export const createContactDiscoveryTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ domain, roles, first_name, last_name, full_name, company_name }) => {
      const _blocked = await b2bAffordabilityGate(userId, 6, 'contact_discovery');
      if (_blocked) return _blocked;
      try {
        const startTime = Date.now();
        const isPersonSearch = !!(first_name || last_name || full_name);

        // ── Person-specific email finding ──────────────────────────────
        if (isPersonSearch) {
          const personLabel = full_name || `${first_name || ''} ${last_name || ''}`.trim();
          onProgress?.(`Finding email for ${personLabel}...`);

          let foundEmail: string | null = null;
          let confidence = 0;
          let position = '';
          let source = '';
          let fallbackUsed = false;

          // Step 1: Try Hunter.io Email Finder
          const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
          if (HUNTER_API_KEY) {
            onProgress?.(`Searching Hunter.io for ${personLabel}...`);
            const finderUrl = new URL('https://api.hunter.io/v2/email-finder');
            finderUrl.searchParams.set('api_key', HUNTER_API_KEY);
            if (domain) finderUrl.searchParams.set('domain', domain);
            if (company_name && !domain) finderUrl.searchParams.set('company', company_name);
            if (first_name) finderUrl.searchParams.set('first_name', first_name);
            if (last_name) finderUrl.searchParams.set('last_name', last_name);
            if (full_name && !first_name && !last_name) finderUrl.searchParams.set('full_name', full_name);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            try {
              const response = await fetch(finderUrl.toString(), { signal: controller.signal });
              clearTimeout(timeoutId);

              if (response.ok) {
                const data = await response.json();
                const result = data.data;
                if (result?.email) {
                  foundEmail = result.email;
                  confidence = result.score || 0;
                  position = result.position || '';
                  source = 'hunter.io';
                  // Debit credits for Hunter email-finder
                  await debitExternalServiceCredits(supabase, userId, 'hunter-email-finder', 'contact_discovery', 1, { domain, person: personLabel });
                }
              } else {
                console.warn(`⚠️ Hunter Email Finder error: ${response.status}`);
              }
            } catch (fetchError) {
              clearTimeout(timeoutId);
              console.warn(`⚠️ Hunter Email Finder failed:`, fetchError instanceof Error ? fetchError.message : fetchError);
            }
          }

          // Step 2: Fallback to Apollo.io People Match if Hunter failed or low confidence
          if (!foundEmail || confidence < 50) {
            const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
            // Same breaker: Hunter having missed is no reason to walk into a known-dead fallback.
            if (APOLLO_API_KEY && !apolloIsKnownDown()) {
              onProgress?.(`Trying Apollo.io for ${personLabel}...`);
              fallbackUsed = true;

              const apolloBody: Record<string, string> = {};
              if (first_name) apolloBody.first_name = first_name;
              if (last_name) apolloBody.last_name = last_name;
              if (full_name && !first_name && !last_name) apolloBody.name = full_name;
              if (domain) apolloBody.domain = domain;
              if (company_name) apolloBody.organization_name = company_name;

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 20000);

              try {
                const response = await fetch('https://api.apollo.io/api/v1/people/match', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': APOLLO_API_KEY,
                  },
                  body: JSON.stringify(apolloBody),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                  const data = await response.json();
                  const person = data.person;
                  if (person?.email) {
                    foundEmail = person.email;
                    confidence = person.email_status === 'verified' ? 95 : 60;
                    position = person.title || position;
                    source = 'apollo.io';
                    // Debit credits for Apollo people-match fallback
                    await debitExternalServiceCredits(supabase, userId, 'apollo-people-match', 'contact_discovery', 1, { domain, person: personLabel });
                  }
                } else {
                  console.warn(`⚠️ Apollo People Match error: ${response.status}`);
                }
              } catch (fetchError) {
                clearTimeout(timeoutId);
                console.warn(`⚠️ Apollo People Match failed:`, fetchError instanceof Error ? fetchError.message : fetchError);
              }
            }
          }

          if (!foundEmail) {
            const elapsed = Date.now() - startTime;
            return JSON.stringify({
              success: true,
              found: false,
              message: `No email found for ${personLabel}`,
              fallback_used: fallbackUsed,
              elapsed_ms: elapsed,
            });
          }

          // Step 3: Validate with ZeroBounce
          onProgress?.(`Validating ${foundEmail} with ZeroBounce...`);
          const validation = await validateEmailWithZeroBounce(foundEmail, onProgress);
          // Debit credits for ZeroBounce validation
          if (validation.validated) {
            await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'contact_discovery', 1, { email: foundEmail });
          }

          const elapsed = Date.now() - startTime;

          return JSON.stringify({
            success: true,
            found: true,
            email: foundEmail,
            first_name: first_name || full_name?.split(' ')[0] || '',
            last_name: last_name || full_name?.split(' ').slice(1).join(' ') || '',
            position,
            confidence,
            source,
            fallback_used: fallbackUsed,
            validation: validation.validated ? {
              status: validation.status,
              sub_status: validation.sub_status,
              free_email: validation.free_email,
              mx_found: validation.mx_found,
            } : { status: 'unverified', error: validation.error },
            elapsed_ms: elapsed,
          });
        }

        // ── Domain search (existing behavior, enhanced with validation) ──
        onProgress?.(`Finding contacts for ${domain}...`);

        const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
        if (!HUNTER_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'HUNTER_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        const TIMEOUT_MS = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        if (!domain) {
          return JSON.stringify({
            success: false,
            error: 'A company domain is required to list contacts. Supply `domain`, or a person name to search for one instead.',
          });
        }

        const searchUrl = new URL('https://api.hunter.io/v2/domain-search');
        searchUrl.searchParams.set('domain', domain);
        searchUrl.searchParams.set('api_key', HUNTER_API_KEY);
        searchUrl.searchParams.set('limit', '10');

        let response;
        try {
          response = await fetch(searchUrl.toString(), {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Hunter API timeout after ${TIMEOUT_MS / 1000} seconds.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Hunter API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Hunter API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const emails = data.data?.emails || [];
        const organization = data.data?.organization || '';
        const pattern = data.data?.pattern || '';

        // Debit credits for Hunter domain-search
        await debitExternalServiceCredits(supabase, userId, 'hunter-domain-search', 'contact_discovery', 1, { domain });

        const priorityRoles = roles || ['export', 'sales', 'director', 'manager', 'owner', 'ceo', 'founder'];

        const scoredContacts = emails.map((email: any) => {
          const position = (email.position || '').toLowerCase();
          let roleScore = 0;

          for (let i = 0; i < priorityRoles.length; i++) {
            if (position.includes(priorityRoles[i].toLowerCase())) {
              roleScore = priorityRoles.length - i;
              break;
            }
          }

          return {
            name: `${email.first_name || ''} ${email.last_name || ''}`.trim(),
            email: email.value,
            position: email.position || '',
            department: email.department || '',
            linkedin: email.linkedin || '',
            confidence: email.confidence || 0,
            email_verified: email.verification?.status === 'valid',
            role_score: roleScore,
            source: 'hunter.io',
          };
        });

        scoredContacts.sort((a: any, b: any) => {
          if (b.role_score !== a.role_score) return b.role_score - a.role_score;
          return b.confidence - a.confidence;
        });

        // Validate top 5 contacts with ZeroBounce
        const topContacts = scoredContacts.slice(0, 10);
        const MAX_VALIDATIONS = 5;
        onProgress?.(`Validating top ${Math.min(MAX_VALIDATIONS, topContacts.length)} emails with ZeroBounce...`);

        let validatedCount = 0;
        for (let i = 0; i < topContacts.length && validatedCount < MAX_VALIDATIONS; i++) {
          if (topContacts[i].email) {
            const validation = await validateEmailWithZeroBounce(topContacts[i].email);
            topContacts[i].validation = validation.validated ? {
              status: validation.status,
              sub_status: validation.sub_status,
              free_email: validation.free_email,
              mx_found: validation.mx_found,
            } : { status: 'unverified', error: validation.error };
            validatedCount++;
          }
        }
        // Debit credits for all ZeroBounce validations in batch
        if (validatedCount > 0) {
          await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'contact_discovery', validatedCount, { domain });
        }

        const elapsed = Date.now() - startTime;

        return JSON.stringify({
          success: true,
          domain,
          organization,
          email_pattern: pattern,
          contacts: topContacts,
          total_found: emails.length,
          validated_count: validatedCount,
          elapsed_ms: elapsed,
          source: 'hunter.io',
        });
      } catch (error) {
        console.error('Contact discovery error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Contact discovery failed',
        });
      }
    },
    {
      name: 'contact_discovery',
      description: 'Find email addresses for a company domain or a specific person. Can search all contacts at a domain, or find a specific person\'s email by name. Falls back to Apollo.io if Hunter.io has low confidence. Validates all discovered emails with ZeroBounce.',
      schema: z.object({
        domain: z.string().optional().describe('Company website domain (e.g., "paradyz.com")'),
        roles: z.array(z.string()).optional().describe('Priority roles to find in domain search (e.g., ["export", "sales", "director"])'),
        first_name: z.string().optional().describe('First name of the specific person to find'),
        last_name: z.string().optional().describe('Last name of the specific person to find'),
        full_name: z.string().optional().describe('Full name of the person (alternative to first_name + last_name)'),
        company_name: z.string().optional().describe('Company name (used when domain is not available)'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Email Validation
 * Uses ZeroBounce API to validate email addresses on demand
 */
export const createEmailValidateTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ email, emails }) => {
      const _blocked = await b2bAffordabilityGate(userId, 5, 'email_validate');
      if (_blocked) return _blocked;
      try {
        const emailsToValidate = emails || (email ? [email] : []);
        if (emailsToValidate.length === 0) {
          return JSON.stringify({ success: false, error: 'No email(s) provided' });
        }

        // Cap at 10 to avoid excessive API usage
        const capped = emailsToValidate.slice(0, 10);
        const startTime = Date.now();

        const ZEROBOUNCE_API_KEY = Deno.env.get('ZEROBOUNCE_API_KEY');
        if (!ZEROBOUNCE_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'ZEROBOUNCE_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        onProgress?.(`Validating ${capped.length} email(s)...`);

        const results = [];
        for (const addr of capped) {
          const validation = await validateEmailWithZeroBounce(addr);
          results.push({
            email: addr,
            ...validation,
          });
        }

        const elapsed = Date.now() - startTime;
        const validCount = results.filter((r) => r.status === 'valid').length;
        const invalidCount = results.filter((r) => r.status === 'invalid').length;

        // Debit credits for all ZeroBounce validations
        if (results.length > 0) {
          await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'email_validate', results.length, { email_count: results.length });
        }

        return JSON.stringify({
          success: true,
          results,
          total: results.length,
          valid_count: validCount,
          invalid_count: invalidCount,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Email validation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Email validation failed',
        });
      }
    },
    {
      name: 'email_validate',
      description: 'Validate email addresses using ZeroBounce. Returns detailed status: valid, invalid, catch-all, spamtrap, abuse, do_not_mail, or unknown. Use this to verify emails before outreach.',
      schema: z.object({
        email: z.string().optional().describe('Single email address to validate'),
        emails: z.array(z.string()).optional().describe('Array of email addresses to validate (max 10)'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Save to CRM
 * Saves researched company and contacts to the CRM database
 */
export const createSaveToCRMTool = (userId: string, workspaceId: string, onProgress?: (status: string) => void, onChunk?: B2BChunkSink) => {
  return tool(
    async ({ company, contacts, confirm, _workflow_run_id }) => {
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'b2b-research', run_id: _workflow_run_id }) : null;
      emitter?.step({ step_id: STEPS.B2B_RESEARCH[5], status: 'running', status_line: `Saving ${company?.name || 'company'} to CRM…` });
      try {
        const startTime = Date.now();

        // WHICH SIDE OF THE TRADE (#334 defect 1). This used to be `is_customer: true`, hardcoded,
        // with a comment asserting that B2B research prospects a party we want to SELL to. It does
        // not: `b2b_manufacturer_search` looks for FACTORIES, so every porcelain tile plant the
        // agent found was filed as a customer. That is not cosmetic — a company with `is_supplier`
        // false has its Products tab and factory link suppressed, and it turns up in customer lists
        // and A/R views it has no business being in.
        //
        // Defaulting to supplier rather than customer because this toolkit's only discovery tool
        // finds manufacturers; a party we intend to sell to has to be named as one.
        const partyRole: 'supplier' | 'customer' | 'both' = company.role ?? 'supplier';
        const roleLabel = partyRole === 'both' ? 'supplier and customer' : partyRole;

        // Send progress update
        // HUMAN-IN-THE-LOOP GATE (invariant #9). Writing a party into the CRM is a durable,
        // outward-facing change to the customer's own records, and the agent reaches this tool off
        // its OWN research — the companies and the contact names come from a web search it just
        // ran, not from anything the user typed. On 2026-08-19 a single sentence produced two
        // companies and three named people in the live CRM with no approval step anywhere.
        //
        // `confirm` is on NEVER_ASK in the quick-start catalog, so a form can never pre-answer it
        // on the user's behalf — the approval has to come from the card.
        if (confirm !== true) {
          const contactLine = contacts?.length
            ? ` and ${contacts.length} contact${contacts.length === 1 ? '' : 's'} (${contacts.map((c: any) => c.name).filter(Boolean).slice(0, 3).join(', ')})`
            : '';
          onChunk?.({
            type: 'action_confirmation',
            tool: 'save_to_crm',
            input: { company, contacts, confirm: true },
            title: `Save ${company.name} to your CRM?`,
            // The ROLE is on the card because it is the half the operator is most likely to want
            // changed, and it is the half that decides which lists the row shows up in.
            summary: `Adds ${company.name}${company.website ? ` (${company.website})` : ''} as a **${roleLabel}**`
              + `${company.is_manufacturer ? ' (manufacturer)' : ''}${contactLine} to your CRM. `
              + `These came from web research, so check the details are right — contact names and emails in particular.`,
            toolkit_id: 'crm',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true,
            awaiting_confirmation: true,
            message: 'Waiting for the user to approve saving this company. Do not retry and do not '
              + 'save anything else — they will approve or decline on the card.',
          });
        }

        onProgress?.(`Saving ${company.name} to CRM...`);

        // Dedupe on the SAME folded key crm-api uses (#366 BU-3), because this is a second
        // create path and it was skipping the first one's guarantee.
        //
        // crm-api refuses a create whose `name_fold` already exists and hands back the row it
        // found; the QuickAddCompanyDialog probe is only a courtesy on top of that. This tool
        // wrote straight to `crm_companies` with the service-role client, so none of it applied:
        // "save Nowy Styl to my CRM" twice produced Nowy Styl twice. `name_fold` is a generated
        // column over `crm_fold(name)`, so the match survives Greek case and accents — "Καρέλης
        // ΑΕ" finds the stored "ΚΑΡΕΛΗΣ ΑΕ", which a plain ilike on the raw column never did.
        // Duplicates are not cosmetic: they are what makes spend-per-supplier and AP aging wrong.
        //
        // A failed LOOKUP does not fall through to the insert, for the same reason it does not in
        // crm-api: a duplicate is cheap to detect and expensive to unpick.
        {
          const probeFailed = (why: string) => JSON.stringify({
            success: false,
            error: `Could not check whether "${company.name}" is already in the CRM (${why}). `
              + `Nothing was saved — say so rather than retrying, since a duplicate is expensive to unpick.`,
          });
          const alreadyExists = (row: { id: string; name: string }, matchedOn: 'domain' | 'name') => {
            emitter?.step({ step_id: STEPS.B2B_RESEARCH[5], status: 'done', status_line: `${row.name} is already in the CRM` });
            return JSON.stringify({
              success: true,
              already_existed: true,
              matched_on: matchedOn,
              company_id: row.id,
              company_name: row.name,
              message: `"${row.name}" is already in this workspace's CRM (matched on ${matchedOn}) — nothing was `
                + `created. Tell the user it already exists and offer to open or update it; do NOT save it again.`,
            });
          };

          // DOMAIN FIRST (#334 defect 2). `name_fold` alone misses the duplicate that matters most
          // in a discovery sweep: one factory spelled two ways — "Ceramika Paradyż", "Paradyz
          // S.A.", "PARADYŻ Sp. z o.o." — is one company with one website, and the next sweep will
          // spell it the other way. The fold survives case and accents; it does not survive a legal
          // suffix appearing or a transliteration changing.
          //
          // There is no domain COLUMN to match on — `website` is free text ("https://www.x.com/en",
          // "x.com/", "X.COM") — so this is a narrowing ilike followed by an exact compare of the
          // normalised host. The ilike alone is not the test: "%paradyz.com%" also matches
          // "notparadyz.com", which is a different company.
          const wantDomain = domainFromUrl(company.website);
          if (wantDomain) {
            const { data: candidates, error: domainError } = await supabase
              .from('crm_companies')
              .select('id, name, website')
              .eq('workspace_id', workspaceId)
              .ilike('website', `%${escapeLike(wantDomain)}%`)
              .limit(50);
            if (domainError) return probeFailed(domainError.message);
            const hit = (candidates ?? []).find((c: any) => domainFromUrl(c.website) === wantDomain);
            if (hit) return alreadyExists(hit, 'domain');
          }

          const { data: existing, error: dupError } = await supabase
            .from('crm_companies')
            .select('id, name')
            .eq('workspace_id', workspaceId)
            .eq('name_fold', foldForSearch(company.name))
            .limit(1)
            .maybeSingle();
          if (dupError) return probeFailed(dupError.message);
          if (existing) return alreadyExists(existing, 'name');
        }

        // First, create or update the company. workspace_id is stamped server-side
        // from the authenticated context (CLAUDE.md invariant 1 — never body-supplied;
        // crm_companies.workspace_id is NOT NULL, so omitting it also fails the insert).
        const { data: companyData, error: companyError } = await supabase
          .from('crm_companies')
          .insert({
            workspace_id: workspaceId,
            name: company.name,
            website: company.website,
            email: company.email,
            phone: company.phone,
            industry: company.industry,
            employee_count: company.employee_count,
            address: company.address,
            city: company.city,
            country: company.country,
            linkedin: company.linkedin,
            description: company.description,
            // Explicit, and derived from `partyRole` rather than pinned — see the note above the
            // declaration. All three flags are written on every insert so the row never inherits a
            // column default nobody chose.
            is_supplier: partyRole === 'supplier' || partyRole === 'both',
            is_customer: partyRole === 'customer' || partyRole === 'both',
            is_manufacturer: company.is_manufacturer === true,
            created_by: userId,
          })
          .select('id')
          .single();

        if (companyError) {
          console.error('Error creating company:', companyError);
          return JSON.stringify({
            success: false,
            error: `Failed to create company: ${companyError.message}`,
          });
        }

        const companyId = companyData.id;
        const contactIds: string[] = [];

        // Persist initial research notes as a crm_notes timeline entry on the new
        // company. Skip when empty so we don't seed a blank entry.
        if (company.notes && String(company.notes).trim()) {
          const { error: noteErr } = await supabase.from('crm_notes').insert({
            workspace_id: workspaceId,
            target_kind: 'company',
            target_id: companyId,
            body: String(company.notes).trim(),
            created_by: userId,
          });
          if (noteErr) console.warn(`Failed to save company research notes: ${noteErr.message}`);
        }

        // Create contacts and link them to the company
        if (contacts && contacts.length > 0) {
          for (const contact of contacts) {
            // The contact half of the duplicate guard (#334 defect 2). The company probe above
            // returns early on a hit, so a fresh company cannot collect a duplicate link — but the
            // same PERSON legitimately reaches this tool twice: once from a supplier sweep, once
            // from a customer one, and the second pass would mint a second `crm_contacts` row for
            // an address we already hold.
            //
            // EMAIL is the only key used. Name is deliberately not: two people genuinely called
            // "Μαρία Παπαδοπούλου" at two factories are two people, and collapsing them loses one.
            // An email address is one inbox belonging to one person.
            let existingContactId: string | null = null;
            if (contact.email) {
              const { data: priorContact, error: contactDupError } = await supabase
                .from('crm_contacts')
                .select('id')
                .eq('workspace_id', workspaceId)
                .ilike('email', escapeLike(String(contact.email).trim()))
                .limit(1)
                .maybeSingle();
              // A failed probe SKIPS the contact rather than falling through to the insert — same
              // reason the company probe does not fall through. One missing contact is recoverable;
              // a duplicated person with half the history on each row is not.
              if (contactDupError) {
                console.warn(`Contact duplicate probe failed for ${contact.email}: ${contactDupError.message}`);
                continue;
              }
              existingContactId = priorContact?.id ?? null;
            }

            if (existingContactId) {
              contactIds.push(existingContactId);
              await supabase
                .from('crm_company_contacts')
                .upsert({
                  company_id: companyId,
                  contact_id: existingContactId,
                  role: contact.position,
                  is_primary: contact.is_primary || false,
                  notes: `Linked via B2B Research Agent`,
                }, { onConflict: 'company_id,contact_id', ignoreDuplicates: true });
              continue;
            }

            // Create the contact
            const { data: contactData, error: contactError } = await supabase
              .from('crm_contacts')
              .insert({
                workspace_id: workspaceId,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                mobile: contact.mobile,
                position: contact.position,
                department: contact.department,
                linkedin: contact.linkedin,
                company: company.name,
                country: company.country,
                city: company.city,
                lead_source: 'B2B Research Agent',
                status: 'new',  // Using correct column name
                created_by: userId,
              })
              .select('id')
              .single();

            if (contactError) {
              console.error('Error creating contact:', contactError);
              continue;
            }

            contactIds.push(contactData.id);

            // Initial research notes for the contact → crm_notes timeline entry
            if (contact.notes && String(contact.notes).trim()) {
              const { error: noteErr } = await supabase.from('crm_notes').insert({
                workspace_id: workspaceId,
                target_kind: 'contact',
                target_id: contactData.id,
                body: String(contact.notes).trim(),
                created_by: userId,
              });
              if (noteErr) console.warn(`Failed to save contact research notes: ${noteErr.message}`);
            }

            // Link contact to company
            await supabase
              .from('crm_company_contacts')
              .insert({
                company_id: companyId,
                contact_id: contactData.id,
                role: contact.position,
                is_primary: contact.is_primary || false,
                notes: `Added via B2B Research Agent`,
              });
          }
        }

        const elapsed = Date.now() - startTime;

        emitter?.step({
          step_id: STEPS.B2B_RESEARCH[5],
          status: 'done',
          status_line: `Saved ${company.name} (${contactIds.length} contact${contactIds.length === 1 ? '' : 's'})`,
          output: { company_id: companyId, contacts_created: contactIds.length },
        });
        emitter?.finished({ status: 'done', summary: `Saved "${company.name}" + ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'} to CRM.` });

        return JSON.stringify({
          success: true,
          _workflow_run_id,
          company_id: companyId,
          contact_ids: contactIds,
          company_name: company.name,
          contacts_created: contactIds.length,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Save to CRM error:', error);
        emitter?.step({ step_id: STEPS.B2B_RESEARCH[5], status: 'failed', error_message: error instanceof Error ? error.message : 'Failed to save to CRM' });
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save to CRM',
        });
      }
    },
    {
      name: 'save_to_crm',
      description: 'Save a researched company and its contacts to the CRM database. Use this after the user '
        + 'confirms they want to save a manufacturer. ONLY `company.name` is required — every other field is '
        + 'optional. Enrichment and contact discovery are enhancements, NOT prerequisites: if either is '
        + 'unavailable or returns nothing, save what you have and say which fields are missing. Never abandon '
        + 'a save the user asked for because an enrichment provider is down. '
        + 'Pass `company.role` — a manufacturer you might buy from is a "supplier" (the default), not a customer.',
      schema: z.object({
        company: z.object({
          name: z.string().describe('Company name'),
          website: z.string().optional().describe('Company website URL'),
          email: z.string().optional().describe('Company email'),
          phone: z.string().optional().describe('Company phone'),
          industry: z.string().optional().describe('Industry'),
          employee_count: z.string().optional().describe('Employee count range'),
          address: z.string().optional().describe('Street address'),
          city: z.string().optional().describe('City'),
          country: z.string().optional().describe('Country'),
          linkedin: z.string().optional().describe('LinkedIn URL'),
          description: z.string().optional().describe('Company description'),
          notes: z.string().optional().describe('Additional notes'),
          role: z.enum(['supplier', 'customer', 'both']).optional().describe(
            'Which side of the trade this party is on. A factory, producer, mill or brand you might BUY from '
            + 'is "supplier" — that is the default and it is what `b2b_manufacturer_search` returns. Only pass '
            + '"customer" for a party you intend to SELL to, and "both" when they are genuinely each. This '
            + 'decides which lists the company appears in and whether its Products tab is shown, so do not '
            + 'guess: if the user asked to find suppliers, it is a supplier.',
          ),
          is_manufacturer: z.boolean().optional().describe(
            'True when this party actually produces goods, as opposed to distributing or retailing them. '
            + '`b2b_manufacturer_search` returns this per row — pass it straight through rather than re-deciding it.',
          ),
        }).describe('Company information to save'),
        contacts: z.array(z.object({
          name: z.string().describe('Contact full name'),
          email: z.string().optional().describe('Contact email'),
          phone: z.string().optional().describe('Contact phone'),
          mobile: z.string().optional().describe('Contact mobile'),
          position: z.string().optional().describe('Job position/title'),
          department: z.string().optional().describe('Department'),
          linkedin: z.string().optional().describe('LinkedIn profile URL'),
          notes: z.string().optional().describe('Notes about the contact'),
          is_primary: z.boolean().optional().describe('Is this the primary contact'),
        })).optional().describe('Contacts to save and link to the company'),
        confirm: z.boolean().optional().describe('Leave unset. The tool previews and asks the user to approve; the Approve button re-invokes it with confirm:true.'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from `[workflow:b2b-research/save:<run_id>]` prefix.'),
      }),
    }
  );
};
