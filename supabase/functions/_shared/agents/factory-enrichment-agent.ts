/**
 * Background Agent: Factory Enrichment
 *
 * Enriches incomplete factory metadata on products using a cascade of B2B data
 * sources — Apollo.io → Firecrawl website scrape → Hunter.io contacts.
 *
 * All three API calls fit within the Deno 90 s edge-function limit, so this
 * agent NEVER throws DelegateToMivaaError.
 *
 * Config params (background_agents.config):
 *   batch_size       number   Products per run (default 20, max 50)
 *   min_name_length  number   Skip factory_name shorter than this (default 3)
 *
 * Input data (agent_runs.input_data — set by trigger-factory-enrichment):
 *   product_ids   string[]   Specific product IDs to check
 *   workspace_id  string     Workspace to operate on
 *   scope_column  string     (optional) 'source_document_id' | 'scrape_session_id'
 *   scope_value   string     (optional) value for scope_column
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';
import {
  factoryCompletenessScore,
  writeFactoryToProduct,
  propagateFactoryFieldsInScope,
  type FactoryObject,
} from './propagation-utils.ts';

// ── Apollo.io helper ──────────────────────────────────────────────────────────

async function enrichViaApollo(
  factoryName: string,
  domain: string | undefined,
  country: string | undefined,
): Promise<Partial<FactoryObject>> {
  const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
  if (!APOLLO_API_KEY) return {};

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q_organization_name:   factoryName,
        organization_locations: country ? [country] : undefined,
        organization_domains:   domain   ? [domain]  : undefined,
        page: 1,
        per_page: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return {};

    const data = await response.json();
    const org  = data.organizations?.[0];
    if (!org) return {};

    return {
      city:           org.city            || undefined,
      country:        org.country         || undefined,
      phone:          org.phone           || org.sanitized_phone || undefined,
      website:        org.website_url     || undefined,
      founded_year:   org.founded_year    || undefined,
      employee_count: org.employee_count  || undefined,
      linkedin_url:   org.linkedin_url    || undefined,
      company_type:   org.organization_type || undefined,
    };
  } catch {
    return {};
  }
}

// ── Firecrawl website scrape helper ──────────────────────────────────────────

async function enrichViaWebsite(website: string): Promise<Partial<FactoryObject>> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY || !website) return {};

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30_000);

    // Upgraded to Firecrawl v2: structured extraction is now an entry inside
    // `formats`, and the result lands at data.json. v1 top-level `extract` key
    // is rejected by v2 with 'Unrecognized key in body'.
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url:              website,
        onlyMainContent:  true,
        formats: [
          {
            type: 'json',
            schema: {
              type: 'object',
              properties: {
                address:          { type: 'string' },
                city:             { type: 'string' },
                country:          { type: 'string' },
                postal_code:      { type: 'string' },
                phone:            { type: 'string' },
                email:            { type: 'string' },
                founded_year:     { type: 'string' },
                company_type:     { type: 'string' },
                employee_count:   { type: 'string' },
                country_of_origin:{ type: 'string' },
              },
            },
            prompt: 'Extract contact and company information: address, city, country, postal code, phone, email, founded year, company type, number of employees, and country of origin/manufacturing.',
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return {};

    const data    = await response.json();
    const extract = data.data?.json ?? data.data?.extract ?? {};

    const result: Partial<FactoryObject> = {};
    if (extract.address)           result.address           = extract.address;
    if (extract.city)              result.city              = extract.city;
    if (extract.country)           result.country           = extract.country;
    if (extract.postal_code)       result.postal_code       = extract.postal_code;
    if (extract.phone)             result.phone             = extract.phone;
    if (extract.email)             result.email             = extract.email;
    if (extract.founded_year)      result.founded_year      = extract.founded_year;
    if (extract.company_type)      result.company_type      = extract.company_type;
    if (extract.employee_count)    result.employee_count    = extract.employee_count;
    if (extract.country_of_origin) result.country_of_origin = extract.country_of_origin;

    return result;
  } catch {
    return {};
  }
}

// ── Hunter.io contact discovery helper ───────────────────────────────────────

async function enrichViaHunter(domain: string): Promise<Partial<FactoryObject>> {
  const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
  if (!HUNTER_API_KEY || !domain) return {};

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15_000);

    const url = new URL('https://api.hunter.io/v2/domain-search');
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', HUNTER_API_KEY);
    url.searchParams.set('limit', '3');
    url.searchParams.set('type', 'generic');  // prefer generic contacts (info@, sales@)

    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return {};

    const data    = await response.json();
    const emails  = (data.data?.emails ?? []) as Array<{ value: string; type: string }>;

    // Prefer generic addresses; fall back to first result
    const generic  = emails.find(e => e.type === 'generic');
    const firstEmail = generic?.value ?? emails[0]?.value;

    return firstEmail ? { email: firstEmail } : {};
  } catch {
    return {};
  }
}

// ── Agent implementation ──────────────────────────────────────────────────────

export class FactoryEnrichmentAgent implements AgentRunner {
  readonly agentType    = 'factory-enrichment';
  readonly name         = 'Factory Enrichment';
  readonly description  = 'Enriches incomplete factory metadata using Apollo.io, Firecrawl, and Hunter.io';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg         = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize   = Math.min(Number(cfg.batch_size   ?? 20), 50);
    const minNameLen  = Number(cfg.min_name_length ?? 3);
    const productIds  = (cfg.product_ids as string[] | undefined) ?? [];
    const scopeColumn = cfg.scope_column as 'source_document_id' | 'scrape_session_id' | undefined;
    const scopeValue  = cfg.scope_value  as string | undefined;
    const workspaceId = (cfg.workspace_id as string | undefined) ?? ctx.workspaceId ?? null;

    await log('info', 'Starting factory enrichment', { batchSize, productCount: productIds.length });

    // ── Fetch products that need enrichment ────────────────────────────────
    let query = supabase
      .from('products')
      .select('id, metadata')
      .not('metadata', 'is', null)
      .limit(batchSize);

    if (productIds.length > 0) {
      query = query.in('id', productIds);
    } else if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data: products, error: fetchErr } = await query;
    if (fetchErr) {
      await log('error', 'Failed to fetch products', { error: fetchErr.message });
      return { success: false, output: { error: fetchErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!products || products.length === 0) {
      await log('info', 'No products to enrich');
      return { success: true, output: { enriched: 0, skipped: 0, message: 'No products found' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    let enrichedCount = 0;
    let skippedCount  = 0;

    for (const product of products) {
      await heartbeat();

      const meta    = ((product.metadata as any) ?? {}) as Record<string, unknown>;
      const factory = (meta.factory ?? {}) as FactoryObject;

      // Skip if already complete
      if (factoryCompletenessScore(factory) >= 0.9) {
        skippedCount++;
        continue;
      }

      const factoryName = (factory.factory_name ?? meta.factory_name ?? '') as string;

      // Skip if no usable factory name
      if (!factoryName || factoryName.trim().length < minNameLen) {
        skippedCount++;
        await log('debug', `Skipping product ${product.id} — no factory name`);
        continue;
      }

      await log('info', `Enriching factory "${factoryName}" for product ${product.id}`);

      const website = (factory.website ?? meta.website ?? '') as string;
      const country = (factory.country  ?? meta.country  ?? '') as string;
      const domain  = website
        ? (() => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return ''; } })()
        : '';

      // ── Cascade: Apollo → Website → Hunter ──────────────────────────────
      let enriched: Partial<FactoryObject> = {};

      // 1. Apollo.io (structured B2B data — 20 s)
      const apolloData = await enrichViaApollo(factoryName, domain || undefined, country || undefined);
      enriched = { ...enriched, ...apolloData };
      await log('debug', `Apollo result for ${factoryName}`, { fields: Object.keys(apolloData).join(', ') || 'none' });

      await heartbeat();

      // 2. Firecrawl website scrape — use website from Apollo if we didn't have one
      const websiteToScrape = enriched.website ?? website;
      if (websiteToScrape) {
        const firecrawlData = await enrichViaWebsite(websiteToScrape);
        // Prefer Apollo data for fields it already filled; Firecrawl fills gaps
        enriched = { ...firecrawlData, ...enriched };
        await log('debug', `Firecrawl result for ${websiteToScrape}`, { fields: Object.keys(firecrawlData).join(', ') || 'none' });
      }

      await heartbeat();

      // 3. Hunter.io for email (only if still missing and we have a domain)
      const domainForHunter = domain || (enriched.website
        ? (() => { try { return new URL(enriched.website!).hostname.replace(/^www\./, ''); } catch { return ''; } })()
        : '');

      if (!enriched.email && domainForHunter) {
        const hunterData = await enrichViaHunter(domainForHunter);
        enriched = { ...enriched, ...hunterData };
        await log('debug', `Hunter result for ${domainForHunter}`, { found: !!hunterData.email });
      }

      // ── Write back if we got anything useful ────────────────────────────
      const hasNewData = Object.keys(enriched).some(k => {
        const v = (enriched as any)[k];
        return v !== undefined && v !== null && String(v).trim() !== '';
      });

      if (hasNewData) {
        // Merge with existing factory object
        const merged: FactoryObject = {
          factory_name:       factoryName,
          factory_group_name: (factory.factory_group_name ?? meta.factory_group_name ?? '') as string || undefined,
          ...factory,
          ...enriched,
        };

        await writeFactoryToProduct(supabase, product.id, merged);
        enrichedCount++;
        await log('info', `Updated factory data for product ${product.id}`, {
          score: factoryCompletenessScore(merged).toFixed(2),
        });
      } else {
        skippedCount++;
        await log('debug', `No new data found for product ${product.id} (factory: ${factoryName})`);
      }
    }

    // ── After enrichment: re-propagate within scope ───────────────────────
    if (enrichedCount > 0 && scopeColumn && scopeValue) {
      await heartbeat();
      const repropagated = await propagateFactoryFieldsInScope(supabase, scopeColumn, scopeValue);
      await log('info', `Re-propagated after enrichment: ${repropagated} additional products updated`);
    }

    await log('info', 'Factory enrichment complete', { enriched: enrichedCount, skipped: skippedCount });

    return {
      success:        true,
      output:         { enriched: enrichedCount, skipped: skippedCount, total: products.length },
      inputTokens:    0,
      outputTokens:   0,
      creditsDebited: 0,
      triggerChain:   enrichedCount > 0,
    };
  }
}
