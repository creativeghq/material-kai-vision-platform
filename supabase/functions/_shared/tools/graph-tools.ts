/**
 * Knowledge-Graph Traversal Tools — agent-chat surface for the relational graph.
 *
 * These tools let the KAI agent walk the EXISTING relational edges (products ↔
 * projects ↔ quotes ↔ invoices ↔ suppliers ↔ price history) that previously only
 * powered feature UIs. Each tool is a thin wrapper over a tenancy-guarded
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

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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
