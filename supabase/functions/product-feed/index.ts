import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { grossFromNet } from '../_shared/money.ts';
import { vatPctForCat } from '../_shared/vatVocabulary.generated.ts';
import { imageFromMetadata } from '../_shared/product-media.ts';
import {
  renderGoogleFeed, renderSkroutzFeed, escapeXml, type FeedProduct,
} from '../_shared/commerce/feed-render.ts';

const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

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

  const { data: ws } = await supabase.from('workspaces').select('slug, name').eq('id', feed.workspace_id).maybeSingle();
  const { data: fs } = await supabase.from('finance_settings')
    .select('default_vat_rate').eq('workspace_id', feed.workspace_id).maybeSingle();
  const fallbackVat = Number(fs?.default_vat_rate ?? 24);

  let q = supabase.from('product_prices')
    .select('product_id, list_price, currency, product:products(id, name, description, sku, external_sku, barcode, '
      + 'metadata, category_id, brand_company_id, mydata_vat_category, net_mass_kg, mpn, status)')
    .eq('workspace_id', feed.workspace_id);
  if (feed.only_storefront_published) q = q.eq('storefront_published', true);
  const { data: priceRows } = await q.limit(5000);

  const sel = (feed.selection ?? {}) as { mode?: string; ids?: string[] };
  const wanted = new Set((sel.ids ?? []).map(String));

  const rows = (priceRows ?? []).filter((r: Record<string, any>) => {
    const p = r.product;
    if (!p || p.status === 'archived') return false;
    if (sel.mode === 'products') return wanted.has(String(p.id));
    if (sel.mode === 'category') return wanted.has(String(p.category_id ?? ''));
    return true;
  });

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
  const onHand = new Map<string, number>();
  const known = new Set<string>();
  if (productIds.length) {
    const { data: stock } = await supabase.from('warehouse_items')
      .select('product_id, qty_on_hand, qty_reserved, is_active')
      .eq('workspace_id', feed.workspace_id)
      .in('product_id', productIds);
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
    const pct = p.mydata_vat_category != null ? vatPctForCat(p.mydata_vat_category, fallbackVat) : fallbackVat;
    const net = Number(r.list_price ?? 0);
    return {
      id: String(p.id),
      sku: p.external_sku ?? p.sku ?? null,
      name: String(p.name ?? ''),
      description: p.description ?? null,
      link: `${storeUrl}?product=${encodeURIComponent(p.id)}`,
      image: imageFromMetadata(p.metadata),
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

  const listed = feed.include_out_of_stock ? products : products.filter((p) => p.in_stock);

  const body = feed.format === 'skroutz'
    ? renderSkroutzFeed(listed, new Date())
    : renderGoogleFeed(listed, { title: `${ws?.name ?? 'Catalogue'} — ${feed.name}`, link: storeUrl });

  const gzip = (req.headers.get('accept-encoding') ?? '').includes('gzip')
    && new Blob([body]).size > 512 * 1024;

  await supabase.rpc('bump_product_feed_fetch', { p_feed_id: feed.id, p_item_count: listed.length });

  return xml(body, gzip);
}));
