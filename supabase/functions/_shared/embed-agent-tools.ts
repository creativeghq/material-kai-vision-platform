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

/** What one public tool costs the merchant, in Anthropic dollars, when run WITHOUT a model turn. */
export interface PublicTool {
  name: string;
  /** Shown on the quick-start button. */
  label: string;
  /**
   * A DETERMINISTIC tool runs with no model turn at all — the caller supplies the arguments and we
   * invoke it directly. That is the whole reason the buttons exist: a visitor's first interaction
   * with the widget costs the merchant nothing and still returns real data.
   */
  deterministic: boolean;
  /** True for the one tool that writes. Gated on Turnstile before it is reached. */
  writes: boolean;
}

export const PUBLIC_TOOLS: PublicTool[] = [
  {
    name: 'material_search',
    label: 'Show me what works with this',
    deterministic: true,
    writes: false,
  },
  {
    name: 'price_my_spec',
    label: 'What would this cost',
    deterministic: true,
    writes: false,
  },
  {
    name: 'calculate_kitchen_cost',
    label: 'Estimate a kitchen',
    deterministic: true,
    writes: false,
  },
  {
    name: 'raise_quote_request',
    label: 'Request a quote',
    deterministic: true,
    writes: true,
  },
];

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
export async function buildPublicTools(
  ctx: EmbedKeyContext,
  onChunk?: (chunk: unknown) => void,
): Promise<Map<string, { invoke: (input: unknown) => Promise<unknown> }>> {
  const out = new Map<string, { invoke: (input: unknown) => Promise<unknown> }>();
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
  out.set('raise_quote_request', quoteMod.createRaiseQuoteRequestTool('', workspaceId, onChunk as never));

  return out;
}
