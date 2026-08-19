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
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.3.10');
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
import { allValues, buildMarketScope, describeGroups, groupKeys, termsInGroup, type VocabularyTerm } from '../vocabularies.ts';

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
const ANALYSIS_MODEL = 'claude-opus-4-8';

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
  const inScope = sel.country
    ? markets.filter((m) => m.value.toLowerCase() === sel.country!.toLowerCase())
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
      const MAX_PER_CALL = 10;
      const requestedLimit = limit;
      if (limit > MAX_PER_CALL) limit = MAX_PER_CALL;

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
        limit: z.number().optional().default(8).describe('Max manufacturers per call. Default 8; more than ~10 will exceed the 90s tool timeout — run several calls or dispatch a background task instead.'),
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
    async ({ url, extract }) => {
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
              formats: ['markdown'],
              onlyMainContent: true,
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
        try {
          const analysisModel = new ChatAnthropic({
            model: 'claude-opus-4-8',
            temperature: 0.3,
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
          console.error('Claude analysis error:', analysisError);
          // Return scraped data even if analysis fails
          companyData = {
            error: 'Analysis failed but website was scraped',
            raw_markdown_preview: markdown.substring(0, 2000)
          };
        }

        const totalElapsed = Date.now() - startTime;
        return JSON.stringify({
          success: true,
          url: url,
          company_data: companyData,
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
      description: 'Scrape a company website to extract structured information about the company, products, contact details, and verify if they are a B2B manufacturer.',
      schema: z.object({
        url: z.string().describe('Company website URL to scrape'),
        extract: z.array(z.string()).optional().describe('Sections to extract: about, products, contact, certifications'),
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
    async ({ company, contacts, _workflow_run_id }) => {
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'b2b-research', run_id: _workflow_run_id }) : null;
      emitter?.step({ step_id: STEPS.B2B_RESEARCH[5], status: 'running', status_line: `Saving ${company?.name || 'company'} to CRM…` });
      try {
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Saving ${company.name} to CRM...`);

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
            // Explicit: is_customer no longer defaults to true at the column (that default
            // filed every supplier as a customer too). B2B research prospects a party we want
            // to SELL to, so the customer role is the intended one here.
            is_customer: true,
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
        + 'a save the user asked for because an enrichment provider is down.',
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
        _workflow_run_id: z.string().optional().describe('Workflow run_id from `[workflow:b2b-research/save:<run_id>]` prefix.'),
      }),
    }
  );
};
