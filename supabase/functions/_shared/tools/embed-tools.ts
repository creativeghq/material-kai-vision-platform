/**
 * Website-embed tools — the agent's view of the SDK a merchant can put on their own site.
 *
 * WHY THIS FILE EXISTS. Every other half of the embed program had an agent path already: the
 * `design-to-quote` skill walks a customer through the same four stages the widget does,
 * `price_my_spec` calls the same `resolve_product_spec` RPC, `raise_quote_request` writes the same
 * `quote_requests` row. What no tool knew was that the WIDGET EXISTS. An agent could take a
 * customer all the way to a quote and had no way to tell the merchant that the identical walk was
 * available on their own website — so the feature was discoverable only by reading the API
 * documentation page, which is a fair description of a feature that is switched off.
 *
 * TWO TOOLS, ONE ANSWER EACH:
 *   • `embed_readiness`  — can this product be carried by the embed, and if so, the snippet
 *   • `embed_overview`   — is the embed live for this workspace at all, and what does it cost
 *
 * NOTHING HERE DECIDES ANYTHING. Readiness comes from `get_product_embed_readiness` and coverage
 * from the `covering_key_ids` it returns — both derived by the SAME SQL that `products-3d-api`
 * gates on (`embed_scope_covers_product`). A second opinion here would let the agent promise a
 * merchant a product the endpoint then 404s, which is precisely the drift the readiness panel was
 * built to avoid. These tools read the answer and turn it into sentences.
 *
 * THE KEY IS PUBLISHABLE, WHICH IS WHY THE SNIPPET MAY BE SPOKEN. `mk_embed_…` values are designed
 * to sit in a merchant's page source; the controls that protect them are the origin allowlist, the
 * per-minute quota and the fact that only storefront-published rows are served. Returning one into
 * a chat the workspace's own member is holding reveals nothing that viewing the page source would
 * not. `workspaceId` is the session's, never the model's (invariant 1), so the agent cannot ask
 * about a tenant it is not in.
 *
 * Cost discipline: both tools are 0 credits — DB reads only.
 */

// Typed non-generically for the same reason as graph-tools.ts: inferring `tool` pulls
// @langchain/core's generic graph into the module and blows the edge typecheck's memory ceiling.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');

import { serviceClient as svcClient } from '../supabase-client.ts';

/**
 * Where the bundle is served from.
 *
 * The app's own origin, not the Supabase project URL — the script tag and the API live in
 * different places, and handing a merchant the wrong one produces a 404 that looks like the widget
 * is broken. Env-resolved rather than hardcoded so a preview deployment does not hand out
 * production URLs; the fallback is the production origin because a snippet that is right for
 * almost every caller beats no snippet at all.
 */
