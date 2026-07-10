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

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.3.10');
const { createClient } = await import('npm:@supabase/supabase-js@2');
const { createWorkflowEmitter, STEPS } = await import('./_workflow-chunks.ts');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type B2BChunkSink = ((chunk: any) => void) | undefined;

import { debitExternalServiceCredits } from '../credit-utils.ts';
import { getToolPrompt } from '../prompt-utils.ts';

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
const B2B_REGIONS: Record<string, { label: string; countries: string[] }> = {
  cee: {
    label: 'Central & Eastern Europe',
    countries: ['Poland', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Ukraine'],
  },
  balkans: {
    label: 'Balkans & Turkey',
    countries: ['Turkey', 'Serbia', 'Croatia', 'Slovenia', 'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Greece'],
  },
  baltic_nordic: {
    label: 'Baltic & Nordic',
    countries: ['Lithuania', 'Latvia', 'Estonia', 'Finland', 'Denmark'],
  },
  western_southern: {
    label: 'Western & Southern Europe',
    countries: ['Germany', 'Netherlands', 'France', 'Spain', 'Italy', 'Portugal', 'United Kingdom'],
  },
  global: {
    label: 'Global Manufacturing Hubs',
    countries: ['China', 'India', 'Morocco'],
  },
};

const B2B_ALL_COUNTRIES = Object.values(B2B_REGIONS).flatMap((r) => r.countries);

export const createB2BManufacturerSearchTool = (userId: string, onProgress?: (status: string) => void, onChunk?: B2BChunkSink) => {
  return tool(
    async ({ country, region, category, limit = 30, _workflow_run_id }) => {
      const runId = _workflow_run_id || crypto.randomUUID();
      const emitter = createWorkflowEmitter({ onChunk, definition_id: 'b2b-research', run_id: runId });
      emitter.plan({ title: `${category} manufacturers`, subtitle: country || region || 'global', metadata: { country, region, category, limit } });
      emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'running', status_line: `Searching for ${category} manufacturers…`, input: { country, region, category, limit } });
      try {
        if (!ANTHROPIC_API_KEY) {
          emitter.step({ step_id: STEPS.B2B_RESEARCH[0], status: 'failed', error_message: 'ANTHROPIC_API_KEY not configured.' });
          return JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured.' });
        }

        let scope: string;
        if (country) {
          scope = `in ${country}`;
        } else if (region) {
          const key = region.toLowerCase();
          const regionEntry = B2B_REGIONS[key];
          scope = regionEntry
            ? `in the ${regionEntry.label} region (${regionEntry.countries.join(', ')})`
            : `in the ${region} region`;
        } else {
          scope = `across these 30 markets: ${B2B_ALL_COUNTRIES.join(', ')}`;
        }

        const query = `Find B2B manufacturers of ${category} ${scope}. I need actual production companies (not distributors or retailers) with their own manufacturing facilities. For each company provide: company name, website URL, city/country, main products, and any manufacturing indicators. Return up to ${limit} results.`;

        onProgress?.(`Searching for ${category} manufacturers${country ? ` in ${country}` : region ? ` in ${B2B_REGIONS[region.toLowerCase()]?.label ?? region}` : ''}...`);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
            messages: [{ role: 'user', content: query }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`❌ Web search API error ${response.status}: ${errText}`);
          return JSON.stringify({ success: false, error: `Web search failed: ${response.status}` });
        }

        const data = await response.json();
        const textContent = (data.content as any[])
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n') || '';

        // Cost attribution: Haiku 4.5 ($0.80 in / $4 out per MTok) + web_search
        // server-side tool fee (~$0.01/use; Anthropic doesn't break that out in
        // the response, but max_uses=5 caps the worst case at $0.05). We log
        // the token cost here so the operations dashboard sees a non-zero row;
        // the actual web_search server tool surcharge is approximated as a
        // flat $0.01 per call to keep accounting simple.
        try {
          const inputTokens = data?.usage?.input_tokens ?? 0;
          const outputTokens = data?.usage?.output_tokens ?? 0;
          const inputCost = (inputTokens / 1_000_000) * 0.80;
          const outputCost = (outputTokens / 1_000_000) * 4.00;
          const webSearchSurcharge = 0.05; // worst-case: max_uses=5 × $0.01/use
          const rawCost = inputCost + outputCost + webSearchSurcharge;
          const billedCost = rawCost * 1.50; // platform markup

          await supabase.rpc('debit_credits', {
            p_user_id: userId,
            p_amount: Math.round(billedCost * 100 * 100) / 100, // 1 credit = $0.01
            p_operation_type: 'b2b_manufacturer_search',
            p_description: `B2B manufacturer web search (${category})`,
            p_metadata: { country, region, category, limit, web_search_max_uses: 5 },
            p_workspace_id: null,
          });

          await supabase.from('ai_usage_logs').insert({
            user_id: userId,
            operation_type: 'b2b_manufacturer_search',
            model_name: 'claude-haiku-4-5',
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

        onProgress?.(`Search complete.`);
        emitter.step({
          step_id: STEPS.B2B_RESEARCH[0],
          status: 'done',
          status_line: textContent ? 'Manufacturers discovered' : 'No results found',
          output: { source: 'claude_web_search', has_results: !!textContent },
        });

        return JSON.stringify({
          success: !!textContent,
          _workflow_run_id: runId,
          search_results: textContent || 'No results found.',
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
      description: 'Search for B2B manufacturers using web search. Finds actual production companies with their websites, locations, and product info. Specify a country for focused results, a region (cee/balkans/baltic_nordic/western_southern/global) for regional search, or omit both for a broad global search.',
      schema: z.object({
        country: z.string().optional().describe('Specific country to search (e.g., "Poland", "Turkey"). Omit for broader search.'),
        region: z.string().optional().describe('Region hint: "cee", "balkans", "baltic_nordic", "western_southern", "global". Ignored if country is provided.'),
        category: z.string().describe('Product category (e.g., "ceramic tiles", "bathroom furniture", "flexible panels")'),
        limit: z.number().optional().default(30).describe('Max manufacturers to find. Default: 30'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from `[workflow:b2b-research/search:<run_id>]` prefix.'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Website Scrape
 * Uses Firecrawl API to extract structured information from company websites
 */
export const createCompanyWebsiteScrapeTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ url, extract }) => {
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

        // Debit credits for Firecrawl scrape
        await debitExternalServiceCredits(supabase, userId, 'firecrawl-scrape', 'company_website_scrape', 1, { url });

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

          // Cost log for Opus 4.7 ($15 in / $75 out per MTok). The agent tool
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
              const inputCost = (inputTokens / 1_000_000) * 15.00;
              const outputCost = (outputTokens / 1_000_000) * 75.00;
              const rawCost = inputCost + outputCost;
              const billedCost = rawCost * 1.50;
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
                operation_type: 'company_website_scrape_analysis',
                model_name: 'claude-opus-4-8',
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
      try {
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Enriching company data for ${company_name}...`);

        const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
        if (!APOLLO_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'APOLLO_API_KEY not configured. Please add it to Supabase secrets.',
          });
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
          return JSON.stringify({
            success: false,
            error: `Apollo API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        const companies = data.organizations || [];

        // Debit credits for Apollo enrichment (charged even if no results)
        await debitExternalServiceCredits(supabase, userId, 'apollo-enrich', 'company_enrichment', 1, { company_name, domain });

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
            if (APOLLO_API_KEY) {
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
export const createSaveToCRMTool = (userId: string, onProgress?: (status: string) => void, onChunk?: B2BChunkSink) => {
  return tool(
    async ({ company, contacts, _workflow_run_id }) => {
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'b2b-research', run_id: _workflow_run_id }) : null;
      emitter?.step({ step_id: STEPS.B2B_RESEARCH[5], status: 'running', status_line: `Saving ${company?.name || 'company'} to CRM…` });
      try {
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Saving ${company.name} to CRM...`);

        // First, create or update the company
        const { data: companyData, error: companyError } = await supabase
          .from('crm_companies')
          .insert({
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

        // Persist initial research notes as a timeline entry on the new company
        // (the legacy crm_companies.notes blob column was dropped 2026-05-25 in
        // favour of the crm_notes timeline). Skip when empty so we don't seed
        // a blank entry.
        if (company.notes && String(company.notes).trim()) {
          const { error: noteErr } = await supabase.from('crm_notes').insert({
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
      description: 'Save a researched company and its contacts to the CRM database. Use this after the user confirms they want to save a manufacturer.',
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
