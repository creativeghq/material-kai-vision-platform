/** Product in Place (#474): read a product off its own web page, then add it to the catalogue once confirmed. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { SSRFError } from '../_shared/ssrf-guard.ts';
import { fetchTextGuarded } from '../_shared/fetch-image.ts';
import { parseProductPage } from '../_shared/product-page.ts';

const str = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};
const pos = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

Deno.serve(withApiLogging('product-from-url', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body?.workspace_id ?? '');
  const auth = await authenticate(req, { requireUser: true });
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'Sign in first');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  if (!workspaceId || !await userCanAccessWorkspace(admin, userId, workspaceId)) throw new HttpError(404, 'Not found');

  if (body?.action === 'read') {
    const url = str(body.url, 2000);
    if (!url) throw new HttpError(400, 'Paste a product page link.');
    let page;
    try {
      page = await fetchTextGuarded(url, {
        maxBytes: 3 * 1024 * 1024, timeoutMs: 15_000, contentTypePrefix: 'text/html',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaterialsHub product reader)', Accept: 'text/html' },
      });
    } catch (err) {
      if (err instanceof SSRFError) throw new HttpError(400, `That link cannot be read: ${err.message}`);
      throw new HttpError(422, `The page could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
    const product = parseProductPage(page.text, page.finalUrl);
    if (product.source === 'none' || !product.name) {
      return json({ ok: true, found: false, reason: 'This page does not describe its product in a way we can read (no schema.org Product or Open Graph tags).' });
    }
    const { data: match } = await admin.rpc('match_external_product', {
      p_workspace_id: workspaceId, p_source: 'url', p_connection_id: null, p_external_product_id: null,
      p_external_variant_id: null, p_gtin: product.gtin, p_sku: product.sku, p_url: product.url,
    });
    const existingId = (Array.isArray(match) ? match[0]?.product_id : null) as string | null;
    return json({ ok: true, found: true, product, existing_product_id: existingId });
  }

  if (body?.action === 'create') {
    const name = str(body.name, 300);
    const url = str(body.url, 2000);
    if (!name || !url || !/^https:\/\//.test(url)) throw new HttpError(400, 'A name and the https page link are required.');
    const images = (Array.isArray(body.images) ? body.images : [])
      .map((u: unknown) => str(u, 2000)).filter((u: string | null): u is string => !!u && /^https:\/\//.test(u)).slice(0, 8);
    const sku = str(body.sku, 120);
    const gtin = str(body.gtin, 40);

    const { data: match, error: mErr } = await admin.rpc('match_external_product', {
      p_workspace_id: workspaceId, p_source: 'url', p_connection_id: null, p_external_product_id: null,
      p_external_variant_id: null, p_gtin: gtin, p_sku: sku, p_url: url,
    });
    if (mErr) throw new HttpError(500, 'Could not check for an existing product.');
    let productId = (Array.isArray(match) ? match[0]?.product_id : null) as string | null;
    const existed = !!productId;

    if (!productId) {
      const widthCm = pos(body.width_cm, 2000);
      const heightCm = pos(body.height_cm, 2000);
      const depthCm = pos(body.depth_cm, 2000);
      const attributes: Record<string, unknown> = {};
      if (widthCm) attributes.width = widthCm;
      if (heightCm) attributes.height = heightCm;
      if (depthCm) attributes.length = depthCm;
      if (widthCm || heightCm || depthCm) attributes.dimension_unit = 'cm';
      const { data: made, error: pErr } = await admin.from('products').insert({
        workspace_id: workspaceId,
        name,
        description: str(body.description, 5000),
        sku, external_sku: sku, barcode: gtin, mpn: str(body.mpn, 120),
        product_url: url,
        source_type: 'web_scraping',
        status: 'draft',
        created_by: userId,
        attributes,
        metadata: { images, source_page: url, brand: str(body.brand, 120) },
      }).select('id').single();
      if (pErr || !made) throw new HttpError(500, `Could not create the product: ${pErr?.message ?? 'unknown error'}`);
      productId = made.id as string;

      const gross = pos(body.price_gross, 10_000_000);
      if (gross !== null) {
        const { data: fin } = await admin.from('finance_settings').select('default_vat_rate').eq('workspace_id', workspaceId).maybeSingle();
        const vat = Number(fin?.default_vat_rate ?? 24);
        const { error: prErr } = await admin.from('product_prices').insert({
          workspace_id: workspaceId,
          product_id: productId,
          list_price: Math.round((gross / (1 + vat / 100)) * 10000) / 10000,
          currency: str(body.currency, 3)?.toUpperCase() ?? 'EUR',
          storefront_published: body.publish === true,
        });
        if (prErr) throw new HttpError(500, `The product was created but its price was not saved: ${prErr.message}`);
      }
    }

    const { error: rErr } = await admin.from('product_external_refs').insert({
      workspace_id: workspaceId, product_id: productId, source: 'url', external_url: url, sku, gtin,
    });
    if (rErr && rErr.code !== '23505') throw new HttpError(500, `Could not link the page: ${rErr.message}`);
    return json({ ok: true, product_id: productId, existed });
  }

  throw new HttpError(400, 'action must be read or create');
}));
