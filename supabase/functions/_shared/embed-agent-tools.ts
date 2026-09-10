/** The tool allowlist for the PUBLIC agent surface (#382 Phase 2/3). */
import type { EmbedKeyContext } from './embed-key.ts';

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

  out.set('material_search', searchMod.createSearchTool(workspaceId, onChunk as never));
  out.set('price_my_spec', graphMod.createPriceMySpecTool(workspaceId, onChunk as never));
  out.set('calculate_kitchen_cost', calcMod.createKitchenCostTool(serviceClient(), onChunk as never));
  // No workspace argument at all — these are arithmetic, which is exactly why they can be offered
  // to a key that has no catalogue behind it.
  out.set('calculate_heat_pump_sizing', calcMod.createHeatPumpSizingTool(onChunk as never));
  out.set('calculate_heating_cost_comparison', calcMod.createHeatingCostComparisonTool(onChunk as never));
  out.set('raise_quote_request', quoteMod.createRaiseQuoteRequestTool('', workspaceId, onChunk as never));

  return out;
}
