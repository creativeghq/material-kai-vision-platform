/**
 * The tool allowlist for the PUBLIC agent surface (#382 Phase 2/3).
 *
 * WHY THIS IS A SEPARATE, HARDCODED LIST AND NOT AN AGENT CONFIG. `agent-chat` binds tools from
 * `AGENT_CONFIGS[id].tools`, and `load_toolkit` can widen that set mid-conversation. Both are
 * correct for a signed-in member of a workspace and both are wrong for a stranger on a merchant's
 * website: the caller here is anonymous by construction, so the set of things they can reach must
 * be a constant in the source, not a value looked up at runtime.
 *
 * THE ALLOWLIST IS THE SECURITY BOUNDARY. This surface is a text box (or a button) driving tools,
 * which makes it the highest prompt-injection exposure in the platform. The defence is not
 * cleverness about what the visitor typed — it is that nothing on this list can mutate anything
 * except `raise_quote_request`, which is Turnstile-gated and writes one CRM contact and one
 * request. An injection can therefore produce bad prose. It cannot produce a bad row.
 *
 * Never add: anything CRM-mutating, finance, deals, contracts, inbox, messaging, SEO, B2B research,
 * job research, projects, docs, scraping, or `confirm`. `confirm` is the human-in-the-loop gate
 * (CLAUDE.md invariant 9) and a public surface has nobody to ask.
 */
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
   *
   * Kept as a number rather than a boolean because the two states are not "free" and "expensive":
   * `price_my_spec` and `calculate_kitchen_cost` are pure SQL and measured at EXACTLY zero rows in
   * `ai_usage_logs` across repeated live runs, while `material_search` proxies MIVAA, which runs a
   * query-understanding turn plus embeddings and books ~$0.0011 a call. Calling all three "free"
   * was the first version of this file and it was wrong in the direction that matters: a surface
   * an anonymous stranger can press, described as costing nothing, that quietly bills the account.
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

/**
 * What a given KEY may actually run.
 *
 * Three gates, and each exists because the alternative fails silently:
 *   • a `tools` key gets only the tools that do not need a catalogue, because it has none — and
 *     offering `price_my_spec` to an architect with no products returns "nothing matched" forever,
 *     which reads as a broken widget rather than as a misconfiguration;
 *   • anything with a non-zero upstream cost needs `paid_tools_enabled`, so a key handed out for a
 *     free calculator cannot quietly start billing the platform;
 *   • `tools_enabled` is the master switch for a catalogue key, which did not ask for this surface.
 */
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

/**
 * Build the allowlisted tools for one embed request.
 *
 * `workspaceId` comes from `ctx`, which came from the KEY — never from the request body, and never
 * from anything the model produced (CLAUDE.md invariant 1). Every factory below takes it as its
 * tenancy argument, so a tool physically cannot read another tenant's rows however it is called.
 *
 * `userId` is the empty string on purpose. There is no user: the visitor is anonymous. The one
 * tool that needs an actor (`raise_quote_request`) writes `user_id: null` and identifies the
 * person by the CRM contact it finds or creates from their email, exactly as the widget's own
 * `request_quote` action does.
 */
/** One input a public tool takes, projected from its own zod schema. */
export interface PublicToolField {
  name: string;
  type: 'number' | 'boolean' | 'enum' | 'text';
  required: boolean;
  /** Present for `enum`. THE tool's values, never a list written next to it. */
  options?: string[];
  description?: string;
}

/**
 * Project a tool's zod schema into the fields a form can render.
 *
 * NEVER HAND-MIRROR A TOOL'S ENUM. That rule exists in CLAUDE.md because hand-written option lists
 * drift into values no enum accepts, and it is written from experience — this function exists
 * because the widget's first version passed `insulation_level: 'average'` and `emitter: 'radiators'`
 * to a tool whose schema says `none|medium|modern|passive` and `underfloor|fan_coil|…`. Every call
 * failed, and it failed at the tool boundary where the visitor just sees a widget that does not
 * work. Reading the schema is the only version of this that cannot be wrong.
 */
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
