/** The tool allowlist for the PUBLIC agent surface (#382 Phase 2/3). */
import type { EmbedKeyContext } from './embed-key.ts';
import type { DbClient } from './supabase-client.ts';
import { PUBLIC_PRODUCT_STATUS } from './commerce/public-catalogue.ts';

export interface PublicTool {
  name: string;
  /** Shown on the quick-start button. */
  label: string;
  /**
   * No AGENT LOOP. The caller supplies the arguments and we invoke the tool directly, so there is
   * no model deciding what to call, no conversation state and no token bill for the reasoning.
   * True for everything on this list — it is what makes the surface a set of buttons rather than a
   * chat box.
   *
   * It is NOT the same claim as "free": see `upstreamCostUsd`.
   */
  deterministic: boolean;
  /**
   * What one run costs the platform's own API accounts, measured — NOT what the agent loop would
   * have cost, which is zero for everything here.
   */
  upstreamCostUsd: number;
  /** True for the one tool that writes. Gated on Turnstile before it is reached. */
  writes: boolean;
  /**
   * Does this tool need the embedder to have a CATALOGUE?
   *
   * The distinction the free-tools key turns on. `price_my_spec` searches published products and
   * is meaningless to an architect who sells none; a heat-pump sizer is arithmetic and works for
   * anybody. A `key_kind: 'tools'` key serves no catalogue at all, so it is offered exactly the
   * tools for which that is not a limitation.
   */
  needsCatalog: boolean;
}

export const PUBLIC_TOOLS: PublicTool[] = [
  {
    name: 'material_search',
    label: 'Show me what works with this',
    deterministic: true,
    // Proxies MIVAA: query understanding + embeddings + rerank. Measured 2026-08-23.
    upstreamCostUsd: 0.0011,
    writes: false,
    needsCatalog: true,
  },
  {
    name: 'price_my_spec',
    label: 'What would this cost',
    deterministic: true,
    // Pure SQL — `resolve_product_spec` + `get_configured_product_price`. Measured at zero.
    upstreamCostUsd: 0,
    writes: false,
    needsCatalog: true,
  },
  {
    name: 'calculate_kitchen_cost',
    label: 'Estimate a kitchen',
    deterministic: true,
    // Pure arithmetic over the live price list. Measured at zero.
    upstreamCostUsd: 0,
    writes: false,
    // Prices from the PLATFORM STARTER kitchen blueprint, not from the embedder's catalogue, so
    // it works for a workspace that has never published a product.
    needsCatalog: false,
  },
  {
    name: 'raise_quote_request',
    label: 'Request a quote',
    deterministic: true,
    // A CRM insert. No model anywhere in it.
    upstreamCostUsd: 0,
    writes: true,
    // THE POINT OF THE WHOLE FREE-TOOLS KEY: whoever embedded the calculator gets the lead. The
    // workspace comes from the key, so this needs no catalogue and cannot be redirected.
    needsCatalog: false,
  },
  // ── The free calculators (#382 follow-up) ──────────────────────────────────────────────────
  //
  // Deterministic arithmetic with NO backend of any kind — the in-app tools compute these in the
  // browser. They cost nothing however hard a stranger presses them, which is what makes them
  // safe to hand to anybody who wants to put one on their own site.
  {
    name: 'calculate_heat_pump_sizing',
    label: 'Size a heat pump',
    deterministic: true,
    upstreamCostUsd: 0,
    writes: false,
    needsCatalog: false,
  },
  {
    name: 'calculate_heating_cost_comparison',
    label: 'Compare heating costs',
    deterministic: true,
    upstreamCostUsd: 0,
    writes: false,
    needsCatalog: false,
  },
];

/** What a given KEY may actually run. */
export function toolsForKey(key: {
  key_kind?: string | null;
  tools_enabled?: boolean | null;
  paid_tools_enabled?: boolean | null;
}): PublicTool[] {
  const isToolsKey = key.key_kind === 'tools';
  if (!isToolsKey && !key.tools_enabled) return [];
  return PUBLIC_TOOLS.filter((t) => {
    if (isToolsKey && t.needsCatalog) return false;
    if (t.upstreamCostUsd > 0 && !key.paid_tools_enabled) return false;
    return true;
  });
}

export const PUBLIC_TOOL_NAMES: ReadonlySet<string> = new Set(PUBLIC_TOOLS.map((t) => t.name));

