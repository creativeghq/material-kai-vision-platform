/**
 * Knowledge-Graph Traversal Tools — agent-chat surface for the relational graph.
 *
 * These tools let the KAI agent walk the EXISTING relational edges (products ↔
 * projects ↔ quotes ↔ invoices ↔ suppliers ↔ price history) that also power the
 * feature UIs. Each tool is a thin wrapper over a tenancy-guarded
 * SECURITY DEFINER RPC (see migration `phase1_knowledge_graph_traversal_rpcs`);
 * the RPC scopes every query by workspace_id, so the tools only pass ids.
 *
 * Tools (6):
 *   - product_provenance       — maker(s) bought from, projects, quote/invoice footprint, latest tracked price
 *   - product_price_history    — windowed retailer price series + min/median/max
 *   - projects_using_product   — which projects consume a product
 *   - products_in_project      — the product line-up of a project
 *   - customer_overview        — quotes + invoices (AR aging) + projects for a company  [customer_360]
 *   - supplier_overview        — bills (AP aging) + POs + products supplied             [supplier_360, admin/finance only]
 *
 * Cost discipline: every tool is 0 credits (DB-only RPC reads).
 * Resolution: id args may be given directly, or resolved from a sku / name so the
 * agent can chain from a material_search / find_project result OR a bare name.
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
const { createClient } = await import('npm:@supabase/supabase-js@2');


import { serviceClient as svcClient } from '../supabase-client.ts';
// ── id resolvers (workspace-scoped) ─────────────────────────────────────────

async function resolveProductId(sb: any, workspaceId: string, productId?: string, sku?: string): Promise<string | null> {
  if (productId) return productId;
  if (sku) {
    const { data } = await sb
      .from('products')
      .select('id')
      .eq('workspace_id', workspaceId)
      .or(`sku.eq.${sku},external_sku.eq.${sku}`)
      .limit(1);
    return (data && data[0]?.id) || null;
  }
  return null;
}

async function resolveProjectId(sb: any, workspaceId: string, projectId?: string, name?: string): Promise<string | null> {
  if (projectId) return projectId;
  if (name) {
    const { data } = await sb
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('name', `%${name}%`)
      .order('last_activity_at', { ascending: false })
      .limit(1);
    return (data && data[0]?.id) || null;
  }
  return null;
}

async function resolveCompanyId(sb: any, workspaceId: string, companyId?: string, name?: string): Promise<string | null> {
  if (companyId) return companyId;
  if (name) {
    const { data } = await sb
      .from('crm_companies')
      .select('id')
      .eq('workspace_id', workspaceId)
      .ilike('name', `%${name}%`)
      .limit(1);
    return (data && data[0]?.id) || null;
  }
  return null;
}

// ── 1) product_provenance ───────────────────────────────────────────────────

export const createProductProvenanceTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, sku }: { product_id?: string; sku?: string }) => {
      const sb = svcClient();
      const pid = await resolveProductId(sb, workspaceId, product_id, sku);
      if (!pid) return JSON.stringify({ success: false, error: 'Need product_id or a resolvable sku.' });

      const { data, error } = await sb.rpc('get_product_provenance', { p_workspace_id: workspaceId, p_product_id: pid });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'product_provenance_result', workspace_id: workspaceId, product_id: pid, provenance: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, provenance: data });
    },
    {
      name: 'product_provenance',
      description:
        'Full provenance of a product: which supplier(s) it was bought from, which projects use it, ' +
        'how many quotes/invoices reference it, the source document, and the latest tracked retail price. ' +
        'Use for "where did we buy product X", "is product X used anywhere", "show product X across the business". ' +
        'Pass product_id (e.g. from material_search) or a sku.',
      schema: z.object({
        product_id: z.string().optional().describe('Product UUID (preferred — from a material_search result)'),
        sku: z.string().optional().describe('SKU / external SKU to resolve to a product when no id is known'),
      }),
    },
  );
};

// ── 2) product_price_history ────────────────────────────────────────────────

export const createProductPriceHistoryTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, sku, days }: { product_id?: string; sku?: string; days?: number }) => {
      const sb = svcClient();
      const pid = await resolveProductId(sb, workspaceId, product_id, sku);
      if (!pid) return JSON.stringify({ success: false, error: 'Need product_id or a resolvable sku.' });

      const { data, error } = await sb.rpc('get_product_price_history', {
        p_workspace_id: workspaceId, p_product_id: pid, p_days: days ?? 90,
      });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'product_price_history_result', workspace_id: workspaceId, product_id: pid, history: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, history: data });
    },
    {
      name: 'product_price_history',
      description:
        'Tracked retailer price history for a product over a window (default 90 days): min/median/max plus the ' +
        'per-retailer series, with anomalies and non-matching listings filtered out. ' +
        'Use for "price trend for product X", "what are retailers charging for X", "is X getting cheaper". ' +
        'Only returns data for products enrolled in price monitoring. Pass product_id or sku.',
      schema: z.object({
        product_id: z.string().optional().describe('Product UUID'),
        sku: z.string().optional().describe('SKU / external SKU to resolve'),
        days: z.number().optional().describe('Look-back window in days (default 90)'),
      }),
    },
  );
};

// ── 3) projects_using_product ───────────────────────────────────────────────

export const createProjectsUsingProductTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, sku }: { product_id?: string; sku?: string }) => {
      const sb = svcClient();
      const pid = await resolveProductId(sb, workspaceId, product_id, sku);
      if (!pid) return JSON.stringify({ success: false, error: 'Need product_id or a resolvable sku.' });

      const { data, error } = await sb.rpc('get_projects_using_product', { p_workspace_id: workspaceId, p_product_id: pid });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'projects_using_product_result', workspace_id: workspaceId, product_id: pid, projects: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: Array.isArray(data) ? data.length : 0, projects: data });
    },
    {
      name: 'projects_using_product',
      description:
        'List the projects that use a given product (with quantity, unit, sold price, client). ' +
        'Use for "which projects use product X", "where have we spec\'d X". Pass product_id or sku.',
      schema: z.object({
        product_id: z.string().optional().describe('Product UUID'),
        sku: z.string().optional().describe('SKU / external SKU to resolve'),
      }),
    },
  );
};

// ── 4) products_in_project ──────────────────────────────────────────────────

export const createProductsInProjectTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name }: { project_id?: string; project_name?: string }) => {
      const sb = svcClient();
      const prid = await resolveProjectId(sb, workspaceId, project_id, project_name);
      if (!prid) return JSON.stringify({ success: false, error: 'Need project_id or a resolvable project_name. Try find_project first.' });

      const { data, error } = await sb.rpc('get_products_in_project', { p_workspace_id: workspaceId, p_project_id: prid });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'products_in_project_result', workspace_id: workspaceId, project_id: prid, products: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: Array.isArray(data) ? data.length : 0, products: data });
    },
    {
      name: 'products_in_project',
      description:
        'The product line-up of a project (name, sku, brand, quantity, unit, sold price, room, status). ' +
        'Use for "what products are in project X", "the spec list for X". Pass project_id or project_name.',
      schema: z.object({
        project_id: z.string().optional().describe('Project UUID'),
        project_name: z.string().optional().describe('Project name fragment (fuzzy resolved)'),
      }),
    },
  );
};

// ── 5) customer_overview (customer_360) ─────────────────────────────────────

export const createCustomerOverviewTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ company_id, company_name }: { company_id?: string; company_name?: string }) => {
      const sb = svcClient();
      const cid = await resolveCompanyId(sb, workspaceId, company_id, company_name);
      if (!cid) return JSON.stringify({ success: false, error: 'Need company_id or a resolvable company_name.' });

      const { data, error } = await sb.rpc('customer_360', { p_workspace_id: workspaceId, p_company_id: cid });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'customer_overview_result', workspace_id: workspaceId, company_id: cid, overview: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, overview: data });
    },
    {
      name: 'customer_overview',
      description:
        'A 360° view of a customer company: quote count + total value + open count, invoice count + outstanding ' +
        'AR with aging buckets (current / 1-30 / 31-60 / 61-90 / 90+), and their projects. ' +
        'Use for "give me everything on customer X", "how much does X owe us", "X\'s account summary". ' +
        'Pass company_id or company_name.',
      schema: z.object({
        company_id: z.string().optional().describe('CRM company UUID'),
        company_name: z.string().optional().describe('Company name fragment (fuzzy resolved)'),
      }),
    },
  );
};

// ── 6) supplier_overview (supplier_360) — admin/finance only ────────────────

export const createSupplierOverviewTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ company_id, company_name }: { company_id?: string; company_name?: string }) => {
      const sb = svcClient();
      const cid = await resolveCompanyId(sb, workspaceId, company_id, company_name);
      if (!cid) return JSON.stringify({ success: false, error: 'Need company_id or a resolvable company_name.' });

      const { data, error } = await sb.rpc('supplier_360', { p_workspace_id: workspaceId, p_company_id: cid });
      if (error) return JSON.stringify({ success: false, error: error.message });

      onChunk?.({ type: 'supplier_overview_result', workspace_id: workspaceId, company_id: cid, overview: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, overview: data });
    },
    {
      name: 'supplier_overview',
      description:
        'A 360° view of a supplier company: bill count + outstanding AP with aging buckets, purchase-order ' +
        'count + open count, and the products we source from them. Finance data — admin/owner only. ' +
        'Use for "what do we owe supplier X", "what do we buy from X". Pass company_id or company_name.',
      schema: z.object({
        company_id: z.string().optional().describe('CRM company UUID'),
        company_name: z.string().optional().describe('Company name fragment (fuzzy resolved)'),
      }),
    },
  );
};

// ── 7) products_by_brand (Phase 2 — maker as a node) ────────────────────────

export const createProductsByBrandTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ company_id, brand_name }: { company_id?: string; brand_name?: string }) => {
      const sb = svcClient();
      const cid = await resolveCompanyId(sb, workspaceId, company_id, brand_name);
      if (!cid) return JSON.stringify({ success: false, error: 'Need company_id or a resolvable brand_name.' });
      const { data, error } = await sb.rpc('get_products_by_brand', { p_workspace_id: workspaceId, p_company_id: cid });
      if (error) return JSON.stringify({ success: false, error: error.message });
      onChunk?.({ type: 'products_by_brand_result', workspace_id: workspaceId, company_id: cid, products: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: Array.isArray(data) ? data.length : 0, products: data });
    },
    {
      name: 'products_by_brand',
      description:
        'List every product made by a given brand/manufacturer. Use for "all products by brand X", ' +
        '"what do we carry from manufacturer Y". Pass company_id or brand_name (fuzzy resolved).',
      schema: z.object({
        company_id: z.string().optional().describe('Brand/manufacturer CRM company UUID'),
        brand_name: z.string().optional().describe('Brand/manufacturer name fragment (fuzzy resolved)'),
      }),
    },
  );
};

// ── 8) brand_overview (Phase 2) ─────────────────────────────────────────────

export const createBrandOverviewTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ company_id, brand_name }: { company_id?: string; brand_name?: string }) => {
      const sb = svcClient();
      const cid = await resolveCompanyId(sb, workspaceId, company_id, brand_name);
      if (!cid) return JSON.stringify({ success: false, error: 'Need company_id or a resolvable brand_name.' });
      const { data, error } = await sb.rpc('brand_overview', { p_workspace_id: workspaceId, p_company_id: cid });
      if (error) return JSON.stringify({ success: false, error: error.message });
      onChunk?.({ type: 'brand_overview_result', workspace_id: workspaceId, company_id: cid, overview: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, overview: data });
    },
    {
      name: 'brand_overview',
      description:
        'A 360° view of a brand/manufacturer: product count, sample products, and how many projects use them. ' +
        'Use for "tell me about brand X", "how many products does manufacturer Y have". Pass company_id or brand_name.',
      schema: z.object({
        company_id: z.string().optional().describe('Brand/manufacturer CRM company UUID'),
        brand_name: z.string().optional().describe('Brand/manufacturer name fragment (fuzzy resolved)'),
      }),
    },
  );
};

// ── 9) related_products (Phase 3c — relational co-occurrence) ───────────────

export const createRelatedProductsTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, sku, limit }: { product_id?: string; sku?: string; limit?: number }) => {
      const sb = svcClient();
      const pid = await resolveProductId(sb, workspaceId, product_id, sku);
      if (!pid) return JSON.stringify({ success: false, error: 'Need product_id or a resolvable sku.' });
      const { data, error } = await sb.rpc('get_cooccurring_products', { p_workspace_id: workspaceId, p_product_id: pid, p_limit: limit ?? 20 });
      if (error) return JSON.stringify({ success: false, error: error.message });
      onChunk?.({ type: 'related_products_result', workspace_id: workspaceId, product_id: pid, related: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: Array.isArray(data) ? data.length : 0, related: data });
    },
    {
      name: 'related_products',
      description:
        'Products frequently used TOGETHER with a given product — co-occurrence across the same projects, quotes, ' +
        'and moodboards (a relational "used together" signal, distinct from visual/embedding similarity). ' +
        'Each result carries the breakdown (via_projects / via_quotes / via_moodboards) + a combined score. ' +
        'Use for "what goes with product X", "what do people buy alongside X". Pass product_id or sku.',
      schema: z.object({
        product_id: z.string().optional().describe('Product UUID'),
        sku: z.string().optional().describe('SKU / external SKU to resolve'),
        limit: z.number().optional().describe('Max related products (default 20)'),
      }),
    },
  );
};

// ── 10) find_products_by_spec (Phase 3b — numeric spec range filters) ───────

export const createFindProductsBySpecTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ ip_min, ip_max, pei_min, thickness_min, thickness_max, wattage_min, wattage_max, limit }: {
      ip_min?: number; ip_max?: number; pei_min?: number;
      thickness_min?: number; thickness_max?: number; wattage_min?: number; wattage_max?: number; limit?: number;
    }) => {
      const sb = svcClient();
      const filters: Record<string, number> = {};
      if (ip_min != null) filters.ip_min = ip_min;
      if (ip_max != null) filters.ip_max = ip_max;
      if (pei_min != null) filters.pei_min = pei_min;
      if (thickness_min != null) filters.thickness_min = thickness_min;
      if (thickness_max != null) filters.thickness_max = thickness_max;
      if (wattage_min != null) filters.wattage_min = wattage_min;
      if (wattage_max != null) filters.wattage_max = wattage_max;
      if (Object.keys(filters).length === 0) return JSON.stringify({ success: false, error: 'Provide at least one numeric spec filter (ip/pei/thickness/wattage).' });
      const { data, error } = await sb.rpc('search_products_by_specs', { p_workspace_id: workspaceId, p_filters: filters, p_limit: limit ?? 50 });
      if (error) return JSON.stringify({ success: false, error: error.message });
      onChunk?.({ type: 'find_products_by_spec_result', workspace_id: workspaceId, filters, products: data, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: Array.isArray(data) ? data.length : 0, filters, products: data });
    },
    {
      name: 'find_products_by_spec',
      description:
        'Filter products by NUMERIC spec ranges — IP rating, PEI class, thickness (mm), wattage (W) — ' +
        'parsed from product specs into queryable numbers. Use for "tiles with IP rating 65 or higher", ' +
        '"PEI IV and above", "panels 6–10mm thick", "fixtures 50–100W". Pass any combination of min/max bounds.',
      schema: z.object({
        ip_min: z.number().optional().describe('Minimum IP rating, e.g. 65'),
        ip_max: z.number().optional().describe('Maximum IP rating'),
        pei_min: z.number().optional().describe('Minimum PEI class (1–5; III = 3)'),
        thickness_min: z.number().optional().describe('Minimum thickness in mm'),
        thickness_max: z.number().optional().describe('Maximum thickness in mm'),
        wattage_min: z.number().optional().describe('Minimum wattage in W'),
        wattage_max: z.number().optional().describe('Maximum wattage in W'),
        limit: z.number().optional().describe('Max results (default 50)'),
      }),
    },
  );
};

// ── 11) price_my_spec (#337 — the embed's "price it", in chat) ──────────────

/**
 * Answer "I want X like this — what does it cost?" the same way the website embed does.
 *
 * SIBLING OF `find_products_by_spec`, NOT A DUPLICATE. That one filters NUMERIC ranges (IP rating,
 * PEI class, thickness, wattage) and returns a list. This one takes a CATEGORICAL specification —
 * the nouns and adjectives a customer actually says, "a lounge armchair in linen, sunset" — and
 * returns a VERDICT: exact, near, or nothing, which is what decides between quoting a price and
 * opening a quote request.
 *
 * IT CALLS THE SAME RPC THE EMBED CALLS. `resolve_product_spec` is the one derivation of that
 * verdict; a second implementation here would be free to disagree with the widget on a customer's
 * own website, which is the failure mode this codebase keeps paying for. The tool is a thin
 * wrapper — the matching rule, the tenancy scope and the "near matches carry no price" decision all
 * stay in SQL.
 *
 * NO PRICE ON A NEAR MATCH, and none invented here. A near match is a suggestion; putting a number
 * on it would have the agent quote a figure nobody approved.
 */