function appOrigin(): string {
  return (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');
}

function productSnippet(origin: string, apiKey: string, productId: string): string {
  return [
    `<script src="${origin}/embed/materialkai-product.js" defer></script>`,
    `<materialkai-product api-key="${apiKey}" product-id="${productId}"></materialkai-product>`,
  ].join('\n');
}

/**
 * The builder tag, which the app itself did not offer until now.
 *
 * Same script, no product id: the builder starts from a question rather than a product, and its
 * whole point is capturing the specs the catalogue CANNOT satisfy. On a catalogue this thin that
 * is most of them, which makes this the more valuable of the two snippets for a merchant just
 * starting out — and it was the one nothing in the platform ever mentioned.
 */
function builderSnippet(origin: string, apiKey: string): string {
  return [
    `<script src="${origin}/embed/materialkai-product.js" defer></script>`,
    `<materialkai-builder api-key="${apiKey}"></materialkai-builder>`,
  ].join('\n');
}

/** Resolve a product by id or by name, workspace-scoped. Never trusts an id the model invented. */
async function resolveProduct(
  sb: any,
  workspaceId: string,
  productId?: string,
  productName?: string,
): Promise<{ id: string; name: string } | null> {
  if (productId) {
    const { data } = await sb.from('products')
      .select('id, name').eq('id', productId).eq('workspace_id', workspaceId).maybeSingle();
    return data ? { id: data.id, name: data.name } : null;
  }
  if (productName?.trim()) {
    const { data } = await sb.from('products')
      .select('id, name').eq('workspace_id', workspaceId)
      .ilike('name', `%${productName.trim()}%`).limit(1);
    return data && data[0] ? { id: data[0].id, name: data[0].name } : null;
  }
  return null;
}

// ── 1) embed_readiness ────────────────────────────────────────────────────────

export const createEmbedReadinessTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, product_name }: { product_id?: string; product_name?: string }) => {
      const sb = svcClient();
      if (!workspaceId) return JSON.stringify({ success: false, error: 'No active workspace.' });

      const product = await resolveProduct(sb, workspaceId, product_id, product_name);
      if (!product) {
        return JSON.stringify({
          success: false,
          error: product_id || product_name
            ? 'No product in this workspace matches that.'
            : 'Name a product — product_name or product_id.',
        });
      }

      const { data, error } = await sb.rpc('get_product_embed_readiness', {
        p_product_ids: [product.id],
      });
      if (error) return JSON.stringify({ success: false, error: error.message });
      const r = (Array.isArray(data) ? data[0] : null) as Record<string, any> | null;
      if (!r) return JSON.stringify({ success: false, error: 'Could not read readiness for that product.' });

      // The snippet only exists when a key actually covers the product. `covering_key_ids` came
      // from `embed_scope_covers_product` — the same rule the endpoint enforces — so a snippet
      // handed out here cannot be one the endpoint would then refuse.
      let snippet: string | null = null;
      const coveringKeys: string[] = r.covering_key_ids ?? [];
      if (coveringKeys.length > 0) {
        // The workspace filter is redundant — `covering_key_ids` was derived for a product this
        // session's workspace owns, so every id in it belongs here — and it stays anyway. This is
        // the SERVICE-ROLE client, which means RLS is not standing behind the query; a filter that
        // is currently implied by an upstream derivation is exactly the one that stops being
        // implied when that derivation changes, and the failure would be handing one tenant's key
        // to another (CLAUDE.md invariant 1: service-role makes the manual check mandatory).
        const { data: keyRow } = await sb.from('material_kai_keys')
          .select('api_key')
          .in('id', coveringKeys)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .limit(1).maybeSingle();
        if (keyRow?.api_key) snippet = productSnippet(appOrigin(), keyRow.api_key, product.id);
      }

      // What is MISSING and what each absence costs. Stated as consequences rather than as a
      // score, because every one of them is optional except the price — a product with none of
      // them still reaches customers as a quote request.
      const missing: Array<{ what: string; consequence: string; hard_gate?: boolean }> = [];
      if (!r.has_published_price) {
        missing.push({
          what: 'a published price',
          consequence: 'The embed cannot return this product at all. This is the only hard gate.',
          hard_gate: true,
        });
      }
      if (!r.has_attributes) {
        missing.push({
          what: 'attributes',
          consequence: 'The spec builder matches on attributes. With none, every visitor spec falls through to a quote request instead of a price.',
        });
      }
      if (!r.has_model) {
        missing.push({
          what: 'a 3D model (.glb)',
          consequence: 'The widget falls back to the product photo — no 3D, no AR, no configurator.',
        });
      }
      if ((r.option_group_count ?? 0) === 0) {
        missing.push({
          what: 'configurable options',
          consequence: 'Options are what make the embed a configurator rather than a picture.',
        });
      }
      if (coveringKeys.length === 0) {
        missing.push({
          what: 'an embed key covering this product',
          consequence: 'Without one the product is only visible inside the platform. Create one at Profile → Keys.',
        });
      }

      onChunk?.({
        type: 'embed_readiness_result',
        workspace_id: workspaceId,
        product_id: product.id,
        product_name: product.name,
        embeddable: !!r.has_published_price && coveringKeys.length > 0,
        missing,
        snippet,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        product: { id: product.id, name: product.name },
        embeddable: !!r.has_published_price && coveringKeys.length > 0,
        has_published_price: !!r.has_published_price,
        has_3d_model: !!r.has_model,
        model_formats: r.model_formats ?? [],
        attribute_count: r.attribute_count ?? 0,
        option_group_count: r.option_group_count ?? 0,
        covering_key_count: coveringKeys.length,
        missing,
        snippet,
        guidance: snippet
          ? 'This product can go on the merchant\'s own website today. Give them the snippet verbatim and tell them which website origins the key allows — a key only works on the sites on its allowlist.'
          : 'Not embeddable yet. Say what is missing and what each absence costs; do NOT invent a snippet — a key that does not cover the product returns 404 to the visitor.',
      });
    },
    {
      name: 'embed_readiness',
      description:
        'Check whether a product can be shown on the merchant\'s OWN website through the embed SDK, and return the '
        + 'ready-to-paste snippet when it can. Use when someone asks "can I put this on my site", "how do I show this '
        + 'on my website", "is this ready to sell online", or after helping them set a product up. Returns what is '
        + 'still missing and what each absence costs.',
      schema: z.object({
        product_id: z.string().optional().describe('The product id, when you already have one.'),
        product_name: z.string().optional().describe('Product name to look up instead, e.g. "Fenwick lounge chair".'),
      }),
    },
  );
};

