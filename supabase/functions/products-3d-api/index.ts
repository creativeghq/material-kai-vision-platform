// deno-lint-ignore-file no-explicit-any
/**
 * Public product + 3D model read API for the embed SDK (#321 M1, #258).
 *
 * Anonymous. The caller presents a PUBLISHABLE embed key; `authenticateEmbedKey` turns it into a
 * workspace and that workspace is the only one this request can ever see. Nothing here reads a
 * workspace, user or product owner from the request — the key is the tenancy binding
 * (CLAUDE.md invariant 1).
 *
 * WHY THIS FUNCTION EXISTS AT ALL. `products` has no anon SELECT policy (authenticated +
 * is_workspace_member), and it must stay that way: the catalog holds cost prices, supplier links
 * and unpublished drafts. Loosening that RLS to serve a widget would expose every column of every
 * product to the internet. So the public path is this narrow, service-role endpoint that returns
 * an explicit allowlist of fields for an explicit allowlist of rows.
 *
 * WHAT COUNTS AS PUBLIC. Exactly what the online storefront already treats as public:
 * `product_prices.storefront_published = true` in this workspace. Reusing that flag rather than
 * inventing an `embed_published` twin means a tenant has ONE answer to "is this product public",
 * and unpublishing works everywhere at once.
 *
 * Actions (GET query params or a POST JSON body):
 *   • list    → published products, with which 3D formats each has
 *   • product → one published product: media, gross price, and its glb/gltf/usdz models
 */
import { serviceClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import {
  authenticateEmbedKey, embedJson, intersectIdFilters, type EmbedKeyContext,
} from '../_shared/embed-key.ts';
import { embedCorsHeaders } from '../_shared/cors.ts';
import { imagesFromMetadata } from '../_shared/product-media.ts';
import { grossFromNet } from '../_shared/money.ts';

/** Page size ceiling — an embed grid is a shelf, not a catalog dump. */
const MAX_LIMIT = 60;

/** Ceiling on the id list used to pre-filter `only_3d` requests. See the comment at its use. */
const MAX_MODEL_ID_FILTER = 2000;

/** Ceiling on the id list resolved from a category scope. Same reasoning as above. */
const MAX_SCOPE_ID_FILTER = 5000;

/**
 * Embed events the ingest accepts. An allowlist, not free text: `event_type` is written by an
 * anonymous caller, and an open column becomes a place to store whatever anyone likes.
 */
const EMBED_EVENT_TYPES = ['embed_view', 'embed_model_load', 'embed_ar_launch', 'embed_add_to_cart'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ceiling on how many option ids one anonymous request may send. */
const MAX_OPTION_IDS = 40;

/**
 * Configurator options for one product, shaped for the embed (#258 Phase 2).
 *
 * `price_delta` is returned GROSS, like every other price on this surface. Returning the stored net
 * delta next to a VAT-inclusive price would make "+€40" and the total disagree, and the visitor
 * would be right.
 */
async function loadOptions(
  supabase: ReturnType<typeof serviceClient>,
  workspaceId: string,
  productId: string,
  vatRate: number,
) {
  const { data: groups } = await supabase
    .from('product_option_groups')
    .select('id, key, label, target_material_name, sort_order, is_required')
    .eq('workspace_id', workspaceId)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (!groups || groups.length === 0) return [];

  const { data: values } = await supabase
    .from('product_option_values')
    .select('id, group_id, label, price_delta, base_color_hex, roughness, metalness, sort_order, is_default')
    .in('group_id', groups.map((g: any) => g.id))
    .order('sort_order', { ascending: true });

  return groups.map((g: any) => ({
    id: g.id,
    key: g.key,
    label: g.label,
    target_material_name: g.target_material_name,
    is_required: g.is_required,
    values: (values ?? [])
      .filter((v: any) => v.group_id === g.id)
      .map((v: any) => ({
        id: v.id,
        label: v.label,
        price_delta: grossFromNet(v.price_delta, vatRate),
        base_color_hex: v.base_color_hex,
        roughness: v.roughness,
        metalness: v.metalness,
        is_default: v.is_default,
      })),
  }));
}

/**
 * The product ids this KEY may read, or null when the key is unrestricted.
 *
 * Server-side and non-negotiable: the scope lives on the key row, never in a request parameter,
 * because the key is publishable and anything the request can assert an attacker can assert too.
 */
async function scopeRestriction(
  supabase: ReturnType<typeof serviceClient>,
  ctx: EmbedKeyContext,
): Promise<string[] | null> {
  if (ctx.scopeType === 'all') return null;
  if (ctx.scopeValues.length === 0) return [];       // scoped to nothing — serve nothing
  if (ctx.scopeType === 'products') return ctx.scopeValues;

  // categories → resolve to product ids. The workspace filter is applied here as well as on the
  // main query: `material_categories` is a GLOBAL taxonomy, so a category id alone says nothing
  // about tenancy and must never be the only thing narrowing the rows.
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .in('category_id', ctx.scopeValues)
    .limit(MAX_SCOPE_ID_FILTER);
  return (data ?? []).map((p: any) => p.id as string);
}

/**
 * Is ONE product inside the key's scope? Asked exactly, not against the capped list above.
 *
 * The list path can tolerate `MAX_SCOPE_ID_FILTER` truncating a very large category scope — it
 * costs a few rows off the end of a shelf. The single-product path cannot: a truncated list would
 * 404 a product the key is genuinely entitled to, and that is what a deep link from the partner's
 * site hits. So the category case re-asks the question about this one id, which is an indexed
 * lookup with no ceiling.
 */
async function isProductInScope(
  supabase: ReturnType<typeof serviceClient>,
  ctx: EmbedKeyContext,
  productId: string,
): Promise<boolean> {
  if (ctx.scopeType === 'all') return true;
  if (ctx.scopeValues.length === 0) return false;
  if (ctx.scopeType === 'products') return ctx.scopeValues.includes(productId);

  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', productId)
    .in('category_id', ctx.scopeValues)
    .maybeSingle();
  return !!data;
}

interface ModelRow {
  format: string;
  storage_bucket: string;
  storage_path: string;
  file_size_bytes: number | null;
  width_m: number | null;
  height_m: number | null;
  depth_m: number | null;
}

/**
 * Public URL for a model file.
 *
 * `generation-images` is a public-read bucket, so this is a durable URL rather than a signed one —
 * and that is the reason models live there. A signed URL would expire inside the customer's cached
 * page and the widget would break days after it rendered fine (CLAUDE.md pipeline convention 7 is
 * the same rule read from the other side: never PERSIST a signed URL; minting one per read is fine,
 * but a public bucket needs neither).
 */
function modelUrl(supabaseUrl: string, row: ModelRow): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${row.storage_bucket}/${row.storage_path}`;
}

function serializeModels(supabaseUrl: string, rows: ModelRow[]) {
  return rows.map((m) => ({
    format: m.format,
    url: modelUrl(supabaseUrl, m),
    file_size_bytes: m.file_size_bytes ?? null,
    // Real-world dimensions drive true-to-scale AR and the room planner. Null means "unknown" —
    // the viewer then frames the model to a nominal size rather than pretending to a scale.
    width_m: m.width_m ?? null,
    height_m: m.height_m ?? null,
    depth_m: m.depth_m ?? null,
  }));
}

/**
 * Logged per ACTION, not as one flat name.
 *
 * This endpoint is a dispatcher, and `ops.silent_zero` flags an endpoint whose success rate is
 * under 5%. Logged flat, an action failing on 100% of its calls hides behind the two that work:
 * the `event` ingest 400'd on every request and the function's overall rate stayed healthy. That
 * is the dilution `monitoring-cron` demonstrated — 261 real 5xx sitting at ~74% of calls while a
 * feature was dead for three months.
 */
Deno.serve(withApiLogging((req) => {
  try {
    return `products-3d-api?action=${new URL(req.url).searchParams.get('action') ?? 'list'}`;
  } catch {
    return 'products-3d-api';
  }
}, async (req) => {
  // Both read the environment INSIDE the handler — the secrets bootstrap populates Deno.env at
  // handler entry, so a module-load capture would read undefined (CLAUDE.md secrets rule).
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = serviceClient();

  // ── Preflight ────────────────────────────────────────────────────────────────────────────────
  // A browser sends OPTIONS with NO custom headers, so `x-embed-key` is not readable here — the
  // preflight cannot know which key is coming. It is answered from `?key=` when the caller put it
  // there, and otherwise permissively.
  //
  // Answering permissively is safe, and refusing here would be a bug rather than a control. The
  // preflight only decides whether the browser may SEND the real request; the real request is
  // where the key is checked and where the response either carries this origin's CORS headers or
  // carries none at all. A disallowed origin therefore still cannot read a single byte — it just
  // learns that fact one round trip later. Refusing every keyless preflight, by contrast, would
  // break the documented header-based flow completely, because that flow's preflight is ALWAYS
  // keyless.
  if (req.method === 'OPTIONS') {
    const key = new URL(req.url).searchParams.get('key');
    if (!key) {
      const origin = req.headers.get('Origin');
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-embed-key',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }
    // Key named in the query string — we can resolve the real allowlist, so refuse a disallowed
    // origin now instead of letting it discover the same answer on the next request.
    const { data } = await supabase
      .from('material_kai_keys')
      .select('allowed_origins')
      .eq('api_key', key)
      .eq('is_active', true)
      .maybeSingle();
    const cors = embedCorsHeaders(req, (data?.allowed_origins as string[] | null) ?? null);
    return new Response(null, { status: cors ? 200 : 403, headers: cors ?? { 'Vary': 'Origin' } });
  }

  const auth = await authenticateEmbedKey(supabase, req);
  if (!auth.ok) return auth.response;
  const { workspaceId, cors } = auth.ctx;

  // Params from the query string (GET) or the JSON body (POST) — the web component uses GET so
  // responses stay cacheable; POST is there for callers that prefer it.
  const url = new URL(req.url);
  let params: Record<string, any> = Object.fromEntries(url.searchParams.entries());
  if (req.method === 'POST') {
    // A BODYLESS POST is legitimate and must not be an error: the analytics beacon sends
    // `fetch(url, {method:'POST', keepalive:true})` with everything in the query string, and
    // `req.json()` throws on an empty body. Treating that as malformed 400'd every single event
    // — and the beacon swallows its own errors by design, so the metric would have sat at zero
    // forever with nothing anywhere complaining. Only a body that is PRESENT and unparseable is
    // a client error.
    const raw = await req.text();
    if (raw.trim()) {
      try {
        const body = JSON.parse(raw);
        if (body && typeof body === 'object') params = { ...params, ...body };
      } catch {
        return embedJson({ error: 'Invalid JSON body' }, 400, cors);
      }
    }
  }

  const action = String(params.action ?? 'list');

  // The published set, always scoped to the key's workspace. `storefront_published` lives on
  // product_prices, so this join IS the publication gate — a product with no published price row
  // is not reachable through this endpoint at all.
  const publishedQuery = () => supabase
    .from('product_prices')
    .select('product_id, list_price, currency, unit, product:products(id, name, description, metadata, item_type)')
    .eq('workspace_id', workspaceId)
    .eq('storefront_published', true)
    .not('list_price', 'is', null);

  const { data: vatRow } = await supabase
    .from('finance_settings')
    .select('default_vat_rate')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const vatRate = Number(vatRow?.default_vat_rate ?? 24);

  if (action === 'list') {
    const limit = Math.min(Math.max(Number(params.limit) || 24, 1), MAX_LIMIT);
    const offset = Math.max(Number(params.offset) || 0, 0);
    // `only_3d=true` powers a shelf of just the models — the common embed case.
    const only3d = String(params.only_3d ?? '') === 'true';

    // The 3D filter is applied IN the query, not to the page after it.
    //
    // Filtering afterwards silently returns short pages: ask for 24 and get however many of those
    // 24 happened to have a model, with no way for the caller to tell "that's all there is" from
    // "that page was thin". Resolving the model-bearing ids first makes `range()` mean what it
    // says. The id list is small in practice — models are hand-uploaded per product (M0) — and
    // capped so a very large catalog degrades into a long URL rather than a failed request.
    let modelledIds: string[] | null = null;
    if (only3d) {
      const { data: modelled } = await supabase
        .from('product_3d_models')
        .select('product_id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'ready')
        .limit(MAX_MODEL_ID_FILTER);
      modelledIds = [...new Set((modelled ?? []).map((m: any) => m.product_id as string))];
    }

    // The key's scope and the caller's only_3d are both id restrictions; `null` from either means
    // "did not restrict". Intersecting them keeps the scope authoritative — a caller cannot widen
    // past it, only narrow further.
    const restrictIds = intersectIdFilters(await scopeRestriction(supabase, auth.ctx), modelledIds);
    if (restrictIds !== null && restrictIds.length === 0) {
      return embedJson({ ok: true, products: [] }, 200, cors);
    }

    let query = publishedQuery();
    if (restrictIds) query = query.in('product_id', restrictIds);
    // Stable order, or `range()` paginates over an undefined sequence and pages can repeat or drop
    // rows between calls.
    const { data: rows, error } = await query
      .order('product_id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) return embedJson({ error: 'Could not load products' }, 500, cors);

    const priced = (rows ?? []).filter((r: any) => r.product);
    const ids = priced.map((r: any) => r.product_id);

    // Which of these have a ready model, in one query rather than N.
    const formatsByProduct = new Map<string, string[]>();
    if (ids.length) {
      const { data: models } = await supabase
        .from('product_3d_models')
        .select('product_id, format')
        .eq('workspace_id', workspaceId)
        .eq('status', 'ready')
        .in('product_id', ids);
      for (const m of models ?? []) {
        const list = formatsByProduct.get((m as any).product_id) ?? [];
        list.push((m as any).format);
        formatsByProduct.set((m as any).product_id, list);
      }
    }

    // No post-filter on only_3d — the query above already restricted the rows, so a page is a
    // full page.
    const products = priced.map((r: any) => ({
      product_id: r.product_id,
      name: r.product.name,
      description: r.product.description ?? null,
      unit: r.unit ?? null,
      item_type: r.product.item_type ?? 'good',
      price: grossFromNet(r.list_price, vatRate),
      currency: r.currency ?? 'EUR',
      images: imagesFromMetadata(r.product.metadata),
      model_formats: formatsByProduct.get(r.product_id) ?? [],
    }));

    return embedJson({ ok: true, products }, 200, cors);
  }

  if (action === 'product') {
    const productId = String(params.product_id ?? '').trim();
    if (!productId) return embedJson({ error: 'product_id is required' }, 400, cors);

    // Scope is enforced HERE too, not only on `list`. Checking it only on the listing would make
    // it decorative: a scoped key could still read any published product by naming its id, which
    // is the whole thing the scope exists to prevent. Same 404 as another tenant's product, so an
    // out-of-scope id and a non-existent one stay indistinguishable.
    if (!(await isProductInScope(supabase, auth.ctx, productId))) {
      return embedJson({ error: 'Product not found' }, 404, cors);
    }

    const { data: row } = await publishedQuery().eq('product_id', productId).maybeSingle();
    // 404 rather than 403 when the product belongs to another tenant or is unpublished — the two
    // must be indistinguishable, or the endpoint becomes a product-id oracle (invariant 1).
    if (!row || !(row as any).product) return embedJson({ error: 'Product not found' }, 404, cors);

    const { data: models } = await supabase
      .from('product_3d_models')
      .select('format, storage_bucket, storage_path, file_size_bytes, width_m, height_m, depth_m')
      .eq('workspace_id', workspaceId)
      .eq('product_id', productId)
      .eq('status', 'ready');

    // Configurator options (#258 Phase 2). Sent with the product so the widget can render the
    // picker on first paint rather than after a second round trip — the swatches ARE the product
    // on a configurable item, and revealing them late reads as a broken page.
    const options = await loadOptions(supabase, workspaceId, productId, vatRate);

    const product = (row as any).product;
    return embedJson({
      ok: true,
      product: {
        product_id: (row as any).product_id,
        name: product.name,
        description: product.description ?? null,
        unit: (row as any).unit ?? null,
        item_type: product.item_type ?? 'good',
        price: grossFromNet((row as any).list_price, vatRate),
        currency: (row as any).currency ?? 'EUR',
        images: imagesFromMetadata(product.metadata),
        models: serializeModels(supabaseUrl, (models ?? []) as ModelRow[]),
        options,
      },
    }, 200, cors);
  }

  if (action === 'configure') {
    // Price a set of choices for an anonymous visitor.
    //
    // The derivation is SECURITY DEFINER and NOT granted to `anon` — the embed reaches it through
    // this function's service-role client, after the key has been checked. That is the whole shape
    // of the embed surface: anonymous callers never touch a privileged routine directly.
    const productId = String(params.product_id ?? '').trim();
    if (!productId) return embedJson({ error: 'product_id is required' }, 400, cors);
    if (!(await isProductInScope(supabase, auth.ctx, productId))) {
      return embedJson({ error: 'Product not found' }, 404, cors);
    }
    const { data: published } = await publishedQuery().eq('product_id', productId).maybeSingle();
    if (!published) return embedJson({ error: 'Product not found' }, 404, cors);

    const raw = params.option_value_ids;
    const optionIds = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
      .map((v: unknown) => String(v).trim())
      .filter((v: string) => UUID_RE.test(v))
      .slice(0, MAX_OPTION_IDS);

    const { data: priced, error: priceErr } = await supabase.rpc('get_configured_product_price', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_option_value_ids: optionIds,
      // No company/contact and the BUYER audience: an anonymous visitor gets the public price, never
      // a negotiated one. Passing the seller audience here would leak cost and margin.
      p_audience: 'buyer',
    });
    if (priceErr) return embedJson({ error: 'Could not price this configuration' }, 500, cors);

    const p = priced as Record<string, unknown>;
    const net = p?.configured_price as number | null;
    return embedJson({
      ok: true,
      // Gross, matching the `price` every other action returns — a configurator that quotes ex-VAT
      // next to a VAT-inclusive list price is a support ticket.
      configured_price: net == null ? null : grossFromNet(net, vatRate),
      currency: (p?.currency as string) ?? 'EUR',
      options_applied: p?.options_applied ?? 0,
      options_requested: p?.options_requested ?? 0,
    }, 200, cors);
  }

  if (action === 'event') {
    // The ONLY write this anonymous surface has. Three things make that safe, and all three are
    // server-side because the caller is untrusted by construction:
    //   • workspace_id comes from the key, never the body (invariant 1)
    //   • the product must be published AND in this key's scope — otherwise anyone holding a key
    //     could write events against arbitrary product ids and pollute another tenant's dashboard
    //   • event_type is an allowlist, and metadata is size-capped
    // The per-key quota was already consumed by authenticateEmbedKey, so event spam costs the
    // spammer their own rate limit.
    const productId = String(params.product_id ?? '').trim();
    const eventType = String(params.event_type ?? '').trim();
    if (!productId || !eventType) {
      return embedJson({ error: 'product_id and event_type are required' }, 400, cors);
    }
    if (!EMBED_EVENT_TYPES.includes(eventType)) {
      return embedJson({ error: `Unsupported event_type: ${eventType}` }, 400, cors);
    }
    if (!(await isProductInScope(supabase, auth.ctx, productId))) {
      return embedJson({ error: 'Product not found' }, 404, cors);
    }
    const { data: published } = await publishedQuery().eq('product_id', productId).maybeSingle();
    if (!published) return embedJson({ error: 'Product not found' }, 404, cors);

    // session_id is NOT NULL and a uuid. A caller-supplied value that isn't one would fail the
    // insert, so anything unparseable is replaced rather than rejected — an analytics event is
    // never worth failing the visitor's page over.
    const sessionId = UUID_RE.test(String(params.session_id ?? ''))
      ? String(params.session_id)
      : crypto.randomUUID();

    const { error: insErr } = await supabase.from('manufacturer_analytics_events').insert({
      event_type: eventType,
      product_id: productId,
      workspace_id: workspaceId,
      session_id: sessionId,
      // Where the widget is embedded. Truncated — it is attacker-controlled free text.
      source_page: typeof params.source_page === 'string' ? params.source_page.slice(0, 500) : null,
      metadata: {
        embed_key_id: auth.ctx.keyId,
        origin: req.headers.get('Origin') ?? null,
      },
    });
    // Report the failure but never 500 the widget over telemetry.
    if (insErr) console.error('[products-3d-api] event insert failed', insErr.message);
    return embedJson({ ok: true }, 200, cors);
  }

  return embedJson({ error: `Unknown action: ${action}` }, 400, cors);
}));
