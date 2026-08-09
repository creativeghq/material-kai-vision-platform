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
import { authenticateEmbedKey, embedJson } from '../_shared/embed-key.ts';
import { embedCorsHeaders } from '../_shared/cors.ts';
import { imagesFromMetadata } from '../_shared/product-media.ts';
import { grossFromNet } from '../_shared/money.ts';

/** Page size ceiling — an embed grid is a shelf, not a catalog dump. */
const MAX_LIMIT = 60;

/** Ceiling on the id list used to pre-filter `only_3d` requests. See the comment at its use. */
const MAX_MODEL_ID_FILTER = 2000;

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

Deno.serve(withApiLogging('products-3d-api', async (req) => {
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
    try {
      const body = await req.json();
      if (body && typeof body === 'object') params = { ...params, ...body };
    } catch {
      return embedJson({ error: 'Invalid JSON body' }, 400, cors);
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
      if (modelledIds.length === 0) return embedJson({ ok: true, products: [] }, 200, cors);
    }

    let query = publishedQuery();
    if (modelledIds) query = query.in('product_id', modelledIds);
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
      },
    }, 200, cors);
  }

  return embedJson({ error: `Unknown action: ${action}` }, 400, cors);
}));
