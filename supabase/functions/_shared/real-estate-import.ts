import { PROPERTY_TYPES as SHARED_PROPERTY_TYPES } from './realEstateVocabulary.generated.ts';
// deno-lint-ignore-file no-explicit-any
/**
 * Listing import — the onboarding path (#281).
 *
 * Syndication is pull-OUT only in all three formats, so an agency arriving with 300 listings had to
 * retype them. That is the practical blocker to selling the module, and nothing else on the backlog
 * matters to a prospect who cannot get their book in.
 *
 * Two shapes, one pipeline: tabular rows (CSV, parsed in the browser) and Kyero XML (the format we
 * already emit, so an agency can round-trip out of a portal feed they already have). Both normalise
 * to the same field set and go through the same validation and the same allowlisted write.
 */

/** Field values a row may set. Deliberately a SUBSET of PROPERTY_WRITABLE: an importer should not be
 *  able to reach fields a careful human wouldn't type into a spreadsheet — internal pricing
 *  (`cost_basis`, `min_offer`, `commission_pct`), ownership (`listing_agent_id`), or publish state.
 *  Publish state in particular is set by `publish-property`, which runs the compliance gate. */
export const IMPORT_WRITABLE = [
  'reference_code', 'property_type', 'subtype', 'transaction_type',
  'price', 'currency', 'price_period', 'price_on_request', 'common_charges',
  'country_code', 'region', 'prefecture', 'municipality', 'town', 'postcode', 'lat', 'lng',
  'address', 'street_number', 'hide_exact_address',
  'title', 'features', 'amenities',
  'energy_class', 'electronic_building_id', 'atak', 'heating_type',
  'virtual_tour_url', 'video_url',
  'area_built', 'area_plot', 'plot_area', 'bedrooms', 'rooms', 'bathrooms', 'wc', 'kitchens',
  'living_rooms', 'levels', 'floor', 'floors_total', 'year_built', 'year_renovated', 'condition',
  'furnished', 'orientation', 'balcony_area', 'parking_spaces', 'storage', 'pets_allowed',
  'elevator', 'fireplace', 'garden', 'pool', 'alarm', 'solar_heater', 'security_door',
  'double_glazing', 'has_view', 'is_new_development',
  'gross_area', 'net_area', 'current_use', 'land_use', 'buildable', 'building_coefficient',
  'agent_name', 'agent_phone', 'agent_email', 'agent_website',
] as const;

const NUMERIC = new Set([
  'price', 'common_charges', 'lat', 'lng', 'area_built', 'area_plot', 'plot_area', 'bedrooms',
  'rooms', 'bathrooms', 'wc', 'kitchens', 'living_rooms', 'levels', 'floor', 'floors_total',
  'year_built', 'year_renovated', 'balcony_area', 'parking_spaces', 'gross_area', 'net_area',
  'building_coefficient',
]);
const BOOLEAN = new Set([
  'price_on_request', 'hide_exact_address', 'elevator', 'fireplace', 'garden', 'pool', 'alarm',
  'solar_heater', 'security_door', 'double_glazing', 'has_view', 'is_new_development', 'furnished',
  'storage', 'pets_allowed', 'buildable',
]);
const ARRAY_FIELD = new Set(['features', 'amenities']);

// One source (#391) — the generated mirror. This was the fourth SHAPE of the same fact
// (array, array, union, Set); the Set is rebuilt here from the shared list.
const PROPERTY_TYPES = new Set<string>(SHARED_PROPERTY_TYPES);
const TRANSACTION_TYPES = new Set(['sale', 'rent', 'short_let']);

const truthy = new Set(['1', 'true', 'yes', 'y', 'ναι', 'on']);
const falsy = new Set(['0', 'false', 'no', 'n', 'όχι', 'off', '']);

export interface ImportRowResult {
  row: number;
  reference_code: string | null;
  action: 'created' | 'updated' | 'skipped';
  errors: string[];
  property_id?: string;
}

/** Coerce one incoming cell to the column's type. Returns `undefined` to mean "leave unset" so an
 *  empty spreadsheet cell never overwrites a good value on re-import. */
function coerce(field: string, raw: unknown): unknown | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (s === '') return undefined;

  if (NUMERIC.has(field)) {
    // Tolerate the two shapes a European spreadsheet actually exports: "1.234,56" and "1,234.56".
    const cleaned = s.replace(/\s|€|\$|£/g, '');
    const normalised = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
    const n = Number(normalised);
    return Number.isFinite(n) ? n : undefined;
  }
  if (BOOLEAN.has(field)) {
    const l = s.toLowerCase();
    if (truthy.has(l)) return true;
    if (falsy.has(l)) return false;
    return undefined;
  }
  if (ARRAY_FIELD.has(field)) {
    return s.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
  }
  return s;
}

/**
 * Normalise one incoming record to a validated payload. Builds an ALLOWLISTED object field by field
 * — never spreads the input (invariant 8: a spread here would let a crafted CSV column set
 * `workspace_id`, `commission_pct` or `is_public`).
 */
export function normaliseImportRow(input: Record<string, unknown>): { payload: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const payload: Record<string, unknown> = {};

  for (const field of IMPORT_WRITABLE) {
    const v = coerce(field, input[field]);
    if (v !== undefined) payload[field] = v;
  }

  // Bilingual description: two friendly columns collapse into the i18n jsonb the module stores.
  const en = String(input['description_en'] ?? input['description'] ?? '').trim();
  const el = String(input['description_el'] ?? '').trim();
  if (en || el) {
    const i18n: Record<string, string> = {};
    if (en) i18n.en = en;
    if (el) i18n.el = el;
    payload.description_i18n = i18n;
  }

  const pt = String(payload.property_type ?? '').toLowerCase();
  if (!pt) errors.push('property_type is required');
  else if (!PROPERTY_TYPES.has(pt)) errors.push(`property_type "${pt}" is not one of ${[...PROPERTY_TYPES].join(', ')}`);
  else payload.property_type = pt;

  const tt = String(payload.transaction_type ?? '').toLowerCase();
  if (!tt) errors.push('transaction_type is required');
  else if (!TRANSACTION_TYPES.has(tt)) errors.push(`transaction_type "${tt}" is not one of ${[...TRANSACTION_TYPES].join(', ')}`);
  else payload.transaction_type = tt;

  if (!payload.title && !payload.description_i18n) errors.push('title or a description is required');
  if (payload.price == null && payload.price_on_request !== true) {
    errors.push('price is required (or set price_on_request)');
  }
  if (payload.energy_class) {
    const ec = String(payload.energy_class).toUpperCase();
    // GR/EU energy classes. A junk value here would sail through the publish gate, which only
    // checks that the field is non-empty.
    if (!/^(A\+{0,3}|[B-H])$/.test(ec)) errors.push(`energy_class "${payload.energy_class}" is not a valid class`);
    else payload.energy_class = ec;
  }

  return { payload, errors };
}
