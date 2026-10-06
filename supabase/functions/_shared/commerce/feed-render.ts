export interface FeedProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  link: string;
  image: string | null;
  category: string | null;
  brand: string | null;
  mpn: string | null;
  barcode: string | null;
  price_gross: number;
  vat_percent: number;
  currency: string;
  in_stock: boolean;
  quantity: number | null;
  weight_kg: number | null;
}

export function escapeXml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function stripHtml(v: string | null | undefined, max = 10000): string {
  return String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export type StockState = 'in_stock' | 'on_order' | 'out_of_stock';

/**
 * A product with NO warehouse row is not out of stock — nobody has counted it. Most of a
 * supplier catalogue is made to order, so collapsing the two drops the whole catalogue from
 * the feed and reports the same 200 either way.
 */
export function stockState(p: FeedProduct): StockState {
  if (p.quantity === null) return 'on_order';
  return p.quantity > 0 ? 'in_stock' : 'out_of_stock';
}

function availability(p: FeedProduct): string {
  return stockState(p) === 'in_stock' ? 'Άμεσα διαθέσιμο' : 'Κατόπιν παραγγελίας';
}

const GOOGLE_AVAILABILITY: Record<StockState, string> = {
  in_stock: 'in stock', on_order: 'backorder', out_of_stock: 'out of stock',
};

export function renderGoogleFeed(products: readonly FeedProduct[], meta: { title: string; link: string }): string {
  const items = products.map((p) => `    <item>
      <g:id>${escapeXml(p.sku ?? p.id)}</g:id>
      <title>${escapeXml(p.name)}</title>
      <description>${escapeXml(stripHtml(p.description, 5000))}</description>
      <link>${escapeXml(p.link)}</link>
      ${p.image ? `<g:image_link>${escapeXml(p.image)}</g:image_link>` : ''}
      <g:availability>${GOOGLE_AVAILABILITY[stockState(p)]}</g:availability>
      <g:price>${money(p.price_gross)} ${escapeXml(p.currency)}</g:price>
      ${p.brand ? `<g:brand>${escapeXml(p.brand)}</g:brand>` : ''}
      ${p.mpn ? `<g:mpn>${escapeXml(p.mpn)}</g:mpn>` : ''}
      ${p.barcode ? `<g:gtin>${escapeXml(p.barcode)}</g:gtin>` : ''}
      ${!p.mpn && !p.barcode ? '<g:identifier_exists>no</g:identifier_exists>' : ''}
      ${p.category ? `<g:product_type>${escapeXml(p.category)}</g:product_type>` : ''}
      <g:condition>new</g:condition>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(meta.link)}</link>
    <description>${escapeXml(meta.title)}</description>
${items}
  </channel>
</rss>`;
}

export function renderSkroutzFeed(products: readonly FeedProduct[], now: Date): string {
  const created = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)}`;
  const items = products.map((p) => `    <product>
      <id>${escapeXml(p.sku ?? p.id)}</id>
      <name>${escapeXml(p.name)}</name>
      <link>${escapeXml(p.link)}</link>
      <image>${escapeXml(p.image ?? '')}</image>
      <category>${escapeXml(p.category ?? '')}</category>
      <price_with_vat>${money(p.price_gross)}</price_with_vat>
      <vat>${money(p.vat_percent)}</vat>
      <manufacturer>${escapeXml(p.brand ?? '')}</manufacturer>
      <mpn>${escapeXml(p.mpn ?? '')}</mpn>
      <ean>${escapeXml(p.barcode ?? '')}</ean>
      <availability>${availability(p)}</availability>
${p.quantity === null ? '' : `      <quantity>${p.quantity}</quantity>\n`}      <description>${escapeXml(stripHtml(p.description, 10000))}</description>
${p.weight_kg ? `      <weight>${money(p.weight_kg)}</weight>\n` : ''}    </product>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mywebstore>
  <created_at>${created}</created_at>
  <products>
${items}
  </products>
</mywebstore>`;
}

export function renderBestPriceFeed(products: readonly FeedProduct[], now: Date): string {
  const created = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)}`;
  const items = products.map((p) => `    <product>
      <productId>${escapeXml(p.sku ?? p.id)}</productId>
      <title>${escapeXml(p.name)}</title>
      <productURL>${escapeXml(p.link)}</productURL>
      <imageURL>${escapeXml(p.image ?? '')}</imageURL>
      <category_path>${escapeXml(p.category ?? '')}</category_path>
      <price>${money(p.price_gross)}</price>
      <brand>${escapeXml(p.brand ?? '')}</brand>
      <mpn>${escapeXml(p.mpn ?? '')}</mpn>
${p.barcode ? `      <ean>${escapeXml(p.barcode)}</ean>\n` : ''}      <availability>${availability(p)}</availability>
${p.quantity === null ? '' : `      <stock>${p.quantity > 0 ? 'Y' : 'N'}</stock>\n`}${p.weight_kg ? `      <weight>${money(p.weight_kg)}</weight>\n` : ''}    </product>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<store>
  <date>${created}</date>
  <products>
${items}
  </products>
</store>`;
}

export function feedGaps(format: string, p: FeedProduct): string[] {
  if (format !== 'skroutz' && format !== 'bestprice') return [];
  const missing: string[] = [];
  if (!p.name) missing.push('name');
  if (!p.image) missing.push('image');
  if (!p.category) missing.push('category');
  if (!p.brand) missing.push(format === 'skroutz' ? 'manufacturer' : 'brand');
  if (!p.mpn) missing.push('mpn');
  if (!(p.price_gross > 0)) missing.push('price');
  if (format === 'skroutz') {
    if (!p.barcode) missing.push('ean');
    if (!p.description) missing.push('description');
  }
  return missing;
}

export function gapSummary(
  format: string,
  products: readonly FeedProduct[],
): { count: number; byAttribute: Record<string, number> } {
  const byAttribute: Record<string, number> = {};
  let count = 0;
  for (const p of products) {
    const gaps = feedGaps(format, p);
    if (gaps.length === 0) continue;
    count += 1;
    for (const g of gaps) byAttribute[g] = (byAttribute[g] ?? 0) + 1;
  }
  return { count, byAttribute };
}
