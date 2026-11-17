// deno-lint-ignore-file no-explicit-any
/**
 * Kyero XML → import rows. Split from `real-estate-import.ts` on purpose: that module holds the
 * validation and coercion rules and must stay dependency-free so `tests/unit/listingImport.test.ts`
 * can import it directly. This half pulls in fast-xml-parser from esm.sh, which a Node test runner
 * cannot resolve — keeping them together would mean the validation rules had no unit test at all.
 */
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.5.0';

/** Kyero <property> → our field names. Kyero is what we already emit, so this closes the loop. */
export function parseKyeroXml(xml: string): Record<string, unknown>[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });
  const doc = parser.parse(xml);
  const root = doc?.root ?? doc?.kyero ?? doc;
  const raw = root?.property;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const text = (v: any): string => {
    if (v == null) return '';
    if (typeof v === 'object') return String(v['#text'] ?? v.en ?? v.el ?? Object.values(v)[0] ?? '');
    return String(v);
  };

  return list.map((p: any) => ({
    reference_code: text(p.ref) || undefined,
    property_type: mapKyeroType(text(p.type)),
    transaction_type: text(p.price_freq) && text(p.price_freq) !== 'sale' ? 'rent' : 'sale',
    price: text(p.price) || undefined,
    currency: text(p.currency) || 'EUR',
    town: text(p.town) || undefined,
    region: text(p.province) || undefined,
    country_code: text(p.country) || undefined,
    postcode: text(p.postcode) || undefined,
    lat: text(p.location?.latitude) || undefined,
    lng: text(p.location?.longitude) || undefined,
    bedrooms: text(p.beds) || undefined,
    bathrooms: text(p.baths) || undefined,
    area_built: text(p.surface_area?.built) || undefined,
    plot_area: text(p.surface_area?.plot) || undefined,
    year_built: text(p.new_build) === '1' ? undefined : undefined,
    energy_class: text(p.energy_rating?.consumption) || undefined,
    title: text(p.title) || text(p.desc?.en)?.slice(0, 120) || undefined,
    description_en: text(p.desc?.en) || undefined,
    description_el: text(p.desc?.el) || undefined,
    features: Array.isArray(p.features?.feature) ? p.features.feature.map(text).join('|') : text(p.features?.feature) || undefined,
  }));
}

/** Kyero's type vocabulary is free-ish text; fold it into our four categories. */
function mapKyeroType(t: string): string {
  const s = (t || '').toLowerCase();
  if (/land|plot|terrain|finca/.test(s)) return 'land';
  if (/commercial|office|shop|retail|warehouse|business|hotel/.test(s)) return 'commercial';
  if (!s) return 'residential';
  return 'residential';
}
