/** A product read off its own web page: schema.org Product JSON-LD first, Open Graph second (#474). */

export interface PageProduct {
  name: string | null;
  description: string | null;
  images: string[];
  sku: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  source: 'json-ld' | 'open-graph' | 'none';
}

type Obj = Record<string, unknown>;

const text = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s || null;
};

const isType = (o: Obj, t: string) => {
  const ty = o['@type'];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
};

function findProduct(node: unknown, depth = 0): Obj | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const o = node as Obj;
  if (isType(o, 'Product') || isType(o, 'ProductGroup')) return o;
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) {
    const hit = findProduct(o[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

const imagesOf = (v: unknown): string[] => {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return list
    .map((i) => (typeof i === 'string' ? i : text((i as Obj)?.url) ?? text((i as Obj)?.contentUrl)))
    .filter((u): u is string => !!u && /^https:\/\//.test(u))
    .slice(0, 8);
};

const CM_PER_UNIT: Record<string, number> = { CMT: 1, MMT: 0.1, MTR: 100, INH: 2.54, cm: 1, mm: 0.1, m: 100, in: 2.54 };

function lengthCm(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d+(?:[.,]\d+)?)\s*(cm|mm|m|in)?$/i);
    if (!m) return null;
    return Number(m[1].replace(',', '.')) * (CM_PER_UNIT[(m[2] ?? 'cm').toLowerCase()] ?? 1);
  }
  const o = v as Obj;
  const n = Number(o.value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * (CM_PER_UNIT[String(o.unitCode ?? o.unitText ?? 'CMT')] ?? 1);
}

function offerOf(v: unknown): { price: number | null; currency: string | null } {
  const offers = Array.isArray(v) ? v : v ? [v] : [];
  for (const raw of offers) {
    const o = raw as Obj;
    const p = Number(o.price ?? o.lowPrice ?? (o.priceSpecification as Obj | undefined)?.price);
    if (Number.isFinite(p) && p >= 0) {
      return { price: p, currency: text(o.priceCurrency ?? (o.priceSpecification as Obj | undefined)?.priceCurrency) };
    }
  }
  return { price: null, currency: null };
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() || null : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export function parseProductPage(html: string, pageUrl: string): PageProduct {
  const empty: PageProduct = {
    name: null, description: null, images: [], sku: null, gtin: null, mpn: null, brand: null,
    price: null, currency: null, url: pageUrl, widthCm: null, heightCm: null, depthCm: null, source: 'none',
  };

  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const p = findProduct(data);
    if (!p) continue;
    const variant = Array.isArray(p.hasVariant) ? p.hasVariant[0] as Obj : null;
    const offer = offerOf(p.offers ?? variant?.offers);
    const brand = p.brand && typeof p.brand === 'object' ? text((p.brand as Obj).name) : text(p.brand);
    return {
      name: text(p.name),
      description: text(p.description)?.slice(0, 5000) ?? null,
      images: imagesOf(p.image ?? variant?.image),
      sku: text(p.sku ?? variant?.sku),
      gtin: text(p.gtin13 ?? p.gtin ?? p.gtin14 ?? p.gtin12 ?? p.gtin8 ?? variant?.gtin13 ?? variant?.gtin),
      mpn: text(p.mpn),
      brand,
      price: offer.price,
      currency: offer.currency,
      url: text(p.url) && /^https:\/\//.test(String(p.url)) ? String(p.url) : pageUrl,
      widthCm: lengthCm(p.width),
      heightCm: lengthCm(p.height),
      depthCm: lengthCm(p.depth),
      source: 'json-ld',
    };
  }

  const title = meta(html, 'og:title');
  if (!title) return empty;
  const amount = Number(meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'));
  const image = meta(html, 'og:image');
  return {
    ...empty,
    name: title,
    description: meta(html, 'og:description'),
    images: image && /^https:\/\//.test(image) ? [image] : [],
    price: Number.isFinite(amount) && amount >= 0 ? amount : null,
    currency: meta(html, 'product:price:currency') ?? meta(html, 'og:price:currency'),
    url: meta(html, 'og:url') ?? pageUrl,
    source: 'open-graph',
  };
}