export const createPriceMySpecTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_type, spec, limit }: {
      product_type?: string;
      spec?: Record<string, string>;
      limit?: number;
    }) => {
      const sb = svcClient();

      // The noun travels INSIDE the spec, because that is the shape the RPC understands: it strips
      // `product_type` out of the jsonb containment predicate and applies it as its own filter.
      const fullSpec: Record<string, string> = { ...(spec ?? {}) };
      if (product_type) fullSpec.product_type = product_type;
      if (Object.keys(fullSpec).length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Describe what you are after — at minimum a product type, e.g. product_type: "lounge armchair".',
        });
      }

      const { data, error } = await sb.rpc('resolve_product_spec', {
        p_workspace_id: workspaceId,
        p_spec: fullSpec,
        p_limit: limit ?? 5,
      });
      if (error) return JSON.stringify({ success: false, error: error.message });

      const res = (data ?? {}) as Record<string, any>;
      const matches: Array<{ product_id: string; name: string }> = res.matches ?? [];

      // Only an exact match is priced, and the price comes from `get_configured_product_price` —
      // the same single derivation the widget, the configurator and the quote line all read.
      let priced: Record<string, unknown> | null = null;
      if (res.match_kind === 'exact' && matches[0]) {
        const { data: p } = await sb.rpc('get_configured_product_price', {
          p_workspace_id: workspaceId,
          p_product_id: matches[0].product_id,
          p_option_value_ids: [],
          p_audience: 'buyer',
        });
        const row = (p ?? {}) as Record<string, unknown>;
        // STAGE 4 OF THE FLOW — "place it" (#341 join 4).
        //
        // The room planner was built, tested and reachable from nothing but its own nav tile, so
        // the flow went straight from "here is a picture" to "here is a price" and the one stage
        // that answers "will it actually fit" never happened. It is only ever offered for a
        // product that HAS a model: the planner places things at their real size, and a product
        // with no model has no size to place. Answered here rather than left to the agent, which
        // would otherwise guess — and a link to an empty planner is worse than no link.
        const { data: models } = await sb.from('product_3d_models')
          .select('format').eq('product_id', matches[0].product_id).limit(1);
        const hasModel = Array.isArray(models) && models.length > 0;
        const appOrigin = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');
        priced = {
          product_id: matches[0].product_id,
          name: matches[0].name,
          net_price: row.configured_price ?? null,
          currency: row.currency ?? 'EUR',
          has_model: hasModel,
          // Present iff there is something to place. Its ABSENCE is the instruction not to offer
          // the stage, in the same way a missing `product` means "offer a quote request".
          planner_url: hasModel ? `${appOrigin}/room-planner?product=${matches[0].product_id}` : null,
        };
      }

      const verdict = priced ? 'exact' : (res.match_kind === 'exact' ? 'none' : res.match_kind ?? 'none');

      // ON A MISS, HAND BACK THE REAL VOCABULARY.
      //
      // The agent does not know this workspace's facet KEYS. Asked "how much for a navy armchair"
      // it will reasonably send {"color": "navy"} when the key is `available_colors`, get nothing,
      // and tell the customer we do not stock it — a confident wrong answer, which is worse than
      // an error. It cannot guess its way out either: the keys are whatever this tenant's catalog
      // happens to use.
      //
      // So a miss returns what could have been asked, and the guidance tells the agent to retry
      // before concluding anything. Only on the SECOND miss is "we don't have it" trustworthy.
      let vocabulary: unknown = undefined;
      if (!priced) {
        const { data: vocab } = await sb.rpc('get_embed_spec_options', {
          p_workspace_id: workspaceId,
          p_product_ids: null,
          p_max_facets: 12,
          p_max_values: 30,
        });
        vocabulary = (Array.isArray(vocab) ? vocab : []).map((f: any) => ({
          key: f.facet_key,
          values: (f.values ?? []).filter((v: any) => v.in_catalog).map((v: any) => v.value),
        })).filter((f: any) => f.values.length > 0);
      }
      onChunk?.({
        type: 'spec_pricing_result',
        workspace_id: workspaceId,
        spec: fullSpec,
        match_kind: verdict,
        product: priced,
        near_matches: res.near_matches ?? [],
        // What the agent should do next, stated rather than inferred: this is the whole point of
        // the tool, and leaving it implicit is how "quote it" turns into "invent a price".
        next_step: priced ? 'quote_the_price' : 'offer_a_quote_request',
        // The card shows the planner button only when the server said there is a model to place.
        planner_url: (priced as Record<string, unknown> | null)?.planner_url ?? null,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        match_kind: verdict,
        spec: fullSpec,
        product: priced,
        near_matches: res.near_matches ?? [],
        available_vocabulary: vocabulary,
        guidance: priced
          ? 'An exact match exists. If `planner_url` is present, offer to place it in the room at '
            + 'real size BEFORE quoting — that is stage 4 of the flow and it is the stage that '
            + 'answers "will it fit". A null `planner_url` means there is no model to place: skip '
            + 'the offer rather than linking to an empty planner. Then quote this price.'
          : 'No match for the keys you used. FIRST check `available_vocabulary` above — it lists the '
            + 'facet keys and in-stock values this catalogue actually uses, and your key names may '
            + 'simply differ (e.g. "color" vs "available_colors"). Retry once with the real keys. '
            + 'If it still misses, the catalogue genuinely does not have it: do NOT estimate a price '
            + '— offer to raise a quote request. Near matches are suggestions and carry no price on purpose.',
      });
    },
    {
      name: 'price_my_spec',
      description:
        'Price a described specification against the published catalogue — "a lounge armchair in linen, sunset", '
        + '"velvet dining chair". Returns exact / near / none: an exact match comes back PRICED, anything else '
        + 'comes back deliberately WITHOUT a price so you offer a quote request instead of estimating. '
        + 'Use for "how much would X cost", "do we have X", "can we do X in Y". For NUMERIC ranges '
        + '(IP rating, PEI, thickness, wattage) use find_products_by_spec instead.',
      schema: z.object({
        product_type: z.string().optional().describe('What the thing IS, e.g. "lounge armchair", "floor tile"'),
        spec: z.record(z.string()).optional().describe(
          'Attributes as key/value, e.g. {"fabric":"linen","available_colors":"sunset"}',
        ),
        limit: z.number().optional().describe('Max matches and near matches (default 5)'),
      }),
    },
  );
};