// ── 2) embed_overview ─────────────────────────────────────────────────────────

export const createEmbedOverviewTool = (
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ days }: { days?: number }) => {
      const sb = svcClient();
      if (!workspaceId) return JSON.stringify({ success: false, error: 'No active workspace.' });
      const window = Math.min(Math.max(Number(days) || 30, 1), 365);

      const { data: keys, error: kErr } = await sb.from('material_kai_keys')
        .select('id, key_name, api_key, allowed_origins, scope_type, scope_values, is_active, allow_generation, generation_daily_cap, usage_count')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
      if (kErr) return JSON.stringify({ success: false, error: kErr.message });

      const { data: summary } = await sb.rpc('get_embed_analytics_summary', {
        p_workspace_id: workspaceId,
        p_days: window,
      });
      const s = (summary ?? {}) as Record<string, any>;

      // How much of the catalogue could actually be carried. `storefront_published` is the same
      // publication gate the endpoint applies, so this is the real ceiling, not an estimate.
      const { count: publishedCount } = await sb.from('product_prices')
        .select('product_id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('storefront_published', true)
        .not('list_price', 'is', null);

      const active = (keys ?? []).filter((k: any) => k.is_active);
      const firstActive = active[0];
      const origin = appOrigin();

      onChunk?.({
        type: 'embed_overview_result',
        workspace_id: workspaceId,
        key_count: (keys ?? []).length,
        active_key_count: active.length,
        published_products: publishedCount ?? 0,
        events: s.total ?? 0,
        generation: s.generation ?? null,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        days: window,
        keys: (keys ?? []).map((k: any) => ({
          name: k.key_name,
          active: k.is_active,
          // The allowlist is the control that matters on a publishable key, so it is reported
          // rather than summarised — "any website" is a very different answer from a domain list.
          allowed_origins: k.allowed_origins ?? [],
          scope: k.scope_type === 'all' ? 'everything published' : `${(k.scope_values ?? []).length} ${k.scope_type}`,
          requests: k.usage_count ?? 0,
          ai_impressions_enabled: !!k.allow_generation,
          ai_impressions_daily_cap: k.allow_generation ? (k.generation_daily_cap ?? 20) : null,
        })),
        published_products: publishedCount ?? 0,
        activity: { total_events: s.total ?? 0, by_event: s.by_event ?? {}, where_it_runs: s.top_pages ?? [] },
        // What the widget SPENT. Only `visualize` costs anything; the rest of the surface is free
        // catalogue reads, and saying so stops "the embed costs money" becoming folklore.
        cost: s.generation ?? { count: 0, credits: 0, billed_usd: 0 },
        snippets: firstActive
          ? {
            product: productSnippet(origin, firstActive.api_key, 'PRODUCT_ID'),
            builder: builderSnippet(origin, firstActive.api_key),
          }
          : null,
        guidance: !keys || keys.length === 0
          ? 'This workspace has no embed key, so nothing can be shown on an outside website yet. Point them at Profile → Keys to create one — it takes one field and a list of their own domains.'
          : (s.total ?? 0) === 0
            ? 'Keys exist but nothing has ever loaded the widget, so it is probably not on any page yet. Offer the snippets: <materialkai-product> shows one product in 3D, <materialkai-builder> walks a visitor through a specification and captures a quote request when the catalogue cannot match it. Replace PRODUCT_ID with a real product — embed_readiness gives a product-specific snippet.'
            : 'The embed is live. Use the activity figures to answer what it is doing, and `cost` to answer what it costs — only AI impressions cost credits; catalogue reads are free.',
      });
    },
    {
      name: 'embed_overview',
      description:
        'Is the website embed live for this workspace, what is it doing, and what does it cost? Returns the keys and '
        + 'the websites each allows, how many products are publishable, recent widget activity, credits spent on AI '
        + 'impressions, and the paste-ready snippets for both the product widget and the spec builder. Use for "is my '
        + 'embed working", "how do I put this on my website", "what is the widget costing me", or when a merchant '
        + 'should be told the SDK exists.',
      schema: z.object({
        days: z.number().optional().describe('Activity window in days (default 30, max 365).'),
      }),
    },
  );
};