/** Build the allowlisted tools for one embed request. */
/** One input a public tool takes, projected from its own zod schema. */
export interface PublicToolField {
  name: string;
  type: 'number' | 'boolean' | 'enum' | 'text';
  required: boolean;
  /** Present for `enum`. THE tool's values, never a list written next to it. */
  options?: string[];
  description?: string;
}

/** Project a tool's zod schema into the fields a form can render. */
// deno-lint-ignore no-explicit-any
export function fieldsFromSchema(schema: any): PublicToolField[] {
  const shape = schema?.shape ?? schema?._def?.shape?.();
  if (!shape || typeof shape !== 'object') return [];

  return Object.entries(shape).map(([name, raw]) => {
    // Unwrap optional/default/nullable wrappers to reach the type that carries the values.
    let node = raw as any;
    let required = true;
    const description: string | undefined = node?.description;
    for (let i = 0; i < 5; i++) {
      const kind = node?._def?.typeName;
      if (kind === 'ZodOptional' || kind === 'ZodNullable' || kind === 'ZodDefault') {
        required = false;
        node = node._def.innerType;
      } else break;
    }
    const kind = node?._def?.typeName;
    const options: string[] | undefined = kind === 'ZodEnum' ? node._def.values : undefined;
    const type: PublicToolField['type'] = options
      ? 'enum'
      : kind === 'ZodNumber' ? 'number'
        : kind === 'ZodBoolean' ? 'boolean'
          : 'text';
    return {
      name,
      type,
      required,
      ...(options ? { options } : {}),
      ...(description || node?.description ? { description: description ?? node.description } : {}),
    };
  });
}

export async function buildPublicTools(
  ctx: EmbedKeyContext,
  onChunk?: (chunk: unknown) => void,
// deno-lint-ignore no-explicit-any
): Promise<Map<string, { invoke: (input: unknown) => Promise<unknown>; schema?: any }>> {
  // deno-lint-ignore no-explicit-any
  const out = new Map<string, { invoke: (input: unknown) => Promise<unknown>; schema?: any }>();
  const { workspaceId } = ctx;

  const [searchMod, graphMod, calcMod, quoteMod] = await Promise.all([
    import('./tools/search-tools.ts'),
    import('./tools/graph-tools.ts'),
    import('./tools/calculator-tools.ts'),
    import('./tools/quote-tools.ts'),
  ]);
  const { serviceClient } = await import('./supabase-client.ts');

  const db = serviceClient();
  const search = searchMod.createSearchTool(workspaceId);
  const priceSpec = graphMod.createPriceMySpecTool(workspaceId);
  out.set('material_search', {
    schema: search.schema,
    invoke: async (input: unknown) => publicSearchResult(db, ctx, parseToolJson(await search.invoke(input))),
  });
  out.set('price_my_spec', {
    schema: priceSpec.schema,
    invoke: async (input: unknown) => publicSpecResult(db, ctx, parseToolJson(await priceSpec.invoke(input))),
  });
  out.set('calculate_kitchen_cost', calcMod.createKitchenCostTool(serviceClient(), onChunk as never));
  // No workspace argument at all — these are arithmetic, which is exactly why they can be offered
  // to a key that has no catalogue behind it.
  out.set('calculate_heat_pump_sizing', calcMod.createHeatPumpSizingTool(onChunk as never));
  out.set('calculate_heating_cost_comparison', calcMod.createHeatingCostComparisonTool(onChunk as never));
  out.set('raise_quote_request', quoteMod.createRaiseQuoteRequestTool('', workspaceId, onChunk as never));

  return out;
}

// ── Public projection ────────────────────────────────────────────────────────────────────────
// The catalogue tools answer for a signed-in member; an anonymous visitor gets only what a
// storefront would show: active, published-priced, inside the key's scope, public fields only.

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

