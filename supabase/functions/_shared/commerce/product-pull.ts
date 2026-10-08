/** A merchant's store product, in the one shape the products pull writes from (#474). Import-free. */

export interface PulledVariant {
  variantId: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
}

export interface PulledProduct {
  externalProductId: string;
  name: string;
  description: string | null;
  url: string | null;
  images: string[];
  variants: PulledVariant[];
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s ? s : null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function htmlToText(html: unknown, max = 5000): string | null {
  if (typeof html !== 'string' || !html.trim()) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
  return text ? text.slice(0, max) : null;
}

export function fromShopifyProduct(p: Row, storeUrl: string): PulledProduct | null {
  const id = str(p.id);
  const name = str(p.title);
  if (!id || !name) return null;
  const handle = str(p.handle);
  const images = (Array.isArray(p.images) ? p.images as Row[] : [])
    .map((i) => str(i.src)).filter((u): u is string => !!u && u.startsWith('https://'));
  const variants = (Array.isArray(p.variants) ? p.variants as Row[] : []).map((v) => ({
    variantId: str(v.id), sku: str(v.sku), barcode: str(v.barcode), price: num(v.price),
  }));
  return {
    externalProductId: id,
    name: name.slice(0, 300),
    description: htmlToText(p.body_html),
    url: handle ? `${storeUrl.replace(/\/+$/, '')}/products/${handle}` : null,
    images,
    variants: variants.length ? variants : [{ variantId: null, sku: null, barcode: null, price: null }],
  };
}

export function fromWooProduct(p: Row): PulledProduct | null {
  const id = str(p.id);
  const name = str(p.name);
  if (!id || !name) return null;
  const images = (Array.isArray(p.images) ? p.images as Row[] : [])
    .map((i) => str(i.src)).filter((u): u is string => !!u && u.startsWith('https://'));
  const gtin = (Array.isArray(p.meta_data) ? p.meta_data as Row[] : [])
    .find((m) => /(^|_)(gtin|ean|barcode)$/i.test(String(m.key ?? '')));
  return {
    externalProductId: id,
    name: name.slice(0, 300),
    description: htmlToText(p.description) ?? htmlToText(p.short_description),
    url: str(p.permalink),
    images,
    variants: [{ variantId: null, sku: str(p.sku), barcode: str(gtin?.value), price: num(p.price ?? p.regular_price) }],
  };
}

export function netPrice(price: number | null, taxesIncluded: boolean, vatRatePercent: number): number | null {
  if (price === null) return null;
  const net = taxesIncluded ? price / (1 + Math.max(0, vatRatePercent) / 100) : price;
  return Math.round(net * 10000) / 10000;
}
