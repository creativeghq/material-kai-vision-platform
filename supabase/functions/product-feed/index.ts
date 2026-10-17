import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { grossFromNet } from '../_shared/money.ts';
import { associatedImagesByProduct, productImages } from '../_shared/product-media.ts';
import {
  PUBLIC_PRODUCT_STATUS, loadDefaultVatRate, productVatPct, variantAttrsFromKey,
} from '../_shared/commerce/public-catalogue.ts';
import {
  renderGoogleFeed, renderSkroutzFeed, renderBestPriceFeed, gapSummary, stockState, escapeXml,
  type FeedProduct,
} from '../_shared/commerce/feed-render.ts';

const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

const PAGE_SIZE = 1000;

function xml(body: string, gzip: boolean): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=900',
  };
  if (!gzip) return new Response(body, { status: 200, headers });
  const stream = new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream, { status: 200, headers: { ...headers, 'Content-Encoding': 'gzip' } });
}

Deno.serve(withApiLogging('product-feed', async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!token) throw new HttpError(400, 'token is required');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: feed } = await supabase
    .from('product_feeds')
    .select('id, workspace_id, name, format, selection, currency, only_storefront_published, include_out_of_stock, enabled')
    .eq('public_token', token)
    .maybeSingle();
  if (!feed || !feed.enabled) {
    return new Response(`<?xml version="1.0"?><error>${escapeXml('feed not found or disabled')}</error>`,
      { status: 404, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }

  // Every productURL in every dialect points at /store/:slug, so a closed storefront makes the
  // whole feed a list of dead offers — 200 OK, N products, every link "This store is not open."
  const { data: store } = await supabase.from('workspace_storefront')
    .select('enabled').eq('workspace_id', feed.workspace_id).maybeSingle();
  if (!store?.enabled) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${escapeXml('the storefront this feed links to is closed')}</error>`,
      { status: 409, headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
    );
  }

  const { data: ws } = await supabase.from('workspaces').select('slug, name').eq('id', feed.workspace_id).maybeSingle();
  const fallbackVat = await loadDefaultVatRate(supabase, feed.workspace_id);

  const sel = (feed.selection ?? {}) as { mode?: string; ids?: string[] };
  const wanted = [...new Set((sel.ids ?? []).map(String).filter(Boolean))];
  const narrowed = sel.mode === 'products' || sel.mode === 'category';

  // Selection, status and publication are all in the query; a JS filter after a page cap would
  // silently drop whatever sat past the cap.
  const scoped = () => {
    let q = supabase.from('product_prices')
      .select('id, product_id, variant_key, list_price, currency, product:products!inner(id, name, description, sku, '
        + 'external_sku, barcode, metadata, category_id, brand_company_id, mydata_vat_category, net_mass_kg, mpn, status)')
      .eq('workspace_id', feed.workspace_id)
      .eq('product.status', PUBLIC_PRODUCT_STATUS);
    if (feed.only_storefront_published) q = q.eq('storefront_published', true);
    if (sel.mode === 'products') q = q.in('product_id', wanted);
    if (sel.mode === 'category') q = q.in('product.category_id', wanted);
    return q;
  };

  const rows: Record<string, any>[] = [];
  let unpriced = 0;
  if (!narrowed || wanted.length > 0) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await scoped().order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw new HttpError(500, `product feed price read failed: ${error.message}`, error);
      const page = (data ?? []) as Record<string, any>[];
      for (const r of page) {
        if (!r.product) continue;
        // A missing price is WITHHELD and counted, never published as 0.
        if (r.list_price == null) unpriced += 1;
        else rows.push(r);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }

  const categoryIds = [...new Set(rows.map((r: Record<string, any>) => r.product?.category_id).filter(Boolean))];
  const brandIds = [...new Set(rows.map((r: Record<string, any>) => r.product?.brand_company_id).filter(Boolean))];
  const [cats, brands] = await Promise.all([
    categoryIds.length
      ? supabase.from('material_categories').select('id, name').in('id', categoryIds)
      : Promise.resolve({ data: [] as any[] }),
    brandIds.length
      ? supabase.from('crm_companies').select('id, name').in('id', brandIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const catName = new Map((cats.data ?? []).map((c: any) => [c.id, c.name]));
  const brandName = new Map((brands.data ?? []).map((b: any) => [b.id, b.name]));

  const productIds = rows.map((r: Record<string, any>) => r.product?.id).filter(Boolean);
  const images = await associatedImagesByProduct(supabase, productIds);
  const variantLabels = new Map<string, string>();
  const variantRows = rows.filter((r) => r.variant_key != null);
  for (let i = 0; i < variantRows.length; i += 500) {
    const { data } = await supabase.rpc('get_variant_labels', {
      p_rows: variantRows.slice(i, i + 500).map((r) => ({
        key: r.id, product_id: r.product_id, attributes: variantAttrsFromKey(String(r.variant_key)),
      })),
    });
    for (const l of (data ?? []) as Array<{ row_key: string; label: string | null }>) {
      if (l.label) variantLabels.set(l.row_key, l.label);
    }
  }
  const onHand = new Map<string, number>();
  const known = new Set<string>();
  const distinctIds = [...new Set(productIds.map(String))];
  for (let i = 0; i < distinctIds.length; i += 200) {
    const { data: stock, error: stockErr } = await supabase.from('warehouse_items')
      .select('product_id, qty_on_hand, qty_reserved, is_active')
      .eq('workspace_id', feed.workspace_id)
      .in('product_id', distinctIds.slice(i, i + 200));
    if (stockErr) throw new HttpError(500, `product feed stock read failed: ${stockErr.message}`, stockErr);
    for (const w of stock ?? []) {
      const row = w as Record<string, any>;
      if (row.is_active === false) continue;
      const pid = String(row.product_id);
      known.add(pid);
      const free = Number(row.qty_on_hand ?? 0) - Number(row.qty_reserved ?? 0);
      onHand.set(pid, (onHand.get(pid) ?? 0) + (Number.isFinite(free) ? free : 0));
    }
  }

  const storeUrl = `${publicAppUrl().replace(/\/$/, '')}/store/${ws?.slug ?? ''}`;

  const products: FeedProduct[] = rows.map((r: Record<string, any>) => {
    const p = r.product;
    const variantKey: string | null = r.variant_key ?? null;
    const pct = productVatPct(p.mydata_vat_category, fallbackVat);
    const net = Number(r.list_price);
    const link = `${storeUrl}?product=${encodeURIComponent(p.id)}`
      + (variantKey ? `&variant=${encodeURIComponent(variantKey)}` : '');
    return {
      id: variantKey ? String(r.id) : String(p.id),
      sku: p.external_sku ?? p.sku ?? null,
      name: String(p.name ?? '') + (variantLabels.has(r.id) ? ` — ${variantLabels.get(r.id)}` : ''),
      description: p.description ?? null,
      link,
      image: productImages(images.get(String(p.id)), p.metadata, variantKey)[0] ?? null,
      category: catName.get(p.category_id) ?? null,
      brand: brandName.get(p.brand_company_id) ?? null,
      mpn: p.mpn ?? null,
      barcode: p.barcode ?? null,
      price_gross: grossFromNet(net, pct),
      vat_percent: pct,
      currency: r.currency ?? feed.currency ?? 'EUR',
      in_stock: known.has(String(p.id)) && (onHand.get(String(p.id)) ?? 0) > 0,
      quantity: known.has(String(p.id)) ? Math.max(0, Math.trunc(onHand.get(String(p.id)) ?? 0)) : null,
      weight_kg: p.net_mass_kg ?? null,
    };
  });

  // Only a COUNTED zero is withheld. A product nobody has stocked is on order, not absent —
  // dropping those empties the feed for any catalogue that is sold to order.
  const listed = feed.include_out_of_stock
    ? products
    : products.filter((p) => stockState(p) !== 'out_of_stock');

  const now = new Date();
  const body = feed.format === 'skroutz'
    ? renderSkroutzFeed(listed, now)
    : feed.format === 'bestprice'
      ? renderBestPriceFeed(listed, now)
      : renderGoogleFeed(listed, { title: `${ws?.name ?? 'Catalogue'} — ${feed.name}`, link: storeUrl });

  const gzip = (req.headers.get('accept-encoding') ?? '').includes('gzip')
    && new Blob([body]).size > 512 * 1024;

  const gaps = gapSummary(feed.format, listed);
  if (unpriced > 0) gaps.byAttribute.price = (gaps.byAttribute.price ?? 0) + unpriced;
  await supabase.rpc('bump_product_feed_fetch', {
    p_feed_id: feed.id,
    p_item_count: listed.length,
    p_gap_count: gaps.count + unpriced,
    p_gaps: gaps.byAttribute,
  });

  return xml(body, gzip);
}));