function parseToolJson(raw: unknown): Json {
  if (raw && typeof raw === 'object') return raw as Json;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Product ids a search payload names, in its own order. */
export function productIdsInPayload(payload: Json): string[] {
  const ids: string[] = [];
  for (const key of ['results', 'products']) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      const id = r?.product_id ?? r?.id;
      if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  attributes: Json;
  price: { list_price: number; currency: string | null; unit: string | null } | null;
}

/** Which of `ids` this key may show, projected for the public. Throws on a failed read. */
export async function publicProductProjection(
  db: DbClient,
  ctx: EmbedKeyContext,
  ids: string[],
): Promise<Map<string, PublicProduct>> {
  const out = new Map<string, PublicProduct>();
  if (ids.length === 0 || ctx.scopeType === 'blueprints') return out;
  let wanted = ids;
  if (ctx.scopeType === 'products') wanted = ids.filter((id) => ctx.scopeValues.includes(id));
  if (ctx.scopeType !== 'all' && ctx.scopeValues.length === 0) return out;
  if (wanted.length === 0) return out;

  let q = db
    .from('product_prices')
    .select('product_id, variant_key, list_price, currency, unit, '
      + 'product:products!inner(id, name, description, attributes, status, category_id)')
    .eq('workspace_id', ctx.workspaceId)
    .eq('storefront_published', true)
    .not('list_price', 'is', null)
    .eq('product.status', PUBLIC_PRODUCT_STATUS)
    .in('product_id', wanted);
  if (ctx.scopeType === 'categories') q = q.in('product.category_id', ctx.scopeValues);
  const { data, error } = await q;
  if (error) throw new Error(`public catalogue read failed: ${error.message}`);

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  for (const r of rows) {
    const p = r.product;
    if (!p) continue;
    const basePrice = r.variant_key
      ? null
      : { list_price: Number(r.list_price), currency: r.currency ?? null, unit: r.unit ?? null };
    const existing = out.get(p.id);
    if (existing) {
      if (basePrice) existing.price = basePrice;
      continue;
    }
    out.set(p.id, {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      attributes: (p.attributes ?? {}) as Json,
      price: basePrice,
    });
  }
  await Promise.all([...out.values()].map(async (p) => {
    p.attributes = await publicFields(db, p.attributes);
  }));
  return out;
}

/** The registry's public subset of a bag — `public_catalogue_fields`, the one SQL answer. */
async function publicFields(db: DbClient, bag: Json): Promise<Json> {
  if (!bag || Object.keys(bag).length === 0) return {};
  const { data, error } = await db.rpc('public_catalogue_fields', { p_bag: bag });
  if (error) throw new Error(`field redaction failed: ${error.message}`);
  return (data ?? {}) as Json;
}

export async function publicSearchResult(db: DbClient, ctx: EmbedKeyContext, payload: Json): Promise<Json> {
  if (payload.error) return { success: false, error: 'Search is unavailable right now.' };
  const ids = productIdsInPayload(payload);
  const allowed = await publicProductProjection(db, ctx, ids);
  return {
    success: true,
    results: ids.filter((id) => allowed.has(id)).map((id) => allowed.get(id)),
  };
}

export async function publicSpecResult(db: DbClient, ctx: EmbedKeyContext, payload: Json): Promise<Json> {
  if (payload.success === false) return { success: false, error: String(payload.error ?? 'Could not price that.') };
  const nearIds = (Array.isArray(payload.near_matches) ? payload.near_matches : [])
    .map((m: Json) => m?.product_id).filter((id: unknown): id is string => typeof id === 'string');
  const exactId: string | null = typeof payload.product?.product_id === 'string' ? payload.product.product_id : null;
  const allowed = await publicProductProjection(db, ctx, [...(exactId ? [exactId] : []), ...nearIds]);

  const product = exactId && allowed.has(exactId)
    ? {
      product_id: exactId,
      name: allowed.get(exactId)!.name,
      net_price: payload.product.net_price ?? null,
      currency: payload.product.currency ?? null,
      planner_url: payload.product.planner_url ?? null,
    }
    : null;

  let vocabulary: Json[] | undefined;
  if (Array.isArray(payload.available_vocabulary)) {
    const keys = Object.fromEntries(payload.available_vocabulary.map((f: Json) => [String(f.key), true]));
    const publicKeys = await publicFields(db, keys);
    vocabulary = payload.available_vocabulary.filter((f: Json) => String(f.key) in publicKeys);
  }

  return {
    success: true,
    match_kind: product ? 'exact' : (payload.match_kind === 'exact' ? 'none' : payload.match_kind ?? 'none'),
    spec: payload.spec ?? null,
    product,
    near_matches: nearIds.filter((id: string) => allowed.has(id)).map((id: string) => ({ product_id: id, name: allowed.get(id)!.name })),
    available_vocabulary: vocabulary,
  };
}
